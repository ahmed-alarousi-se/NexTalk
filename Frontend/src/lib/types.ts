import type { CallLog } from "@/lib/call-log";

export type UserLite = {
  id: string;
  username: string;
  avatar_url?: string | null;
  last_seen?: string | null;
};

export type MessageStatus = "SENT" | "DELIVERED" | "READ";

export type Message = {
  id: string;
  conversation_id: string;
  sender: UserLite;
  body?: string | null;
  image_url?: string | null;
  message_type?: "text" | "call";
  call_log?: CallLog | null;
  cursor_key: string;
  created_at: string;
  edited_at?: string | null;
  status?: MessageStatus | null;
};

export type Conversation = {
  id: string;
  type: "direct" | "group";
  name?: string | null;
  description?: string | null;
  creator_username?: string;
  avatar_url?: string | null;
  other_user?: UserLite | null;
  members?: GroupMember[];
  last_message?: {
    body?: string | null;
    image_url?: string | null;
    cursor_key: string;
    created_at: string;
  } | null;
  unread_count: number;
  is_muted?: boolean;
  online?: boolean;
  typing?: boolean;
  typing_username?: string;
};

export type MediaItem = {
  id: string;
  image_url: string;
  created_at: string;
  sender: UserLite;
};

export type BlockedUser = {
  user_id: string;
  username: string;
  avatar_url?: string | null;
  blocked_at: string;
};

export type PrivacySettings = {
  show_last_seen: boolean;
  read_receipts_enabled: boolean;
};

export type GroupMember = {
  user_id: string;
  username: string;
  avatar_url?: string | null;
  role: "admin" | "member";
  color?: string | null;
  status: "accepted" | "pending" | "rejected";
  is_contact?: boolean;
  joined_at?: string;
};

export type MessageRequest = {
  id: string;
  from_user: UserLite | null;
  status: string;
  created_at: string;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  created_at: string;
  read_at?: string | null;
};

export type GroupDetails = {
  id: string;
  name: string;
  description?: string | null;
  creator_username: string;
  created_at: string;
  member_count: number;
  members: GroupMember[];
};

export type Contact = {
  id: string;
  user: UserLite;
  added_at: string;
};

export type PendingInvitation = {
  user_id: string;
  username: string;
  status: "pending" | "accepted" | "rejected";
};

export type GroupSearchResult = {
  id: string;
  name: string;
  description?: string | null;
  member_count: number;
  join_status?: "pending" | null;
};

export type CallType = "audio" | "video";

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

export type MissedCallPrompt = {
  conversationId: string;
  peerName: string;
  callType: CallType;
  logStatus: "missed" | "cancelled" | "declined";
};

export type ActiveCall = {
  callId: string;
  conversationId: string;
  callType: CallType;
  phase: CallPhase;
  peer: UserLite;
  isCaller: boolean;
  localMuted: boolean;
  videoEnabled: boolean;
  startedAt?: number;
};
