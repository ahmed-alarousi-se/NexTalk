import { Bell, Check, Crown, Image as ImageIcon, LogOut, Shield, UserPlus, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { MESSAGE_REQUESTS, NOTIFICATIONS, USERS, type Conversation, timeAgo } from "@/lib/mock-data";
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
  const name = conv.type === "direct" ? conv.other_user?.username ?? "" : conv.name ?? "";
  return (
    <div className="p-4 space-y-5">
      <div className="flex flex-col items-center text-center gap-3 py-4">
        <Avatar name={name} size={88} ring online={conv.type === "direct" ? conv.online : false} />
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
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Members</p>
            <button className="text-xs text-primary hover:underline">+ Invite</button>
          </div>
          <ul className="space-y-1">
            {conv.members?.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 transition-all duration-300">
                <Avatar name={m.username} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: m.color }}>{m.username}{m.user_id === "me" && " (you)"}</p>
                    {m.role === "admin" && <Crown className="h-3 w-3 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{m.status === "pending" ? "Pending invite" : m.is_contact ? "Contact" : "Member"}</p>
                </div>
                <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive py-2.5 text-sm font-medium hover:bg-destructive/20 transition-all duration-300">
        <LogOut className="h-4 w-4" /> {conv.type === "group" ? "Leave group" : "Delete conversation"}
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
  return (
    <div className="p-3 space-y-2">
      <p className="px-2 text-xs text-muted-foreground">People who aren't your contacts wanting to message you.</p>
      {MESSAGE_REQUESTS.map((r) => (
        <div key={r.id} className="glass rounded-xl p-3 flex gap-3">
          <Avatar name={r.from_user.username} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate">{r.from_user.username}</p>
              <span className="text-[10px] text-muted-foreground">{timeAgo(r.created_at)}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.preview}</p>
            <div className="flex gap-2 mt-2">
              <button className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground text-xs py-1.5 font-medium hover:opacity-90 transition-all duration-300">
                <Check className="h-3 w-3" /> Accept
              </button>
              <button className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/5 text-foreground text-xs py-1.5 font-medium hover:bg-white/10 transition-all duration-300">
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
  return (
    <div className="p-3 space-y-1">
      {NOTIFICATIONS.map((n) => (
        <div key={n.id} className={cn("flex gap-3 rounded-xl p-3 transition-all duration-300", n.read_at ? "opacity-70" : "bg-primary/5")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Bell className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{n.title}</p>
            <p className="text-xs text-muted-foreground">{n.body}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)} ago</p>
          </div>
          {!n.read_at && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
        </div>
      ))}
    </div>
  );
}

function Discover() {
  return (
    <div className="p-3 space-y-2">
      <p className="px-2 text-xs text-muted-foreground">Suggested people you might know.</p>
      {USERS.map((u) => (
        <div key={u.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-all duration-300">
          <Avatar name={u.username} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{u.username}</p>
            <p className="text-[11px] text-muted-foreground">via mutual contacts</p>
          </div>
          <button className="flex items-center gap-1 rounded-lg bg-primary/15 text-primary text-xs px-2.5 py-1.5 font-medium hover:bg-primary/25 transition-all duration-300">
            <UserPlus className="h-3 w-3" /> Add
          </button>
        </div>
      ))}
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="p-4 space-y-5">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Account</p>
        <div className="glass rounded-xl p-4 flex items-center gap-3">
          <Avatar name="you" size={48} ring />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">you</p>
            <p className="text-xs text-muted-foreground truncate">you@nextalk.app</p>
          </div>
          <button className="text-xs text-primary font-medium hover:underline">Edit</button>
        </div>
      </section>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Appearance</p>
        <Row label="Theme" value="Dark" />
        <Row label="Accent" value="Emerald" />
        <Row label="Chat wallpaper" value="Obsidian" />
      </section>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Privacy</p>
        <Row label="Read receipts" value="On" />
        <Row label="Last seen" value="Contacts" />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2 border border-white/5 px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
