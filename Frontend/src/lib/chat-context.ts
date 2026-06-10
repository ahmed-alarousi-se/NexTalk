import { createContext } from "react";

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

export type ChatCtx = {
  wsConnected: boolean;
  conversations: Conversation[];
  conversationsLoading: boolean;
  refreshConversations: () => void;

  messageRequests: MessageRequest[];
  notifications: AppNotification[];
  notificationUnread: number;

  contacts: Contact[];
  contactsLoading: boolean;
  contactUserIds: Set<string>;

  activeId: string | null;
  setActiveId: (id: string | null) => void;
  activeConversation: Conversation | null;

  messages: Message[];
  messagesLoading: boolean;
  hasMoreMessages: boolean;
  loadMoreMessages: () => void;

  groupDetails: GroupDetails | null;
  groupDetailsLoading: boolean;
  pendingInvitations: PendingInvitation[];
  isGroupAdmin: boolean;

  typingInActive: boolean;
  typingUsername?: string;
  typingConversationIds: Set<string>;

  onlineUserIds: Set<string>;

  sendMessage: (body: string, imageUrl?: string) => void;
  sendTyping: (isTyping: boolean) => void;
  uploadAndSendImage: (file: File) => Promise<void>;
  editMessageContent: (messageId: string, body: string) => Promise<void>;

  groupSearchResults: GroupSearchResult[];
  groupSearchLoading: boolean;
  searchGroupsByName: (q: string) => void;
  joinGroupRequest: (groupId: string) => Promise<void>;
  leaveGroupChat: () => Promise<void>;

  registerOnChatOpen: (fn: () => void) => void;

  acceptRequest: (id: string) => Promise<void>;
  declineRequest: (id: string) => Promise<void>;
  markNotifRead: (id: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;

  discoverUsers: UserLite[];
  discoverLoading: boolean;
  searchPeople: (q: string) => void;
  addContact: (username: string) => Promise<void>;
  removeContactFromList: (userId: string) => Promise<void>;
  startChat: (userId: string) => Promise<void>;
  createGroup: (data: { name: string; description?: string; participant_ids?: string[] }) => Promise<string>;

  removeConversation: () => Promise<void>;
  updateGroupDetails: (data: { name?: string; description?: string | null }) => Promise<void>;
  inviteToGroup: (userIds: string[]) => Promise<void>;
  removeFromGroup: (userId: string) => Promise<void>;
  acceptGroupInvitation: (conversationId: string) => Promise<void>;
  rejectGroupInvitation: (conversationId: string) => Promise<void>;

  mediaItems: MediaItem[];
  mediaLoading: boolean;
  hasMoreMedia: boolean;
  loadMoreMedia: () => void;
  refreshMedia: () => void;

  toggleMute: () => Promise<void>;
  isMuted: boolean;

  blockedUsers: BlockedUser[];
  blockedUserIds: Set<string>;
  blockUserById: (userId: string) => Promise<void>;
  unblockUserById: (userId: string) => Promise<void>;
};

export const ChatContext = createContext<ChatCtx | null>(null);
