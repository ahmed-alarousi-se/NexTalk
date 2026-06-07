import { useState } from "react";
import { Bell, Check, Crown, Image as ImageIcon, KeyRound, LogOut, Search, Shield, UserPlus, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Avatar } from "./Avatar";
import { timeAgo } from "@/lib/format";
import { useChat } from "@/lib/chat";
import { useAuth } from "@/lib/auth";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PanelKind = "details" | "requests" | "notifications" | "discover" | "settings" | null;

type Props = {
  panel: PanelKind;
  conv?: Conversation | null;
  onClose: () => void;
};

export function RightPanel({ panel, conv, onClose }: Props) {
  if (!panel) return null;
  return (
    <aside className="hidden xl:flex h-full w-[340px] flex-col glass-strong border-l border-white/5 animate-in slide-in-from-right duration-300">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-semibold tracking-tight">{titleFor(panel)}</h2>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {panel === "details" && conv && <Details conv={conv} />}
        {panel === "requests" && <Requests />}
        {panel === "notifications" && <Notifications />}
        {panel === "discover" && <Discover />}
        {panel === "settings" && <SettingsPanel />}
      </div>
    </aside>
  );
}

function titleFor(p: Exclude<PanelKind, null>) {
  return ({ details: "Details", requests: "Message Requests", notifications: "Notifications", discover: "Discover people", settings: "Settings" } as const)[p];
}

function Details({ conv }: { conv: Conversation }) {
  const { user } = useAuth();
  const { removeConversation } = useChat();
  const name = conv.type === "direct" ? conv.other_user?.username ?? "" : conv.name ?? "";

  return (
    <div className="p-4 space-y-5">
      <div className="flex flex-col items-center text-center gap-3 py-4">
        <Avatar
          name={name}
          size={88}
          ring
          online={conv.type === "direct" ? conv.online : false}
          src={conv.type === "direct" ? conv.other_user?.avatar_url : undefined}
        />
        <div>
          <h3 className="text-lg font-semibold">{name}</h3>
          <p className="text-xs text-muted-foreground">
            {conv.type === "direct" ? (conv.online ? "Active now" : "Last seen recently") : `${conv.members?.length ?? 0} members`}
          </p>
        </div>
        {conv.description && <p className="text-sm text-muted-foreground max-w-[260px]">{conv.description}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ActionTile icon={<Bell className="h-4 w-4" />} label="Mute" />
        <ActionTile icon={<ImageIcon className="h-4 w-4" />} label="Media" />
        <ActionTile icon={<Shield className="h-4 w-4" />} label="Privacy" />
      </div>

      {conv.type === "group" && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Members</p>
          <ul className="space-y-1">
            {conv.members?.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 transition-all duration-300">
                <Avatar name={m.username} src={m.avatar_url} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: m.color ?? undefined }}>
                      {m.username}{m.user_id === user?.id && " (you)"}
                    </p>
                    {m.role === "admin" && <Crown className="h-3 w-3 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {m.status === "pending" ? "Pending invite" : m.is_contact ? "Contact" : "Member"}
                  </p>
                </div>
                {m.color && <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => void removeConversation()}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive py-2.5 text-sm font-medium hover:bg-destructive/20 transition-all duration-300"
      >
        <LogOut className="h-4 w-4" /> {conv.type === "group" ? "Leave conversation" : "Delete conversation"}
      </button>
    </div>
  );
}

function ActionTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-2 border border-white/5 py-3 text-xs hover:border-primary/30 hover:bg-primary/5 transition-all duration-300">
      <span className="text-primary">{icon}</span>
      {label}
    </button>
  );
}

