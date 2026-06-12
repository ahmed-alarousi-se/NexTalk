import type {
  AppNotification,
  BlockedUser,
  CallHistoryItem,
  Contact,
  Conversation,
  GroupDetails,
  GroupSearchResult,
  MediaItem,
  Message,
  MessageRequest,
  PendingInvitation,
  PrivacySettings,
  UserLite,
} from "@/lib/types";

function normalizeApiUrl(raw: string | undefined): string {
  const fallback = "http://localhost:8000";
  const value = raw?.trim();
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  return `https://${value.replace(/\/$/, "")}`;
}

export const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);

export type ApiUser = {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  auth_provider: string;
  created_at: string;
  last_seen: string | null;
  show_last_seen?: boolean;
  read_receipts_enabled?: boolean;
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null; json?: boolean } = {},
): Promise<T> {
  const { token, headers, json = true, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // ignore
    }
    throw new ApiError(response.status, detail || `Request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ── Auth & Users ───────────────────────────────────────────────────────────────

export async function syncUser(token: string, username?: string): Promise<ApiUser> {
  return request<ApiUser>("/api/v1/auth/sync", {
    method: "POST",
    token,
    body: JSON.stringify({ username: username ?? null }),
  });
}

export async function deleteAccount(token: string): Promise<void> {
  return request<void>("/api/v1/auth/me", { method: "DELETE", token });
}

export async function getMe(token: string): Promise<ApiUser> {
  return request<ApiUser>("/api/v1/users/me", { token });
}

export async function updateMe(
  token: string,
  data: {
    username?: string;
    avatar_url?: string | null;
    email?: string;
    show_last_seen?: boolean;
    read_receipts_enabled?: boolean;
  },
): Promise<ApiUser> {
  return request<ApiUser>("/api/v1/users/me", { method: "PATCH", token, body: JSON.stringify(data) });
}

export async function listBlockedUsers(token: string): Promise<BlockedUser[]> {
  const res = await request<{ blocks: BlockedUser[] }>("/api/v1/users/blocks", { token });
  return res.blocks;
}

export async function blockUser(token: string, userId: string): Promise<void> {
  await request("/api/v1/users/blocks", {
    method: "POST",
    token,
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function unblockUser(token: string, userId: string): Promise<void> {
  await request(`/api/v1/users/blocks/${userId}`, { method: "DELETE", token });
}

export async function searchUsers(token: string, q: string): Promise<UserLite[]> {
  const res = await request<{ results: UserLite[] }>(
    `/api/v1/users/search?q=${encodeURIComponent(q)}`,
    { token },
  );
  return res.results;
}

// ── Contacts ───────────────────────────────────────────────────────────────────

export async function listContacts(token: string): Promise<Contact[]> {
  const res = await request<{ contacts: Contact[] }>("/api/v1/contacts", { token });
  return res.contacts;
}

export async function sendContactRequest(token: string, username: string): Promise<{ request_id: string }> {
  const res = await request<{ detail: string; request_id: string }>("/api/v1/contacts", {
    method: "POST",
    token,
    body: JSON.stringify({ username }),
  });
  return { request_id: res.request_id };
}

export async function searchContacts(token: string, q: string): Promise<UserLite[]> {
  const res = await request<{ results: UserLite[] }>(
    `/api/v1/contacts/search?q=${encodeURIComponent(q)}`,
    { token },
  );
  return res.results;
}

export async function removeContact(token: string, contactUserId: string): Promise<void> {
  await request(`/api/v1/contacts/${contactUserId}`, { method: "DELETE", token });
}

// ── Message Requests ───────────────────────────────────────────────────────────

export async function listMessageRequests(token: string): Promise<MessageRequest[]> {
  const res = await request<{ requests: MessageRequest[] }>("/api/v1/message-requests", { token });
  return res.requests;
}

export async function acceptMessageRequest(token: string, requestId: string): Promise<void> {
  await request(`/api/v1/message-requests/${requestId}/accept`, { method: "POST", token });
}

export async function declineMessageRequest(token: string, requestId: string): Promise<void> {
  await request(`/api/v1/message-requests/${requestId}/decline`, { method: "POST", token });
}

// ── Conversations ──────────────────────────────────────────────────────────────

export async function listConversations(token: string): Promise<Conversation[]> {
  const res = await request<{ conversations: Conversation[] }>("/api/v1/conversations", { token });
  return res.conversations;
}

export async function getCallHistory(token: string): Promise<CallHistoryItem[]> {
  const res = await request<{ items: CallHistoryItem[] }>("/api/v1/conversations/calls/history", { token });
  return res.items;
}

export async function getUnreadCounts(token: string): Promise<Record<string, number>> {
  const res = await request<{ counts: Record<string, number> }>("/api/v1/conversations/unread-counts", { token });
  return res.counts;
}

export async function searchGroups(token: string, q: string): Promise<GroupSearchResult[]> {
  const res = await request<{ groups: GroupSearchResult[] }>(
    `/api/v1/conversations/search?q=${encodeURIComponent(q)}`,
    { token },
  );
  return res.groups;
}

export async function requestJoinGroup(token: string, conversationId: string): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}/join-request`, { method: "POST", token });
}

