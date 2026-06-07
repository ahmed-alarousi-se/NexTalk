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
  cursor_key: string;
  created_at: string;
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
  online?: boolean;
  typing?: boolean;
  typing_username?: string;
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
