import {
  createContext,
  useCallback,
  useContext,
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
  createDirectConversation,
  declineMessageRequest,
  deleteConversation,
  getGroupDetails,
  getMessages,
  listConversations,
  listMessageRequests,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  rejectGroupInvite,
  searchUsers,
  sendContactRequest,
  uploadImage,
  API_URL,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isOnline } from "@/lib/format";
import { nexTalkSocket } from "@/lib/ws";
import type {
  AppNotification,
  Conversation,
  GroupDetails,
  Message,
  MessageRequest,
  UserLite,
} from "@/lib/types";

type TypingState = { conversationId: string; userId: string; username?: string };

type ChatCtx = {
  wsConnected: boolean;
  conversations: Conversation[];
  conversationsLoading: boolean;
  refreshConversations: () => void;

  messageRequests: MessageRequest[];
  notifications: AppNotification[];
  notificationUnread: number;

  activeId: string | null;
  setActiveId: (id: string | null) => void;
  activeConversation: Conversation | null;

  messages: Message[];
  messagesLoading: boolean;
  hasMoreMessages: boolean;
  loadMoreMessages: () => void;

  groupDetails: GroupDetails | null;
  groupDetailsLoading: boolean;

  typingInActive: boolean;
  typingUsername?: string;

  sendMessage: (body: string, imageUrl?: string) => void;
  sendTyping: (isTyping: boolean) => void;
  uploadAndSendImage: (file: File) => Promise<void>;

  acceptRequest: (id: string) => Promise<void>;
  declineRequest: (id: string) => Promise<void>;
  markNotifRead: (id: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;

  discoverUsers: UserLite[];
  discoverLoading: boolean;
  searchPeople: (q: string) => void;
  addContact: (username: string) => Promise<void>;
  startChat: (userId: string) => Promise<void>;

  removeConversation: () => Promise<void>;
  acceptGroupInvitation: (conversationId: string) => Promise<void>;
  rejectGroupInvitation: (conversationId: string) => Promise<void>;
};

const Ctx = createContext<ChatCtx | null>(null);

function enrichConversation(c: Conversation): Conversation {
  return {
    ...c,
    online: c.type === "direct" ? isOnline(c.other_user?.last_seen) : false,
  };
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
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const joinedRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  activeIdRef.current = activeId;

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

  const groupQuery = useQuery({
    queryKey: ["group-details", activeId],
    queryFn: () => getGroupDetails(token!, activeId!),
    enabled: !!token && !!activeId && convQuery.data?.find((c) => c.id === activeId)?.type === "group",
  });

  const discoverQuery_ = useQuery({
    queryKey: ["user-search", discoverQuery],
    queryFn: () => searchUsers(token!, discoverQuery),
    enabled: !!token && discoverQuery.length >= 1,
  });

  const conversations = useMemo(
    () => (convQuery.data ?? []).map(enrichConversation),
    [convQuery.data],
  );

  const activeConversation = useMemo(() => {
    const base = conversations.find((c) => c.id === activeId) ?? null;
    if (!base || base.type !== "group" || !groupQuery.data) return base;
    return {
      ...base,
      members: groupQuery.data.members,
      description: groupQuery.data.description,
      creator_username: groupQuery.data.creator_username,
    };
  }, [conversations, activeId, groupQuery.data]);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      nexTalkSocket.disconnect();
      setWsConnected(false);
      return;
    }
    nexTalkSocket.connect(token);
    const off = nexTalkSocket.on((ev) => {
      if (ev.type === "connected") setWsConnected(true);
      if (ev.type === "disconnected") setWsConnected(false);

      if (ev.type === "new_message" || ev.type === "message_sent") {
        const msg = ev.message as Message;
        const convId = ev.conversation_id as string;
        qc.setQueryData<Message[]>(["messages", convId], (old) =>
          upsertMessage(old ?? [], msg),
        );
        void qc.invalidateQueries({ queryKey: ["conversations"] });
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
        setTyping({
          conversationId: ev.conversation_id as string,
          userId: ev.from as string,
          username: ev.username as string | undefined,
        });
      }
      if (ev.type === "typing_stopped") {
        setTyping((t) =>
          t?.conversationId === ev.conversation_id && t.userId === ev.from ? null : t,
        );
      }

      if (
        ev.type === "unread_count_updated" ||
        ev.type === "contact_request" ||
        ev.type === "group_invitation" ||
        ev.type === "notification"
      ) {
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        void qc.invalidateQueries({ queryKey: ["notifications"] });
        void qc.invalidateQueries({ queryKey: ["message-requests"] });
      }

      if (ev.type === "conversation_deleted") {
        const convId = ev.conversation_id as string;
        if (activeIdRef.current === convId) setActiveId(null);
        void qc.invalidateQueries({ queryKey: ["conversations"] });
      }
    });
    return () => {
      off();
      nexTalkSocket.disconnect();
    };
  }, [token, qc]);

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

  // ── Actions ────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (body: string, imageUrl?: string) => {
      if (!activeId || (!body.trim() && !imageUrl)) return;
      nexTalkSocket.send({
        type: "send_message",
        conversation_id: activeId,
        body: body.trim() || undefined,
        image_url: imageUrl,
      });
    },
    [activeId],
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
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const declineRequestMut = useMutation({
    mutationFn: (id: string) => declineMessageRequest(token!, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["message-requests"] }),
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
  });

  const startChatMut = useMutation({
    mutationFn: (userId: string) => createDirectConversation(token!, userId),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      setActiveId(data.id);
    },
  });

  const removeConvMut = useMutation({
    mutationFn: () => deleteConversation(token!, activeId!),
    onSuccess: () => {
      setActiveId(null);
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const acceptGroupMut = useMutation({
    mutationFn: (conversationId: string) => acceptGroupInvite(token!, conversationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const rejectGroupMut = useMutation({
    mutationFn: (conversationId: string) => rejectGroupInvite(token!, conversationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

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

      activeId,
      setActiveId,
      activeConversation,

      messages: messagesQuery.data ?? [],
      messagesLoading: messagesQuery.isLoading,
      hasMoreMessages,
      loadMoreMessages,

      groupDetails: groupQuery.data ?? null,
      groupDetailsLoading: groupQuery.isLoading,

      typingInActive,
      typingUsername,

      sendMessage,
      sendTyping,
      uploadAndSendImage,

      acceptRequest: (id) => acceptRequestMut.mutateAsync(id),
      declineRequest: (id) => declineRequestMut.mutateAsync(id),
      markNotifRead: (id) => markNotifMut.mutateAsync(id),
      markAllNotifsRead: () => markAllNotifsMut.mutateAsync(),

      discoverUsers: discoverQuery_.data ?? [],
      discoverLoading: discoverQuery_.isFetching,
      searchPeople: setDiscoverQuery,
      addContact: (username) => addContactMut.mutateAsync(username),
      startChat: (userId) => startChatMut.mutateAsync(userId).then(() => {}),

      removeConversation: () => removeConvMut.mutateAsync(),
      acceptGroupInvitation: (id) => acceptGroupMut.mutateAsync(id),
      rejectGroupInvitation: (id) => rejectGroupMut.mutateAsync(id),
    }),
    [
      wsConnected,
      conversations,
      convQuery.isLoading,
      requestsQuery.data,
      notifQuery.data,
      activeId,
      activeConversation,
      messagesQuery.data,
      messagesQuery.isLoading,
      hasMoreMessages,
      loadMoreMessages,
      groupQuery.data,
      groupQuery.isLoading,
      typingInActive,
      typingUsername,
      sendMessage,
      sendTyping,
      uploadAndSendImage,
      discoverQuery_.data,
      discoverQuery_.isFetching,
      qc,
      acceptRequestMut,
      declineRequestMut,
      markNotifMut,
      markAllNotifsMut,
      addContactMut,
      startChatMut,
      removeConvMut,
      acceptGroupMut,
      rejectGroupMut,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChat must be used within <ChatProvider>");
  return ctx;
}
