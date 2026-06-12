import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, LogOut, MessageCircle, Moon, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search, Settings, Sun, Users, PenSquare, Video } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./Avatar";
import { Alerts, Discover } from "./RightPanel";
import { clockTime, timeAgo } from "@/lib/format";
import { getCallHistory } from "@/lib/api";
import { useChat } from "@/lib/use-chat";
import { useCalls } from "@/lib/use-calls";
import type { CallHistoryItem, CallType, Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { formatCallDuration } from "@/lib/call-log";

type Tab = "chats" | "calls" | "notifications" | "discover";

type Props = {
  activeId: string | null;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  onCompose: () => void;
};

export function Sidebar({ activeId, onSelect, onOpenSettings, onCompose }: Props) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("chats");
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { conversations, conversationsLoading, messageRequests, notificationUnread, wsConnected, typingConversationIds } = useChat();

  const filtered = conversations.filter((c) => {
    const name = c.type === "direct" ? c.other_user?.username ?? "" : c.name ?? "";
    return name.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <aside className="flex h-full w-full md:w-[340px] lg:w-[380px] flex-col glass-strong border-r border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-shimmer">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight leading-none">NexTalk</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {wsConnected ? "connected · live" : "connecting…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconBtn onClick={onCompose} label="New chat">
            <PenSquare className="h-4 w-4" />
          </IconBtn>
          <IconBtn onClick={toggle} label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconBtn>
          <IconBtn onClick={onOpenSettings} label="Settings">
            <Settings className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <label className="flex items-center gap-2 rounded-xl bg-surface-2/80 border border-white/5 px-3 py-2.5 transition-all duration-300 focus-within:border-primary/40 focus-within:bg-surface-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {/* Tabs */}
      <div className="px-3 pb-2 grid grid-cols-4 gap-1">
        <TabBtn
          active={tab === "chats"}
          onClick={() => setTab("chats")}
          icon={<MessageCircle className="h-4 w-4" />}
          label="Chats"
        />
        <TabBtn
          active={tab === "calls"}
          onClick={() => setTab("calls")}
          icon={<Phone className="h-4 w-4" />}
          label="Calls"
        />
        <TabBtn
          active={tab === "notifications"}
          onClick={() => setTab("notifications")}
          icon={<Bell className="h-4 w-4" />}
          label="Alerts"
          badge={(messageRequests.length || 0) + (notificationUnread || 0)}
        />
        <TabBtn
          active={tab === "discover"}
          onClick={() => setTab("discover")}
          icon={<Users className="h-4 w-4" />}
          label="People"
        />
      </div>

      {/* List area: conversations / calls / alerts / discover */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
        {tab === "calls" ? (
          <CallsList onOpenChat={onSelect} />
        ) : tab === "notifications" ? (
          <Alerts />
        ) : tab === "discover" ? (
          <Discover />
        ) : conversationsLoading ? (
          <div className="space-y-2 px-2 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-white/5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-white/5 rounded w-3/4" />
                  <div className="h-2.5 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => (
              <ConversationRow
                key={c.id}
                c={c}
                active={c.id === activeId}
                typing={typingConversationIds.has(c.id)}
                onClick={() => onSelect(c.id)}
              />
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {q ? `No conversations match "${q}".` : "No conversations yet."}
                </p>
                {!q && (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Find someone in People to get started.
                  </p>
                )}
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Profile footer */}
      <div className="border-t border-white/5 p-3 flex items-center gap-2">
        <Link
          to="/profile"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 -m-1 transition-colors hover:bg-white/5 active:bg-white/10"
        >
          <Avatar name={user?.username ?? "you"} src={user?.photoURL} online ring />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium truncate leading-snug">{user?.username ?? "you"}</p>
            <p className="text-xs text-muted-foreground truncate leading-snug">{user?.email ?? "View profile"}</p>
          </div>
        </Link>
        <IconBtn onClick={() => void signOut()} label="Sign out">
          <LogOut className="h-4 w-4" />
        </IconBtn>
      </div>
    </aside>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-white/10 transition-all duration-300"
    >
      {children}
    </button>
  );
}

function TabBtn({
  active, onClick, icon, label, badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "relative flex items-center justify-center rounded-lg py-3 transition-all duration-300 min-h-[44px]",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-white/10",
      )}
    >
      {icon}
      {!!badge && badge > 0 && (
        <span className="absolute top-1 right-1.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground leading-none">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function CallsList({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const { idToken, user } = useAuth();
  const { conversations, startChat, onlineUserIds, blockedUserIds } = useChat();
  const { startCall, call: activeCall } = useCalls();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);

  const callsQuery = useQuery({
    queryKey: ["call-history", user?.id],
    queryFn: () => getCallHistory(idToken!),
    enabled: !!idToken,
    refetchInterval: 30_000,
  });

  function handleRecall(item: CallHistoryItem, callType: CallType) {
    if (blockedUserIds.has(item.other_user.id)) {
      toast.error("Cannot call this user");
      return;
    }
    if (!onlineUserIds.has(item.other_user.id)) {
      toast.error(`${item.other_user.username} is offline`);
      return;
    }
    if (activeCall) {
      toast.error("Already in a call");
      return;
    }
    const conv =
      conversations.find((c) => c.id === item.conversation_id) ??
      ({ id: item.conversation_id, type: "direct", other_user: item.other_user, unread_count: 0 } as Conversation);
    startCall(conv, callType);
  }

  async function handleOpenChat(item: CallHistoryItem) {
    const existing = conversations.find((c) => c.id === item.conversation_id);
    if (existing) {
      onOpenChat(existing.id);
      return;
    }
    setChatBusy(true);
    try {
      await startChat(item.other_user.id);
    } finally {
      setChatBusy(false);
    }
  }

  if (callsQuery.isLoading) {
    return (
      <div className="space-y-2 px-2 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-white/5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-white/5 rounded w-3/4" />
              <div className="h-2.5 bg-white/5 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const items = callsQuery.data ?? [];
  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">No calls yet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Voice and video calls will appear here.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const missed = item.status === "missed" || (item.status === "cancelled" && item.direction === "incoming");
        const DirIcon = missed ? PhoneMissed : item.direction === "outgoing" ? PhoneOutgoing : PhoneIncoming;
        const statusLabel = missed
          ? "Missed"
          : item.status === "declined"
            ? "Declined"
            : item.status === "cancelled"
              ? "Cancelled"
              : item.direction === "outgoing"
                ? "Outgoing"
                : "Incoming";
        const expanded = expandedId === item.id;
        const online = onlineUserIds.has(item.other_user.id);

        return (
          <li key={item.id}>
            <button
              onClick={() => setExpandedId(expanded ? null : item.id)}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 border active:scale-[0.98]",
                expanded ? "bg-primary/10 border-primary/30" : "border-transparent hover:bg-white/5",
              )}
            >
              <Avatar name={item.other_user.username} src={item.other_user.avatar_url} online={online} />
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-sm font-medium truncate", missed && "text-destructive")}>
                    {item.other_user.username}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.created_at)} ago</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                  <DirIcon className={cn("h-3 w-3 shrink-0", missed && "text-destructive")} />
                  <span className={cn("truncate", missed && "text-destructive")}>
                    {statusLabel} {item.call_type === "video" ? "video" : "voice"} call
                    {item.status === "completed" && ` · ${formatCallDuration(item.duration_seconds)}`}
                  </span>
                </div>
              </div>
            </button>

            {expanded && (
              <div className="flex items-center justify-center gap-3 py-2 px-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <CallActionBtn label="Voice call" onClick={() => handleRecall(item, "audio")}>
                  <Phone className="h-4 w-4" />
                </CallActionBtn>
                <CallActionBtn label="Video call" onClick={() => handleRecall(item, "video")}>
                  <Video className="h-4 w-4" />
                </CallActionBtn>
                <CallActionBtn label="Chat" disabled={chatBusy} onClick={() => void handleOpenChat(item)}>
                  <MessageCircle className="h-4 w-4" />
                </CallActionBtn>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CallActionBtn({
  children, label, onClick, disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 active:scale-95 transition-all duration-200 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ConversationRow({ c, active, typing, onClick }: { c: Conversation; active: boolean; typing?: boolean; onClick: () => void }) {
  const name = c.type === "direct" ? c.other_user?.username ?? "Unknown" : c.name ?? "Group";
  const preview = typing
    ? "typing…"
    : c.last_message?.body ?? (c.last_message?.image_url ? "📷 Photo" : "No messages yet");
  const ts = c.last_message ? clockTime(c.last_message.created_at) : "";

  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 border active:scale-[0.98]",
          active ? "bg-primary/10 border-primary/30" : "border-transparent hover:bg-white/5 active:bg-white/8",
        )}
      >
        <Avatar
          name={name}
          online={c.type === "direct" ? c.online : false}
          src={c.type === "direct" ? c.other_user?.avatar_url : undefined}
        />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate flex items-center gap-1">
              {name}
              {c.is_muted && <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />}
            </p>
            <span className="text-[10px] text-muted-foreground shrink-0">{ts}</span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className={cn("text-xs truncate", typing ? "text-primary" : "text-muted-foreground")}>{preview}</p>
            {c.unread_count > 0 ? (
              <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 grid place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