export async function leaveGroup(token: string, conversationId: string): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}/leave`, { method: "POST", token });
}

export async function createDirectConversation(token: string, participantId: string): Promise<{ id: string }> {
  return request<{ id: string; type: string }>("/api/v1/conversations", {
    method: "POST",
    token,
    body: JSON.stringify({ type: "direct", participant_id: participantId }),
  });
}

export async function createGroupConversation(
  token: string,
  data: { name: string; description?: string; participant_ids?: string[] },
): Promise<{ id: string }> {
  return request("/api/v1/conversations", {
    method: "POST",
    token,
    body: JSON.stringify({ type: "group", ...data }),
  });
}

export async function getMessages(
  token: string,
  conversationId: string,
  opts?: { limit?: number; before?: string },
): Promise<{ messages: Message[]; has_more: boolean; next_cursor: string | null }> {
  const params = new URLSearchParams({ limit: String(opts?.limit ?? 30) });
  if (opts?.before) params.set("before", opts.before);
  const res = await request<{
    messages: Message[];
    pagination: { has_more: boolean; next_cursor: string | null };
  }>(`/api/v1/conversations/${conversationId}/messages?${params}`, { token });
  return { messages: res.messages, has_more: res.pagination.has_more, next_cursor: res.pagination.next_cursor };
}

export async function markConversationRead(token: string, conversationId: string): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}/read`, { method: "POST", token });
}

export async function deleteConversation(token: string, conversationId: string): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}`, { method: "DELETE", token });
}

export async function getGroupDetails(token: string, conversationId: string): Promise<GroupDetails> {
  return request<GroupDetails>(`/api/v1/conversations/${conversationId}/details`, { token });
}

export async function acceptGroupInvite(token: string, conversationId: string): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}/invite/accept`, { method: "POST", token });
}

export async function rejectGroupInvite(token: string, conversationId: string): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}/invite/reject`, { method: "POST", token });
}

export async function updateGroup(
  token: string,
  conversationId: string,
  data: { name?: string; description?: string | null },
): Promise<{ id: string; name: string; description?: string | null }> {
  return request(`/api/v1/conversations/${conversationId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export async function inviteMembers(token: string, conversationId: string, userIds: string[]): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}/invite`, {
    method: "POST",
    token,
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function getPendingInvitations(token: string, conversationId: string): Promise<PendingInvitation[]> {
  const res = await request<{ invitations: PendingInvitation[] }>(
    `/api/v1/conversations/${conversationId}/pending-invitations`,
    { token },
  );
  return res.invitations;
}

export async function addGroupMember(token: string, conversationId: string, userId: string): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}/members`, {
    method: "POST",
    token,
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function removeGroupMember(token: string, conversationId: string, userId: string): Promise<void> {
  await request(`/api/v1/conversations/${conversationId}/members/${userId}`, { method: "DELETE", token });
}

export async function setConversationMuted(
  token: string,
  conversationId: string,
  isMuted: boolean,
): Promise<{ is_muted: boolean }> {
  return request(`/api/v1/conversations/${conversationId}/preferences`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ is_muted: isMuted }),
  });
}

export async function getConversationMedia(
  token: string,
  conversationId: string,
  opts?: { limit?: number; before?: string },
): Promise<{ media: MediaItem[]; has_more: boolean; next_cursor: string | null }> {
  const params = new URLSearchParams({ limit: String(opts?.limit ?? 30) });
  if (opts?.before) params.set("before", opts.before);
  const res = await request<{
    media: MediaItem[];
    pagination: { has_more: boolean; next_cursor: string | null };
  }>(`/api/v1/conversations/${conversationId}/media?${params}`, { token });
  return {
    media: res.media,
    has_more: res.pagination.has_more,
    next_cursor: res.pagination.next_cursor,
  };
}

// ── Messages ───────────────────────────────────────────────────────────────────

export async function sendMessageRest(
  token: string,
  conversationId: string,
  data: { body?: string; image_url?: string },
): Promise<Message> {
  const res = await request<{ message: Message }>("/api/v1/messages", {
    method: "POST",
    token,
    body: JSON.stringify({ conversation_id: conversationId, ...data }),
  });
  return res.message;
}

export async function editMessage(token: string, messageId: string, body: string): Promise<void> {
  await request(`/api/v1/messages/${messageId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ body }),
  });
}

export async function markMessageRead(token: string, messageId: string): Promise<void> {
  await request(`/api/v1/messages/${messageId}/read`, { method: "POST", token });
}

// ── Notifications ──────────────────────────────────────────────────────────────

export async function listNotifications(token: string): Promise<{
  notifications: AppNotification[];
  unread_count: number;
}> {
  return request("/api/v1/notifications", { token });
}

export async function markNotificationRead(token: string, id: string): Promise<void> {
  await request(`/api/v1/notifications/${id}/read`, { method: "POST", token });
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await request("/api/v1/notifications/read-all", { method: "POST", token });
}

export async function getNotificationUnreadCount(token: string): Promise<number> {
  const res = await request<{ unread_count: number }>("/api/v1/notifications/unread-count", { token });
  return res.unread_count;
}

// ── Uploads ────────────────────────────────────────────────────────────────────

export async function uploadImage(token: string, file: File): Promise<{ url: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/v1/uploads/image", { method: "POST", token, body: form, json: false });
}

export { ApiError };
