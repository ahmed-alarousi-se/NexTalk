// Mock data for NexTalk UI (frontend-only).
export type UserLite = { id: string; username: string; avatar_url?: string | null };

export type MessageStatus = "SENT" | "DELIVERED" | "READ";
export type Message = {
  id: string;
  conversation_id: string;
  sender: UserLite;
  body?: string | null;
  image_url?: string | null;
  cursor_key: string;
  created_at: string;
  status?: MessageStatus;
};

export type Conversation = {
  id: string;
  type: "direct" | "group";
  name?: string;
  description?: string;
  creator_username?: string;
  avatar_url?: string | null;
  other_user?: UserLite;
  members?: { user_id: string; username: string; role: "admin" | "member"; color?: string; status: "accepted" | "pending"; is_contact?: boolean }[];
  last_message?: Message;
  unread_count: number;
  online?: boolean;
  typing?: boolean;
};

export type MessageRequest = {
  id: string;
  from_user: UserLite;
  status: "pending";
  created_at: string;
  preview?: string;
};

export type Notification = {
  id: string;
  type: "contact_request" | "group_invitation" | "invitation_accepted" | "invitation_rejected";
  title: string;
  body: string;
  created_at: string;
  read_at?: string | null;
};

export const ME: UserLite = { id: "me", username: "you" };

const u = (id: string, username: string, avatar?: string | null): UserLite => ({ id, username, avatar_url: avatar ?? null });

export const USERS: UserLite[] = [
  u("u1", "ava.lin"),
  u("u2", "marcus_w"),
  u("u3", "sora"),
  u("u4", "jules.k"),
  u("u5", "noor"),
  u("u6", "diego.r"),
  u("u7", "yuki"),
];

const t = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

export const CONVERSATIONS: Conversation[] = [
  {
    id: "c1", type: "direct", other_user: USERS[0], unread_count: 2, online: true, typing: true,
    last_message: { id: "m10", conversation_id: "c1", sender: USERS[0], body: "okay sending it over now ✨", cursor_key: "01J1", created_at: t(1), status: "DELIVERED" },
  },
  {
    id: "c2", type: "group", name: "Design Guild", description: "Weekly crit + shipping log", creator_username: "sora",
    members: [
      { user_id: "me", username: "you", role: "admin", color: "#10b981", status: "accepted", is_contact: true },
      { user_id: "u3", username: "sora", role: "admin", color: "#3b82f6", status: "accepted", is_contact: true },
      { user_id: "u2", username: "marcus_w", role: "member", color: "#f59e0b", status: "accepted", is_contact: true },
      { user_id: "u5", username: "noor", role: "member", color: "#ec4899", status: "accepted", is_contact: false },
      { user_id: "u7", username: "yuki", role: "member", color: "#a78bfa", status: "pending", is_contact: false },
    ],
    unread_count: 0,
    last_message: { id: "m20", conversation_id: "c2", sender: USERS[2], body: "Pushed the v3 tokens — check the spacing ramp.", cursor_key: "01J2", created_at: t(14), status: "READ" },
  },
  {
    id: "c3", type: "direct", other_user: USERS[1], unread_count: 0, online: false,
    last_message: { id: "m30", conversation_id: "c3", sender: ME, body: "sounds good, talk tomorrow", cursor_key: "01J3", created_at: t(120), status: "READ" },
  },
  {
    id: "c4", type: "direct", other_user: USERS[3], unread_count: 5, online: true,
    last_message: { id: "m40", conversation_id: "c4", sender: USERS[3], body: "📎 brief.pdf", cursor_key: "01J4", created_at: t(240), status: "SENT" },
  },
  {
    id: "c5", type: "group", name: "Weekend Trip", creator_username: "diego.r",
    members: [
      { user_id: "me", username: "you", role: "member", color: "#10b981", status: "accepted" },
      { user_id: "u6", username: "diego.r", role: "admin", color: "#ef4444", status: "accepted" },
      { user_id: "u4", username: "jules.k", role: "member", color: "#22d3ee", status: "accepted" },
    ],
    unread_count: 0,
    last_message: { id: "m50", conversation_id: "c5", sender: USERS[5], body: "booked the cabin 🎉", cursor_key: "01J5", created_at: t(720), status: "READ" },
  },
  {
    id: "c6", type: "direct", other_user: USERS[4], unread_count: 0, online: false,
    last_message: { id: "m60", conversation_id: "c6", sender: USERS[4], body: "happy birthday!! 🥳", cursor_key: "01J6", created_at: t(2880), status: "READ" },
  },
];

