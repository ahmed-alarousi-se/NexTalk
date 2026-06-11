import { useState } from "react";
import { ArrowLeft, Bell, BellOff, Check, Crown, Image as ImageIcon, KeyRound, LogOut, Search, Shield, ShieldBan, Trash2, UserPlus, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Avatar } from "./Avatar";
import { MediaGallery } from "./MediaGallery";
import { formatLastSeen, isOnline, timeAgo } from "@/lib/format";
import { useChat } from "@/lib/use-chat";
import { useAuth } from "@/lib/auth";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type PanelKind = "details" | "requests" | "notifications" | "discover" | "settings" | null;

type Props = {
  panel: PanelKind;
  conv?: Conversation | null;
  onClose: () => void;
};

export function RightPanel({ panel, conv, onClose }: Props) {
  if (!panel) return null;
  return (
    <aside className="hidden lg:flex h-full w-[340px] flex-col glass-strong border-l border-white/5 animate-in slide-in-from-right duration-300">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-semibold tracking-tight">{titleFor(panel)}</h2>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <PanelContent panel={panel} conv={conv} onClose={onClose} />
      </div>
    </aside>
  );
}

export function PanelContent({ panel, conv, onClose: _onClose }: Props) {
  if (!panel) return null;
  return (
    <>
      {panel === "details" && conv && <Details conv={conv} />}
      {panel === "requests" && <Requests />}
      {panel === "notifications" && <Notifications />}
      {panel === "discover" && <Discover />}
      {panel === "settings" && <SettingsPanel />}
    </>
  );
}

function titleFor(p: Exclude<PanelKind, null>) {
  return ({
    details: "Details",
    requests: "Message Requests",
    notifications: "Notifications",
    discover: "Discover people",
    settings: "Settings",
  } as const)[p];
}

type DetailsView = "main" | "media" | "privacy";

