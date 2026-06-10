import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptGroupInvite,
  acceptMessageRequest,
  blockUser,
  createDirectConversation,
  createGroupConversation,
  declineMessageRequest,
  deleteConversation,
  editMessage,
  getConversationMedia,
  getGroupDetails,
  getMessages,
  getPendingInvitations,
  getUnreadCounts,
  inviteMembers,
  listBlockedUsers,
  setConversationMuted,
  unblockUser,
  leaveGroup,
  listContacts,
  listConversations,
  listMessageRequests,
  listNotifications,
  markAllNotificationsRead,
  markConversationRead,
  markNotificationRead,
  rejectGroupInvite,
  removeContact,
  removeGroupMember,
  requestJoinGroup,
  searchGroups,
  searchUsers,
  sendContactRequest,
  updateGroup,
  sendMessageRest,
  uploadImage,
  API_URL,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ChatContext, type ChatCtx } from "@/lib/chat-context";
import { isOnline } from "@/lib/format";
import { playNotificationSound } from "@/lib/sounds";
import { nexTalkSocket } from "@/lib/ws";
import { toast } from "sonner";
import type {
  AppNotification,
  BlockedUser,
  Contact,
  Conversation,
  GroupDetails,
  GroupSearchResult,
  MediaItem,
  Message,
  MessageRequest,
  PendingInvitation,
  UserLite,
} from "@/lib/types";

type TypingState = { conversationId: string; userId: string; username?: string };

function enrichConversation(c: Conversation, onlineIds: Set<string>): Conversation {
  const otherOnline = c.type === "direct" && c.other_user
    ? onlineIds.has(c.other_user.id) || isOnline(c.other_user.last_seen)
    : false;
  return { ...c, online: otherOnline };
}

function mergeMessageStatus(
  current?: Message["status"],
  incoming?: Message["status"],
): Message["status"] | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  const rank: Record<Message["status"], number> = { SENT: 0, DELIVERED: 1, READ: 2 };
  return rank[incoming] >= rank[current] ? incoming : current;
}