export const MESSAGES_BY_CONV: Record<string, Message[]> = {
  c1: [
    { id: "a1", conversation_id: "c1", sender: USERS[0], body: "hey! you around?", cursor_key: "01A1", created_at: t(60), status: "READ" },
    { id: "a2", conversation_id: "c1", sender: ME, body: "yeah, just wrapped a call", cursor_key: "01A2", created_at: t(58), status: "READ" },
    { id: "a3", conversation_id: "c1", sender: USERS[0], body: "perfect — sending the mock now", cursor_key: "01A3", created_at: t(40), status: "READ" },
    { id: "a4", conversation_id: "c1", sender: USERS[0], image_url: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=600", cursor_key: "01A4", created_at: t(38), status: "READ" },
    { id: "a5", conversation_id: "c1", sender: ME, body: "ooh this looks clean. love the type ramp", cursor_key: "01A5", created_at: t(30), status: "READ" },
    { id: "a6", conversation_id: "c1", sender: ME, body: "one thing — can we tighten the sidebar?", cursor_key: "01A6", created_at: t(28), status: "READ" },
    { id: "a7", conversation_id: "c1", sender: USERS[0], body: "yes, dropping it to 280", cursor_key: "01A7", created_at: t(10), status: "READ" },
    { id: "a8", conversation_id: "c1", sender: USERS[0], body: "okay sending it over now ✨", cursor_key: "01A8", created_at: t(1), status: "DELIVERED" },
  ],
  c2: [
    { id: "b1", conversation_id: "c2", sender: USERS[2], body: "agenda for today: tokens, motion, empty states", cursor_key: "01B1", created_at: t(120), status: "READ" },
    { id: "b2", conversation_id: "c2", sender: USERS[1], body: "I'll cover motion 👋", cursor_key: "01B2", created_at: t(118), status: "READ" },
    { id: "b3", conversation_id: "c2", sender: ME, body: "tokens here — ramping radii too", cursor_key: "01B3", created_at: t(90), status: "READ" },
    { id: "b4", conversation_id: "c2", sender: USERS[4], body: "empty states are a mess across mobile, I'll log issues", cursor_key: "01B4", created_at: t(45), status: "READ" },
    { id: "b5", conversation_id: "c2", sender: USERS[2], body: "Pushed the v3 tokens — check the spacing ramp.", cursor_key: "01B5", created_at: t(14), status: "READ" },
  ],
  c3: [
    { id: "d1", conversation_id: "c3", sender: USERS[1], body: "got the numbers from Q3?", cursor_key: "01D1", created_at: t(200), status: "READ" },
    { id: "d2", conversation_id: "c3", sender: ME, body: "sounds good, talk tomorrow", cursor_key: "01D2", created_at: t(120), status: "READ" },
  ],
  c4: [
    { id: "e1", conversation_id: "c4", sender: USERS[3], body: "📎 brief.pdf", cursor_key: "01E1", created_at: t(240), status: "SENT" },
  ],
  c5: [
    { id: "f1", conversation_id: "c5", sender: USERS[5], body: "booked the cabin 🎉", cursor_key: "01F1", created_at: t(720), status: "READ" },
  ],
  c6: [
    { id: "g1", conversation_id: "c6", sender: USERS[4], body: "happy birthday!! 🥳", cursor_key: "01G1", created_at: t(2880), status: "READ" },
  ],
};

export const MESSAGE_REQUESTS: MessageRequest[] = [
  { id: "r1", from_user: u("x1", "lina.morales"), status: "pending", created_at: t(35), preview: "Hi! Saw your work on the Nimbus launch — would love to connect." },
  { id: "r2", from_user: u("x2", "kenji_dev"), status: "pending", created_at: t(180), preview: "Quick q about your sidebar layout 👀" },
  { id: "r3", from_user: u("x3", "rae"), status: "pending", created_at: t(900), preview: "Hey! Cofounder match through Nexus." },
];

export const NOTIFICATIONS: Notification[] = [
  { id: "n1", type: "contact_request", title: "New contact request", body: "lina.morales wants to connect", created_at: t(35) },
  { id: "n2", type: "group_invitation", title: "Group invite", body: "yuki invited you to 'Launch Week'", created_at: t(110) },
  { id: "n3", type: "invitation_accepted", title: "Invite accepted", body: "noor joined Design Guild", created_at: t(420), read_at: t(300) },
];

// deterministic colored avatar from username
export function avatarColor(name: string) {
  const palette = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#a78bfa", "#22d3ee", "#ef4444", "#84cc16"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function initials(name: string) {
  const parts = name.replace(/[._-]/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0]?.toUpperCase() || "?";
}

export function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
