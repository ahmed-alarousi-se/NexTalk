import type {
  AppNotification,
  Conversation,
  GroupDetails,
  Message,
  MessageRequest,
  UserLite,
} from "@/lib/types";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type ApiUser = {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  auth_provider: string;
  created_at: string;
  last_seen: string | null;
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
  data: { username?: string; avatar_url?: string | null; email?: string },
): Promise<ApiUser> {
  return request<ApiUser>("/api/v1/users/me", { method: "PATCH", token, body: JSON.stringify(data) });
}

export async function searchUsers(token: string, q: string): Promise<UserLite[]> {
  const res = await request<{ results: UserLite[] }>(
    `/api/v1/users/search?q=${encodeURIComponent(q)}`,
    { token },
  );
  return res.results;
}

// ── Contacts ───────────────────────────────────────────────────────────────────

export async function sendContactRequest(token: string, username: string): Promise<{ request_id: string }> {
  const res = await request<{ detail: string; request_id: string }>("/api/v1/contacts", {
    method: "POST",
    token,
    body: JSON.stringify({ username }),
  });
  return { request_id: res.request_id };
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

// ── Messages ───────────────────────────────────────────────────────────────────

export async function sendMessageRest(
  token: string,
  conversationId: string,
  body: string,
): Promise<Message> {
  const res = await request<{ message: Message }>("/api/v1/messages", {
    method: "POST",
    token,
    body: JSON.stringify({ conversation_id: conversationId, body }),
  });
  return res.message;
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

// ── Uploads ────────────────────────────────────────────────────────────────────

export async function uploadImage(token: string, file: File): Promise<{ url: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/v1/uploads/image", { method: "POST", token, body: form, json: false });
}

export { ApiError };