function upsertMessage(list: Message[], msg: Message): Message[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = {
      ...next[idx],
      ...msg,
      status: mergeMessageStatus(next[idx].status, msg.status),
    };
    return next;
  }
  return [...list, msg].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { idToken, user } = useAuth();
  const qc = useQueryClient();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [typingConvIds, setTypingConvIds] = useState<Set<string>>(new Set());
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [hasMoreMedia, setHasMoreMedia] = useState(false);
  const joinedRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChatOpenRef = useRef<(() => void) | null>(null);
  const pendingConvRef = useRef<Conversation | null>(null);
  const qcRef = useRef(qc);
  const patchUnreadRef = useRef<(convId: string, count?: number) => void>(() => {});
  const patchAllUnreadRef = useRef<(counts: Record<string, number>) => void>(() => {});

  activeIdRef.current = activeId;
  qcRef.current = qc;

  const token = idToken;

  // ── Queries ────────────────────────────────────────────────────────────────

  const convQuery = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => listConversations(token!),
    enabled: !!token,
    refetchInterval: 60_000,
  });

  const requestsQuery = useQuery({
    queryKey: ["message-requests", user?.id],
    queryFn: () => listMessageRequests(token!),
    enabled: !!token,
  });

  const notifQuery = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => listNotifications(token!),
    enabled: !!token,
  });

  const contactsQuery = useQuery({
    queryKey: ["contacts", user?.id],
    queryFn: () => listContacts(token!),
    enabled: !!token,
  });

  const isGroupActive = !!activeId && convQuery.data?.find((c) => c.id === activeId)?.type === "group";

  const groupQuery = useQuery({
    queryKey: ["group-details", activeId],
    queryFn: () => getGroupDetails(token!, activeId!),
    enabled: !!token && isGroupActive,
  });

  const pendingInvitesQuery = useQuery({
    queryKey: ["pending-invitations", activeId],
    queryFn: () => getPendingInvitations(token!, activeId!),
    enabled: !!token && isGroupActive && !!groupQuery.data?.members.some(
      (m) => m.user_id === user?.id && m.role === "admin",
    ),
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", activeId],
    queryFn: async () => {
      const res = await getMessages(token!, activeId!);
      setNextCursor(res.next_cursor);
      setHasMoreMessages(res.has_more);
      return [...res.messages].reverse();
    },
    enabled: !!token && !!activeId,
  });

  const discoverQuery_ = useQuery({
    queryKey: ["user-search", discoverQuery],
    queryFn: () => searchUsers(token!, discoverQuery),
    enabled: !!token && discoverQuery.length >= 1,
  });

  const groupSearchQuery_ = useQuery({
    queryKey: ["group-search", groupSearchQuery],
    queryFn: () => searchGroups(token!, groupSearchQuery),
    enabled: !!token && groupSearchQuery.length >= 1,
  });

  const blockedQuery = useQuery({
    queryKey: ["blocked-users", user?.id],
    queryFn: () => listBlockedUsers(token!),
    enabled: !!token,
  });

  const mediaQuery = useQuery({
    queryKey: ["conversation-media", activeId],
    queryFn: async () => {
      const res = await getConversationMedia(token!, activeId!);
      setMediaCursor(res.next_cursor);
      setHasMoreMedia(res.has_more);
      return res.media;
    },
    enabled: !!token && !!activeId,
  });

  const conversations = useMemo(
    () => (convQuery.data ?? []).map((c) => enrichConversation(c, onlineUserIds)),
    [convQuery.data, onlineUserIds],
  );

  const contactUserIds = useMemo(
    () => new Set((contactsQuery.data ?? []).map((c) => c.user.id)),
    [contactsQuery.data],
  );

  const blockedUserIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((b) => b.user_id)),
    [blockedQuery.data],
  );

  const isGroupAdmin = useMemo(
    () => !!groupQuery.data?.members.some((m) => m.user_id === user?.id && m.role === "admin"),
    [groupQuery.data, user?.id],
  );

  const activeConversation = useMemo(() => {
    const base = conversations.find((c) => c.id === activeId)
      ?? (pendingConvRef.current?.id === activeId ? pendingConvRef.current : null);
    if (!base || base.type !== "group" || !groupQuery.data) return base;
    return {
      ...base,
      members: groupQuery.data.members,
      description: groupQuery.data.description,
      creator_username: groupQuery.data.creator_username,
    };
  }, [conversations, activeId, groupQuery.data]);

  const isMuted = activeConversation?.is_muted ?? false;

  const patchConversationUnread = useCallback(
    (convId: string, count = 0) => {
      qc.setQueryData<Conversation[]>(["conversations", user?.id], (old) =>
        (old ?? []).map((c) => (c.id === convId ? { ...c, unread_count: count } : c)),
      );
    },
    [qc, user?.id],
  );

  const patchAllUnreadCounts = useCallback(
    (counts: Record<string, number>) => {
      qc.setQueryData<Conversation[]>(["conversations", user?.id], (old) =>
        (old ?? []).map((c) => ({ ...c, unread_count: counts[c.id] ?? c.unread_count })),
      );
    },
    [qc, user?.id],
  );

  patchUnreadRef.current = patchConversationUnread;
  patchAllUnreadRef.current = patchAllUnreadCounts;

  // ── WebSocket: connect only when token changes ─────────────────────────────

  useEffect(() => {
    if (!token) {
      nexTalkSocket.disconnect();
      setWsConnected(false);
      return;
    }
    nexTalkSocket.connect(token);
  }, [token]);

  // Sync unread badges when WS is down or on initial load
  useEffect(() => {
    if (!token || wsConnected) return;
    void getUnreadCounts(token)
      .then((counts) => patchAllUnreadRef.current(counts))
      .catch(() => {});
  }, [token, wsConnected]);

  // ── WebSocket: event listener (stable — no disconnect on re-render) ────────

  useEffect(() => {
    const off = nexTalkSocket.on((ev) => {
      if (ev.type === "connected") setWsConnected(true);
      if (ev.type === "disconnected") setWsConnected(false);

      const qc = qcRef.current;

      if (ev.type === "new_message" || ev.type === "message_sent") {
        const msg = ev.message as Message;
        const convId = ev.conversation_id as string;
        qc.setQueryData<Message[]>(["messages", convId], (old) =>
          upsertMessage(old ?? [], msg),
        );
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        if (msg.image_url) {
          void qc.invalidateQueries({ queryKey: ["conversation-media", convId] });
        }
        if (ev.type === "new_message") {
          const muted = qc
            .getQueryData<Conversation[]>(["conversations", user?.id])
            ?.find((c) => c.id === convId)?.is_muted;
          if (!muted) playNotificationSound();
        }
      }

      if (ev.type === "message_edited") {
        const convId = ev.conversation_id as string;
        const edited = ev.message as { id: string; body: string; edited_at?: string };
        qc.setQueryData<Message[]>(["messages", convId], (old) =>
          (old ?? []).map((m) =>
            m.id === edited.id ? { ...m, body: edited.body, edited_at: edited.edited_at ?? m.edited_at } : m,
          ),
        );
      }

      if (ev.type === "presence_updated") {
        const uid = ev.user_id as string;
        const online = ev.online as boolean;
        const lastSeen = ev.last_seen as string | null;
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (online) next.add(uid);
          else next.delete(uid);
          return next;
        });
        qc.setQueryData<Conversation[]>(["conversations", user?.id], (old) =>
          (old ?? []).map((c) =>
            c.type === "direct" && c.other_user?.id === uid
              ? { ...c, other_user: { ...c.other_user, last_seen: lastSeen ?? c.other_user.last_seen }, online }
              : c,
          ),
        );
      }

      if (ev.type === "joined_conversation" || ev.type === "conversation_read") {
        patchUnreadRef.current(ev.conversation_id as string, 0);
      }

      if (ev.type === "unread_count_updated") {
        const counts = ev.counts as Record<string, number>;
        if (counts) patchAllUnreadRef.current(counts);
        else void qc.invalidateQueries({ queryKey: ["conversations"] });
      }

      if (ev.type === "contact_request") {
        toast.info("New contact request", {
          description: `${ev.from_username ?? "Someone"} wants to connect`,
        });
        void qc.invalidateQueries({ queryKey: ["message-requests"] });
        void qc.invalidateQueries({ queryKey: ["notifications"] });
      }

      if (ev.type === "contact_request_accepted" || ev.type === "contact_request_declined") {
        void qc.invalidateQueries({ queryKey: ["message-requests"] });
        void qc.invalidateQueries({ queryKey: ["contacts"] });
        void qc.invalidateQueries({ queryKey: ["notifications"] });
      }

      if (ev.type === "join_request") {
        toast.info("Group join request", {
          description: `${ev.from_username ?? "Someone"} wants to join ${ev.group_name ?? "a group"}`,
        });
        void qc.invalidateQueries({ queryKey: ["notifications"] });
        void qc.invalidateQueries({ queryKey: ["pending-invitations", ev.conversation_id as string] });
        void qc.invalidateQueries({ queryKey: ["group-details", ev.conversation_id as string] });
      }

      if (ev.type === "member_left") {
        const convId = ev.conversation_id as string;
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        void qc.invalidateQueries({ queryKey: ["group-details", convId] });
      }

      if (ev.type === "group_invitation") {
        toast.info("Group invitation", {
          description: "You were invited to join a group",
        });
        void qc.invalidateQueries({ queryKey: ["notifications"] });
      }

      if (ev.type === "notification") {
        playNotificationSound();
        void qc.invalidateQueries({ queryKey: ["notifications"] });
      }

      if (ev.type === "error") {
        const detail = ev.detail;
        toast.error("Connection error", {
          description: typeof detail === "string" ? detail : "Something went wrong",
        });
      }

      if (ev.type === "message_delivered" || ev.type === "message_read") {
        const convId = ev.conversation_id as string;
        const messageId = ev.message_id as string;
        const status = ev.status as Message["status"];
        qc.setQueryData<Message[]>(["messages", convId], (old) =>
          (old ?? []).map((m) =>
            m.id === messageId
              ? { ...m, status: mergeMessageStatus(m.status, status) }
              : m,
          ),
        );
      }

      if (ev.type === "typing_started") {
        const convId = ev.conversation_id as string;
        setTypingConvIds((s) => new Set(s).add(convId));
        setTyping({
          conversationId: convId,
          userId: ev.from as string,
          username: ev.username as string | undefined,
        });
      }
      if (ev.type === "typing_stopped") {
        const convId = ev.conversation_id as string;
        setTypingConvIds((s) => {
          const next = new Set(s);
          next.delete(convId);
          return next;
        });
        setTyping((t) =>
          t?.conversationId === convId && t.userId === ev.from ? null : t,
        );
      }

      if (ev.type === "conversation_deleted") {
        const convId = ev.conversation_id as string;
        if (activeIdRef.current === convId) setActiveId(null);
        void qc.invalidateQueries({ queryKey: ["conversations"] });
      }
    });
    return off;
  }, [user?.id]);

  // Join/leave conversation room once WebSocket is connected
  useEffect(() => {
    if (!activeId || !wsConnected) return;
    if (joinedRef.current && joinedRef.current !== activeId) {
      nexTalkSocket.send({ type: "leave_conversation", conversation_id: joinedRef.current });
    }
    nexTalkSocket.send({ type: "join_conversation", conversation_id: activeId });
    joinedRef.current = activeId;
    return () => {
      if (joinedRef.current === activeId) {
        nexTalkSocket.send({ type: "leave_conversation", conversation_id: activeId });
        joinedRef.current = null;
      }
    };
  }, [activeId, wsConnected]);

  // Mark read via REST when opening a conversation (WS join also marks read)
  useEffect(() => {
    if (!token || !activeId) return;
    void markConversationRead(token, activeId).then(() => {
      patchConversationUnread(activeId, 0);
    }).catch(() => {
      // WS join_conversation handles read when connected
    });
  }, [token, activeId, patchConversationUnread]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (body: string, imageUrl?: string) => {
      if (!activeId || (!body.trim() && !imageUrl)) return;
      if (wsConnected) {
        nexTalkSocket.send({
          type: "send_message",
          conversation_id: activeId,
          body: body.trim() || undefined,
          image_url: imageUrl,
        });
        return;
      }
      if (!token) return;
      void sendMessageRest(token, activeId, {
        body: body.trim() || undefined,
        image_url: imageUrl,
      })
        .then((msg) => {
          qc.setQueryData<Message[]>(["messages", activeId], (old) => upsertMessage(old ?? [], msg));
          void qc.invalidateQueries({ queryKey: ["conversations"] });
        })
        .catch((err) => toast.error((err as ApiError).message ?? "Failed to send message"));
    },
    [activeId, wsConnected, token, qc],
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!activeId) return;
      nexTalkSocket.send({ type: "typing", conversation_id: activeId, is_typing: isTyping });
      if (isTyping) {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          nexTalkSocket.send({ type: "typing", conversation_id: activeId, is_typing: false });
        }, 2800);
      }
    },
    [activeId],
  );

  const uploadAndSendImage = useCallback(
    async (file: File) => {
      if (!token || !activeId) return;
      const { url } = await uploadImage(token, file);
      const full = url.startsWith("http") ? url : `${API_URL.replace(/\/$/, "")}${url}`;
      sendMessage("", full);
    },
    [token, activeId, sendMessage],
  );

  const loadMoreMessages = useCallback(async () => {
    if (!token || !activeId || !nextCursor || !hasMoreMessages) return;
    const res = await getMessages(token, activeId, { before: nextCursor });
    setNextCursor(res.next_cursor);
    setHasMoreMessages(res.has_more);
    qc.setQueryData<Message[]>(["messages", activeId], (old) => {
      const older = [...res.messages].reverse();
      const ids = new Set((old ?? []).map((m) => m.id));
      return [...older.filter((m) => !ids.has(m.id)), ...(old ?? [])];
    });
  }, [token, activeId, nextCursor, hasMoreMessages, qc]);

  const acceptRequestMut = useMutation({
    mutationFn: (id: string) => acceptMessageRequest(token!, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["message-requests"] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Contact request accepted");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to accept request"),
  });

  const declineRequestMut = useMutation({
    mutationFn: (id: string) => declineMessageRequest(token!, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["message-requests"] });
      toast.success("Request declined");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to decline request"),
  });

  const markNotifMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(token!, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllNotifsMut = useMutation({
    mutationFn: () => markAllNotificationsRead(token!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const addContactMut = useMutation({
    mutationFn: (username: string) => sendContactRequest(token!, username),
    onSuccess: () => toast.success("Contact request sent"),
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to send request"),
  });

  const removeContactMut = useMutation({
    mutationFn: (userId: string) => removeContact(token!, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact removed");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to remove contact"),
  });

  const startChatMut = useMutation({
    mutationFn: (userId: string) => createDirectConversation(token!, userId),
    onSuccess: (data, userId) => {
      const peer =
        discoverQuery_.data?.find((u) => u.id === userId)
        ?? contactsQuery.data?.find((c) => c.user.id === userId)?.user;
      const optimistic: Conversation = {
        id: data.id,
        type: "direct",
        other_user: peer ?? { id: userId, username: "Chat" },
        unread_count: 0,
      };
      pendingConvRef.current = optimistic;
      qc.setQueryData<Conversation[]>(["conversations", user?.id], (old) => {
        if (old?.some((c) => c.id === data.id)) return old;
        return [optimistic, ...(old ?? [])];
      });
      setActiveId(data.id);
      onChatOpenRef.current?.();
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to start chat"),
  });

  const createGroupMut = useMutation({
    mutationFn: (data: { name: string; description?: string; participant_ids?: string[] }) =>
      createGroupConversation(token!, data),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      setActiveId(data.id);
      onChatOpenRef.current?.();
      toast.success("Group created");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to create group"),
  });

  const editMessageMut = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) =>
      editMessage(token!, messageId, body),
    onSuccess: () => toast.success("Message updated"),
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to edit message"),
  });

  const joinGroupMut = useMutation({
    mutationFn: (groupId: string) => requestJoinGroup(token!, groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["group-search"] });
      toast.success("Join request sent");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to request join"),
  });

  const leaveGroupMut = useMutation({
    mutationFn: () => leaveGroup(token!, activeId!),
    onSuccess: () => {
      setActiveId(null);
      pendingConvRef.current = null;
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Left group");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to leave group"),
  });

  const removeConvMut = useMutation({
    mutationFn: () => deleteConversation(token!, activeId!),
    onSuccess: () => {
      setActiveId(null);
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation removed");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to remove conversation"),
  });

  const updateGroupMut = useMutation({
    mutationFn: (data: { name?: string; description?: string | null }) =>
      updateGroup(token!, activeId!, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["group-details", activeId] });
      toast.success("Group updated");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to update group"),
  });

  const inviteGroupMut = useMutation({
    mutationFn: (userIds: string[]) => inviteMembers(token!, activeId!, userIds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pending-invitations", activeId] });
      toast.success("Invitations sent");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to invite members"),
  });

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => removeGroupMember(token!, activeId!, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["group-details", activeId] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Member removed");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to remove member"),
  });

  const acceptGroupMut = useMutation({
    mutationFn: (conversationId: string) => acceptGroupInvite(token!, conversationId),
    onSuccess: (_data, conversationId) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      setActiveId(conversationId);
      onChatOpenRef.current?.();
      toast.success("Joined group");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to accept invitation"),
  });

  const rejectGroupMut = useMutation({
    mutationFn: (conversationId: string) => rejectGroupInvite(token!, conversationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Invitation declined");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to decline invitation"),
  });

  const muteMut = useMutation({
    mutationFn: (isMuted: boolean) => setConversationMuted(token!, activeId!, isMuted),
    onSuccess: (data) => {
      qc.setQueryData<Conversation[]>(["conversations", user?.id], (old) =>
        (old ?? []).map((c) => (c.id === activeId ? { ...c, is_muted: data.is_muted } : c)),
      );
      toast.success(data.is_muted ? "Conversation muted" : "Notifications restored");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to update mute"),
  });

  const blockMut = useMutation({
    mutationFn: (userId: string) => blockUser(token!, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blocked-users"] });
      toast.success("User blocked");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to block user"),
  });

  const unblockMut = useMutation({
    mutationFn: (userId: string) => unblockUser(token!, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blocked-users"] });
      toast.success("User unblocked");
    },
    onError: (err) => toast.error((err as ApiError).message ?? "Failed to unblock user"),
  });

  const loadMoreMedia = useCallback(async () => {
    if (!token || !activeId || !mediaCursor || !hasMoreMedia) return;
    const res = await getConversationMedia(token, activeId, { before: mediaCursor });
    setMediaCursor(res.next_cursor);
    setHasMoreMedia(res.has_more);
    qc.setQueryData<MediaItem[]>(["conversation-media", activeId], (old) => {
      const ids = new Set((old ?? []).map((m) => m.id));
      return [...(old ?? []), ...res.media.filter((m) => !ids.has(m.id))];
    });
  }, [token, activeId, mediaCursor, hasMoreMedia, qc]);

  const refreshMedia = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["conversation-media", activeId] });
  }, [qc, activeId]);

  const toggleMute = useCallback(
    () => muteMut.mutateAsync(!isMuted),
    [muteMut, isMuted],
  );

  const editMessageContent = useCallback(
    (messageId: string, body: string) => {
      const convId = activeIdRef.current;
      if (convId) {
        qc.setQueryData<Message[]>(["messages", convId], (old) =>
          (old ?? []).map((m) =>
            m.id === messageId ? { ...m, body, edited_at: new Date().toISOString() } : m,
          ),
        );
      }
      if (wsConnected) {
        nexTalkSocket.send({ type: "edit_message", message_id: messageId, body });
        return Promise.resolve();
      }
      return editMessageMut.mutateAsync({ messageId, body });
    },
    [wsConnected, editMessageMut, qc],
  );

  const registerOnChatOpen = useCallback((fn: () => void) => {
    onChatOpenRef.current = fn;
  }, []);

  const typingInActive = typing?.conversationId === activeId;
  const typingUsername = typing?.username;

  const value = useMemo<ChatCtx>(
    () => ({
      wsConnected,
      conversations,
      conversationsLoading: convQuery.isLoading,
      refreshConversations: () => void qc.invalidateQueries({ queryKey: ["conversations"] }),

      messageRequests: requestsQuery.data ?? [],
      notifications: notifQuery.data?.notifications ?? [],
      notificationUnread: notifQuery.data?.unread_count ?? 0,

      contacts: contactsQuery.data ?? [],
      contactsLoading: contactsQuery.isLoading,
      contactUserIds,

      activeId,
      setActiveId,
      activeConversation,

      messages: messagesQuery.data ?? [],
      messagesLoading: messagesQuery.isLoading,
      hasMoreMessages,
      loadMoreMessages,

      groupDetails: groupQuery.data ?? null,
      groupDetailsLoading: groupQuery.isLoading,
      pendingInvitations: pendingInvitesQuery.data ?? [],
      isGroupAdmin,

      typingInActive,
      typingUsername,
      typingConversationIds: typingConvIds,
      onlineUserIds,

      sendMessage,
      sendTyping,
      uploadAndSendImage,
      editMessageContent,

      groupSearchResults: groupSearchQuery_.data ?? [],
      groupSearchLoading: groupSearchQuery_.isFetching,
      searchGroupsByName: setGroupSearchQuery,
      joinGroupRequest: (id) => joinGroupMut.mutateAsync(id),
      leaveGroupChat: () => leaveGroupMut.mutateAsync(),
      registerOnChatOpen,

      acceptRequest: (id) => acceptRequestMut.mutateAsync(id),
      declineRequest: (id) => declineRequestMut.mutateAsync(id),
      markNotifRead: (id) => markNotifMut.mutateAsync(id),
      markAllNotifsRead: () => markAllNotifsMut.mutateAsync(),

      discoverUsers: discoverQuery_.data ?? [],
      discoverLoading: discoverQuery_.isFetching,
      searchPeople: setDiscoverQuery,
      addContact: (username) => addContactMut.mutateAsync(username).then(() => {}),
      removeContactFromList: (userId) => removeContactMut.mutateAsync(userId),
      startChat: (userId) => startChatMut.mutateAsync(userId).then(() => {}),
      createGroup: (data) => createGroupMut.mutateAsync(data).then((r) => r.id),

      removeConversation: () => removeConvMut.mutateAsync(),
      updateGroupDetails: (data) => updateGroupMut.mutateAsync(data).then(() => {}),
      inviteToGroup: (userIds) => inviteGroupMut.mutateAsync(userIds).then(() => {}),
      removeFromGroup: (userId) => removeMemberMut.mutateAsync(userId).then(() => {}),
      acceptGroupInvitation: (id) => acceptGroupMut.mutateAsync(id),
      rejectGroupInvitation: (id) => rejectGroupMut.mutateAsync(id),

      mediaItems: mediaQuery.data ?? [],
      mediaLoading: mediaQuery.isLoading,
      hasMoreMedia,
      loadMoreMedia,
      refreshMedia,

      toggleMute,
      isMuted,

      blockedUsers: blockedQuery.data ?? [],
      blockedUserIds,
      blockUserById: (userId) => blockMut.mutateAsync(userId),
      unblockUserById: (userId) => unblockMut.mutateAsync(userId),
    }),
    [
      wsConnected,
      conversations,
      convQuery.isLoading,
      requestsQuery.data,
      notifQuery.data,
      contactsQuery.data,
      contactsQuery.isLoading,
      contactUserIds,
      activeId,
      activeConversation,
      messagesQuery.data,
      messagesQuery.isLoading,
      hasMoreMessages,
      loadMoreMessages,
      groupQuery.data,
      groupQuery.isLoading,
      pendingInvitesQuery.data,
      isGroupAdmin,
      typingInActive,
      typingUsername,
      typingConvIds,
      onlineUserIds,
      sendMessage,
      sendTyping,
      uploadAndSendImage,
      editMessageContent,
      groupSearchQuery_.data,
      groupSearchQuery_.isFetching,
      registerOnChatOpen,
      discoverQuery_.data,
      discoverQuery_.isFetching,
      qc,
      acceptRequestMut,
      declineRequestMut,
      markNotifMut,
      markAllNotifsMut,
      addContactMut,
      removeContactMut,
      startChatMut,
      createGroupMut,
      editMessageMut,
      joinGroupMut,
      leaveGroupMut,
      removeConvMut,
      updateGroupMut,
      inviteGroupMut,
      removeMemberMut,
      acceptGroupMut,
      rejectGroupMut,
      mediaQuery.data,
      mediaQuery.isLoading,
      hasMoreMedia,
      loadMoreMedia,
      refreshMedia,
      toggleMute,
      isMuted,
      blockedQuery.data,
      blockedUserIds,
      blockMut,
      unblockMut,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