function Requests() {
  const { messageRequests, acceptRequest, declineRequest } = useChat();
  const [busy, setBusy] = useState<string | null>(null);

  if (messageRequests.length === 0) {
    return <p className="p-6 text-sm text-center text-muted-foreground">No pending requests.</p>;
  }

  return (
    <div className="p-3 space-y-2">
      <p className="px-2 text-xs text-muted-foreground">People who want to connect with you.</p>
      {messageRequests.map((r) => (
        <div key={r.id} className="glass rounded-xl p-3 flex gap-3">
          <Avatar name={r.from_user?.username ?? "?"} src={r.from_user?.avatar_url} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate">{r.from_user?.username ?? "Unknown"}</p>
              <span className="text-[10px] text-muted-foreground">{timeAgo(r.created_at)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Wants to add you as a contact</p>
            <div className="flex gap-2 mt-2">
              <button
                disabled={busy === r.id}
                onClick={() => { setBusy(r.id); void acceptRequest(r.id).finally(() => setBusy(null)); }}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground text-xs py-1.5 font-medium hover:opacity-90 transition-all duration-300 disabled:opacity-50"
              >
                <Check className="h-3 w-3" /> Accept
              </button>
              <button
                disabled={busy === r.id}
                onClick={() => { setBusy(r.id); void declineRequest(r.id).finally(() => setBusy(null)); }}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/5 text-foreground text-xs py-1.5 font-medium hover:bg-white/10 transition-all duration-300 disabled:opacity-50"
              >
                <X className="h-3 w-3" /> Decline
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Notifications() {
  const { notifications, markNotifRead, markAllNotifsRead, acceptGroupInvitation, rejectGroupInvitation, setActiveId } = useChat();
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="p-3 space-y-1">
      {notifications.length > 0 && (
        <button
          onClick={() => void markAllNotifsRead()}
          className="mb-2 w-full text-xs text-primary hover:underline"
        >
          Mark all read
        </button>
      )}
      {notifications.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No notifications.</p>
      ) : (
        notifications.map((n) => {
          const groupId = n.type === "group_invitation" ? (n.data?.group_id as string | undefined) : undefined;
          return (
            <div
              key={n.id}
              className={cn("rounded-xl p-3 transition-all duration-300", n.read_at ? "opacity-70" : "bg-primary/5")}
            >
              <button
                onClick={() => !n.read_at && void markNotifRead(n.id)}
                className="w-full flex gap-3 text-left"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <Bell className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)} ago</p>
                </div>
                {!n.read_at && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
              </button>
              {groupId && !n.read_at && (
                <div className="flex gap-2 mt-2 ml-12">
                  <button
                    disabled={busy === n.id}
                    onClick={() => {
                      setBusy(n.id);
                      void acceptGroupInvitation(groupId)
                        .then(() => { setActiveId(groupId); void markNotifRead(n.id); })
                        .finally(() => setBusy(null));
                    }}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground text-xs py-1.5 font-medium disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy === n.id}
                    onClick={() => {
                      setBusy(n.id);
                      void rejectGroupInvitation(groupId)
                        .then(() => void markNotifRead(n.id))
                        .finally(() => setBusy(null));
                    }}
                    className="flex-1 rounded-lg bg-white/5 text-xs py-1.5 font-medium disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function Discover() {
  const { discoverUsers, discoverLoading, searchPeople, addContact, startChat } = useChat();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Record<string, "contact" | "chat" | "busy">>({});

  function handleSearch(value: string) {
    setQ(value);
    searchPeople(value.trim());
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 border border-white/5 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by username or email…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {!q.trim() ? (
        <p className="px-2 text-xs text-muted-foreground">Search for people to message or add as contacts.</p>
      ) : discoverLoading ? (
        <p className="text-sm text-center text-muted-foreground py-6">Searching…</p>
      ) : discoverUsers.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-6">No users found.</p>
      ) : (
        discoverUsers.map((u) => (
          <div key={u.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-all duration-300">
            <Avatar name={u.username} src={u.avatar_url} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{u.username}</p>
            </div>
            <div className="flex gap-1">
              <button
                disabled={status[u.id] === "busy"}
                onClick={() => {
                  setStatus((s) => ({ ...s, [u.id]: "busy" }));
                  void addContact(u.username)
                    .then(() => setStatus((s) => ({ ...s, [u.id]: "contact" })))
                    .catch(() => setStatus((s) => ({ ...s, [u.id]: "busy" })));
                }}
                className="flex items-center gap-1 rounded-lg bg-primary/15 text-primary text-xs px-2 py-1.5 font-medium hover:bg-primary/25 transition-all duration-300 disabled:opacity-50"
              >
                <UserPlus className="h-3 w-3" />
                {status[u.id] === "contact" ? "Sent" : "Add"}
              </button>
              <button
                disabled={status[u.id] === "busy"}
                onClick={() => {
                  setStatus((s) => ({ ...s, [u.id]: "busy" }));
                  void startChat(u.id).finally(() => setStatus((s) => ({ ...s, [u.id]: "chat" })));
                }}
                className="rounded-lg bg-white/5 text-foreground text-xs px-2 py-1.5 font-medium hover:bg-white/10 transition-all duration-300 disabled:opacity-50"
              >
                Chat
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SettingsPanel() {
  const { user } = useAuth();

  return (
    <div className="p-4 space-y-5">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Account</p>
        <div className="glass rounded-xl p-4 flex items-center gap-3">
          <Avatar name={user?.username ?? "you"} src={user?.photoURL} size={48} ring />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{user?.username ?? "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email ?? "—"}</p>
          </div>
          <Link to="/profile" className="text-xs text-primary font-medium hover:underline">
            Edit
          </Link>
        </div>
      </section>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Security</p>
        <Link
          to="/profile"
          search={{ tab: "security" }}
          className="flex items-center justify-between rounded-lg bg-surface-2 border border-white/5 px-3 py-2.5 text-sm hover:border-primary/30 hover:bg-primary/5 transition-all"
        >
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <KeyRound className="h-4 w-4 text-primary" />
            Firebase token & session
          </span>
          <span className="text-xs text-primary font-medium">Open</span>
        </Link>
      </section>
    </div>
  );
}