function Details({ conv }: { conv: Conversation }) {
  const { user, updatePrivacy } = useAuth();
  const {
    removeConversation,
    leaveGroupChat,
    groupDetails,
    isGroupAdmin,
    pendingInvitations,
    contacts,
    updateGroupDetails,
    inviteToGroup,
    removeFromGroup,
    toggleMute,
    isMuted,
    mediaItems,
    refreshMedia,
    blockUserById,
    blockedUserIds,
  } = useChat();
  const [view, setView] = useState<DetailsView>("main");
  const [editName, setEditName] = useState(conv.name ?? "");
  const [editDesc, setEditDesc] = useState(conv.description ?? "");
  const [inviteQ, setInviteQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const name = conv.type === "direct" ? conv.other_user?.username ?? "" : conv.name ?? "";
  const members = conv.members ?? groupDetails?.members ?? [];

  const inviteCandidates = contacts
    .map((c) => c.user)
    .filter((u) => !members.some((m) => m.user_id === u.id))
    .filter((u) => !inviteQ.trim() || u.username.toLowerCase().includes(inviteQ.toLowerCase()));

  async function saveGroup() {
    setSaving(true);
    try {
      await updateGroupDetails({
        name: editName.trim() || undefined,
        description: editDesc.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  async function inviteUser(userId: string) {
    setInviting(true);
    try {
      await inviteToGroup([userId]);
    } finally {
      setInviting(false);
    }
  }

  const otherUserId = conv.type === "direct" ? conv.other_user?.id : undefined;
  const isOtherBlocked = otherUserId ? blockedUserIds.has(otherUserId) : false;

  if (view === "media") {
    return <MediaGallery onBack={() => setView("main")} />;
  }

  if (view === "privacy") {
    return (
      <PrivacyPanel
        conv={conv}
        otherUserId={otherUserId}
        isOtherBlocked={isOtherBlocked}
        privacyBusy={privacyBusy}
        blockBusy={blockBusy}
        onBack={() => setView("main")}
        onToggleShowLastSeen={async (value) => {
          setPrivacyBusy(true);
          try {
            await updatePrivacy({ show_last_seen: value });
            toast.success(value ? "Last seen visible" : "Last seen hidden");
          } catch (err) {
            toast.error((err as Error).message ?? "Failed to update setting");
          } finally {
            setPrivacyBusy(false);
          }
        }}
        onToggleReadReceipts={async (value) => {
          setPrivacyBusy(true);
          try {
            await updatePrivacy({ read_receipts_enabled: value });
            toast.success(value ? "Read receipts on" : "Read receipts off");
          } catch (err) {
            toast.error((err as Error).message ?? "Failed to update setting");
          } finally {
            setPrivacyBusy(false);
          }
        }}
        onBlock={async () => {
          if (!otherUserId || !window.confirm(`Block ${conv.other_user?.username ?? "this user"}?`)) return;
          setBlockBusy(true);
          try {
            await blockUserById(otherUserId);
          } finally {
            setBlockBusy(false);
          }
        }}
      />
    );
  }

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
            {conv.type === "direct"
              ? (conv.online ? "Active now" : formatLastSeen(conv.other_user?.last_seen))
              : `${members.length} members`}
          </p>
        </div>
        {conv.description && <p className="text-sm text-muted-foreground max-w-[260px]">{conv.description}</p>}
      </div>

      {conv.type === "group" && isGroupAdmin && (
        <div className="space-y-3 rounded-xl border border-white/5 bg-surface-2/50 p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Edit group</p>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary/40"
          />
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Description"
            rows={2}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm outline-none resize-none focus:border-primary/40"
          />
          <button
            disabled={saving}
            onClick={() => void saveGroup()}
            className="w-full rounded-lg bg-primary text-primary-foreground text-xs py-2 font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <ActionTile
          icon={isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          label={isMuted ? "Unmute" : "Mute"}
          active={isMuted}
          onClick={() => void toggleMute()}
        />
        <ActionTile
          icon={<ImageIcon className="h-4 w-4" />}
          label="Media"
          badge={mediaItems.length > 0 ? String(mediaItems.length) : undefined}
          onClick={() => { refreshMedia(); setView("media"); }}
        />
        <ActionTile
          icon={<Shield className="h-4 w-4" />}
          label="Privacy"
          onClick={() => setView("privacy")}
        />
      </div>

      {conv.type === "group" && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Members</p>
          <ul className="space-y-1">
            {members.map((m) => (
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
                {isGroupAdmin && m.user_id !== user?.id && m.role !== "admin" && (
                  <button
                    onClick={() => void removeFromGroup(m.user_id)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {m.color && <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />}
              </li>
            ))}
          </ul>

          {isGroupAdmin && pendingInvitations.filter((i) => i.status === "pending").length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending invitations</p>
              {pendingInvitations.filter((i) => i.status === "pending").map((i) => (
                <p key={i.user_id} className="text-xs text-muted-foreground px-2">{i.username} — awaiting response</p>
              ))}
            </div>
          )}

          {isGroupAdmin && (
            <div className="mt-3 space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Invite contacts</p>
              <input
                value={inviteQ}
                onChange={(e) => setInviteQ(e.target.value)}
                placeholder="Filter contacts…"
                className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-xs outline-none focus:border-primary/40"
              />
              {inviteCandidates.slice(0, 5).map((u) => (
                <div key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <Avatar name={u.username} src={u.avatar_url} size={28} />
                  <span className="flex-1 text-xs truncate">{u.username}</span>
                  <button
                    disabled={inviting}
                    onClick={() => void inviteUser(u.id)}
                    className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => void (conv.type === "group" ? leaveGroupChat() : removeConversation())}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive py-2.5 text-sm font-medium hover:bg-destructive/20 transition-all duration-300"
      >
        <LogOut className="h-4 w-4" /> {conv.type === "group" ? "Leave group" : "Delete conversation"}
      </button>
    </div>
  );
}

function ActionTile({
  icon, label, onClick, active, badge,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs transition-all duration-300",
        active
          ? "bg-primary/15 border-primary/30 text-primary"
          : "bg-surface-2 border-white/5 hover:border-primary/30 hover:bg-primary/5",
      )}
    >
      <span className="text-primary">{icon}</span>
      {label}
      {badge && (
        <span className="absolute top-1.5 right-1.5 rounded-full bg-primary/20 text-primary text-[9px] px-1.5 py-0.5 font-medium">
          {badge}
        </span>
      )}
    </button>
  );
}

function PrivacyPanel({
  conv, otherUserId, isOtherBlocked, privacyBusy, blockBusy, onBack,
  onToggleShowLastSeen, onToggleReadReceipts, onBlock,
}: {
  conv: Conversation;
  otherUserId?: string;
  isOtherBlocked: boolean;
  privacyBusy: boolean;
  blockBusy: boolean;
  onBack: () => void;
  onToggleShowLastSeen: (value: boolean) => Promise<void>;
  onToggleReadReceipts: (value: boolean) => Promise<void>;
  onBlock: () => Promise<void>;
}) {
  const { user } = useAuth();

  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to details
      </button>

      <p className="text-xs uppercase tracking-wider text-muted-foreground">Your privacy</p>
      <ToggleRow
        label="Show last seen"
        description="Let others see when you were last active"
        checked={user?.showLastSeen ?? true}
        disabled={privacyBusy}
        onChange={(v) => void onToggleShowLastSeen(v)}
      />
      <ToggleRow
        label="Read receipts"
        description="Let others know when you've read their messages"
        checked={user?.readReceiptsEnabled ?? true}
        disabled={privacyBusy}
        onChange={(v) => void onToggleReadReceipts(v)}
      />

      {conv.type === "direct" && otherUserId && (
        <div className="pt-2 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">This conversation</p>
          <button
            disabled={blockBusy || isOtherBlocked}
            onClick={() => void onBlock()}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive py-2.5 text-sm font-medium hover:bg-destructive/20 disabled:opacity-50"
          >
            <ShieldBan className="h-4 w-4" />
            {isOtherBlocked ? "User blocked" : `Block ${conv.other_user?.username ?? "user"}`}
          </button>
          <p className="text-[11px] text-muted-foreground px-1">
            Blocked users cannot message you or send contact requests.
          </p>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label, description, checked, disabled, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-white/5 bg-surface-2/50 p-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-primary"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">{description}</span>
      </span>
    </label>
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
          const groupId = n.type === "group_invitation"
            ? ((n.data?.group_id ?? n.data?.conversation_id) as string | undefined)
            : undefined;
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
  const {
    discoverUsers,
    discoverLoading,
    searchPeople,
    addContact,
    startChat,
    contacts,
    contactsLoading,
    contactUserIds,
    removeContactFromList,
    groupSearchResults,
    groupSearchLoading,
    searchGroupsByName,
    joinGroupRequest,
  } = useChat();
  const [tab, setTab] = useState<"search" | "contacts" | "groups">("search");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Record<string, "contact" | "chat" | "busy">>({});

  function handleSearch(value: string) {
    setQ(value);
    if (tab === "groups") searchGroupsByName(value.trim());
    else searchPeople(value.trim());
  }

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2 border border-white/5">
        <button onClick={() => setTab("search")} className={cn("rounded-lg py-1.5 text-xs font-medium", tab === "search" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Find</button>
        <button onClick={() => setTab("contacts")} className={cn("rounded-lg py-1.5 text-xs font-medium", tab === "contacts" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Contacts</button>
        <button onClick={() => setTab("groups")} className={cn("rounded-lg py-1.5 text-xs font-medium", tab === "groups" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Groups</button>
      </div>

      {tab === "search" ? (
        <>
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
              <UserRow
                key={u.id}
                u={u}
                isContact={contactUserIds.has(u.id)}
                status={status[u.id]}
                onAdd={() => {
                  setStatus((s) => ({ ...s, [u.id]: "busy" }));
                  void addContact(u.username)
                    .then(() => setStatus((s) => ({ ...s, [u.id]: "contact" })))
                    .catch(() => setStatus((s) => ({ ...s, [u.id]: "busy" })));
                }}
                onChat={() => {
                  setStatus((s) => ({ ...s, [u.id]: "busy" }));
                  void startChat(u.id).finally(() => setStatus((s) => ({ ...s, [u.id]: "chat" })));
                }}
              />
            ))
          )}
        </>
      ) : tab === "contacts" ? (
        contactsLoading ? (
          <p className="text-sm text-center text-muted-foreground py-6">Loading contacts…</p>
        ) : contacts.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No contacts yet. Find people and send a request.</p>
        ) : (
          contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-all duration-300">
              <Avatar name={c.user.username} src={c.user.avatar_url} online={isOnline(c.user.last_seen)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.user.username}</p>
                <p className="text-[10px] text-muted-foreground">Added {timeAgo(c.added_at)} ago</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => void startChat(c.user.id)}
                  className="rounded-lg bg-primary/15 text-primary text-xs px-2 py-1.5 font-medium hover:bg-primary/25"
                >
                  Chat
                </button>
                <button
                  onClick={() => void removeContactFromList(c.user.id)}
                  className="rounded-lg bg-white/5 text-muted-foreground text-xs px-2 py-1.5 hover:text-destructive hover:bg-destructive/10"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-surface-2 border border-white/5 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search groups by name…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {!q.trim() ? (
            <p className="px-2 text-xs text-muted-foreground">Find groups to request joining.</p>
          ) : groupSearchLoading ? (
            <p className="text-sm text-center text-muted-foreground py-6">Searching…</p>
          ) : groupSearchResults.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-6">No groups found.</p>
          ) : (
            groupSearchResults.map((g) => (
              <div key={g.id} className="rounded-xl p-3 border border-white/5 bg-surface-2/50 space-y-2">
                <div>
                  <p className="text-sm font-semibold">{g.name}</p>
                  {g.description && <p className="text-xs text-muted-foreground line-clamp-2">{g.description}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{g.member_count} members</p>
                </div>
                <button
                  disabled={g.join_status === "pending"}
                  onClick={() => void joinGroupRequest(g.id)}
                  className="w-full rounded-lg bg-primary/15 text-primary text-xs py-1.5 font-medium disabled:opacity-50"
                >
                  {g.join_status === "pending" ? "Request pending" : "Request to join"}
                </button>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

function UserRow({
  u,
  isContact,
  status,
  onAdd,
  onChat,
}: {
  u: { id: string; username: string; avatar_url?: string | null };
  isContact: boolean;
  status?: "contact" | "chat" | "busy";
  onAdd: () => void;
  onChat: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-all duration-300">
      <Avatar name={u.username} src={u.avatar_url} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{u.username}</p>
        {isContact && <p className="text-[10px] text-primary">Contact</p>}
      </div>
      <div className="flex gap-1">
        {!isContact && (
          <button
            disabled={status === "busy" || status === "contact"}
            onClick={onAdd}
            className="flex items-center gap-1 rounded-lg bg-primary/15 text-primary text-xs px-2 py-1.5 font-medium hover:bg-primary/25 transition-all duration-300 disabled:opacity-50"
          >
            <UserPlus className="h-3 w-3" />
            {status === "contact" ? "Sent" : "Add"}
          </button>
        )}
        <button
          disabled={status === "busy"}
          onClick={onChat}
          className="rounded-lg bg-white/5 text-foreground text-xs px-2 py-1.5 font-medium hover:bg-white/10 transition-all duration-300 disabled:opacity-50"
        >
          Chat
        </button>
      </div>
    </div>
  );
}

function SettingsPanel() {
  const { user } = useAuth();
  const { blockedUsers, unblockUserById } = useChat();
  const [unblockBusy, setUnblockBusy] = useState<string | null>(null);

  return (
    <div className="p-4 space-y-5">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Blocked users</p>
        {blockedUsers.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">No blocked users.</p>
        ) : (
          <ul className="space-y-1">
            {blockedUsers.map((b) => (
              <li key={b.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                <Avatar name={b.username} src={b.avatar_url} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{b.username}</p>
                  <p className="text-[10px] text-muted-foreground">Blocked {timeAgo(b.blocked_at)} ago</p>
                </div>
                <button
                  disabled={unblockBusy === b.user_id}
                  onClick={() => {
                    setUnblockBusy(b.user_id);
                    void unblockUserById(b.user_id).finally(() => setUnblockBusy(null));
                  }}
                  className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
