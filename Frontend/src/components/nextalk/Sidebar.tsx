import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Inbox, LogOut, MessageCircle, Moon, Search, Settings, Sun, Users, PenSquare } from "lucide-react";
import { Avatar } from "./Avatar";
import { clockTime } from "@/lib/format";
import { useChat } from "@/lib/chat";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";

type Tab = "chats" | "requests" | "notifications" | "discover";

type Props = {
  activeId: string | null;
  onSelect: (id: string) => void;
  onOpenRequests: () => void;
  onOpenNotifications: () => void;
  onOpenDiscover: () => void;
  onOpenSettings: () => void;
  onCompose: () => void;
};

export function Sidebar({ activeId, onSelect, onOpenRequests, onOpenNotifications, onOpenDiscover, onOpenSettings, onCompose }: Props) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("chats");
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { conversations, conversationsLoading, messageRequests, notificationUnread, wsConnected } = useChat();

  const filtered = conversations.filter((c) => {
    const name = c.type === "direct" ? c.other_user?.username ?? "" : c.name ?? "";
    return name.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <aside className="flex h-full w-full md:w-[340px] lg:w-[380px] flex-col glass-strong border-r border-white/5">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-shimmer">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">NexTalk</h1>
            <p className="text-[11px] text-muted-foreground -mt-0.5">
              {wsConnected ? "connected · live" : "connecting…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={onCompose} label="New chat"><PenSquare className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={toggle} label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconBtn>
          <IconBtn onClick={onOpenSettings} label="Settings"><Settings className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-xl bg-surface-2/80 border border-white/5 px-3 py-2 transition-all duration-300 focus-within:border-primary/40 focus-within:bg-surface-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="px-3 pb-2 grid grid-cols-4 gap-1">
        <TabBtn active={tab === "chats"} onClick={() => setTab("chats")} icon={<MessageCircle className="h-4 w-4" />} label="Chats" />
        <TabBtn active={tab === "requests"} onClick={() => { setTab("requests"); onOpenRequests(); }} icon={<Inbox className="h-4 w-4" />} label="Requests" badge={messageRequests.length} />
        <TabBtn active={tab === "notifications"} onClick={() => { setTab("notifications"); onOpenNotifications(); }} icon={<Bell className="h-4 w-4" />} label="Alerts" badge={notificationUnread} />
        <TabBtn active={tab === "discover"} onClick={() => { setTab("discover"); onOpenDiscover(); }} icon={<Users className="h-4 w-4" />} label="People" />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
        {conversationsLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading chats…</p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((c) => (
              <ConversationRow key={c.id} c={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                {q ? `No conversations match "${q}".` : "No conversations yet. Find someone in People."}
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-white/5 p-3 flex items-center gap-3">
        <Link
          to="/profile"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 -m-1 transition-colors hover:bg-white/5"
        >
          <Avatar name={user?.username ?? "you"} src={user?.photoURL} online ring />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium truncate">{user?.username ?? "you"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email ?? "View profile"}</p>
          </div>
        </Link>
        <IconBtn onClick={() => void signOut()} label="Sign out"><LogOut className="h-4 w-4" /></IconBtn>
      </div>
    </aside>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300"
    >
      {children}
    </button>
  );
}

function TabBtn({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-0.5 rounded-lg py-2 text-[11px] font-medium transition-all duration-300",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5",
      )}
    >
      {icon}
      <span>{label}</span>
      {!!badge && badge > 0 && (
        <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

function ConversationRow({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  const name = c.type === "direct" ? c.other_user?.username ?? "Unknown" : c.name ?? "Group";
  const preview = c.last_message?.body ?? (c.last_message?.image_url ? "📷 Photo" : "No messages yet");
  const ts = c.last_message ? clockTime(c.last_message.created_at) : "";

  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 border",
          active ? "bg-primary/10 border-primary/30" : "border-transparent hover:bg-white/5",
        )}
      >
        <Avatar
          name={name}
          online={c.type === "direct" ? c.online : false}
          src={c.type === "direct" ? c.other_user?.avatar_url : undefined}
        />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{name}</p>
            <span className="text-[10px] text-muted-foreground shrink-0">{ts}</span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-xs truncate text-muted-foreground">{preview}</p>
            {c.unread_count > 0 ? (
              <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 grid place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {c.unread_count}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
