import { useMemo, useState } from "react";
import { BookUser, Search, UserPlus, Users, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { useChat } from "@/lib/use-chat";
import { isOnline } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Mode = "contacts" | "new-contact" | "group";

export function ComposeDialog({ open, onClose }: Props) {
  const {
    contacts,
    contactsLoading,
    discoverUsers,
    discoverLoading,
    searchPeople,
    startChat,
    createGroup,
    addContact,
    contactUserIds,
  } = useChat();

  const [mode, setMode] = useState<Mode>("contacts");
  const [q, setQ] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [addStatus, setAddStatus] = useState<Record<string, "sent" | "busy">>({});

  const filteredContacts = useMemo(() => {
    if (!q.trim()) return contacts;
    return contacts.filter((c) =>
      c.user.username.toLowerCase().includes(q.toLowerCase()),
    );
  }, [contacts, q]);

  if (!open) return null;

  function handleClose() {
    setMode("contacts");
    setQ("");
    setGroupName("");
    setGroupDesc("");
    setSelected(new Set());
    setBusy(false);
    setAddStatus({});
    onClose();
  }

  function handleSearch(value: string) {
    setQ(value);
    if (mode === "new-contact" && value.trim()) searchPeople(value.trim());
  }

  function switchMode(next: Mode) {
    setMode(next);
    setQ("");
  }

  function toggleUser(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleStartChat(userId: string) {
    setBusy(true);
    try {
      await startChat(userId);
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateGroup() {
    if (!groupName.trim()) return;
    setBusy(true);
    try {
      await createGroup({
        name: groupName.trim(),
        description: groupDesc.trim() || undefined,
        participant_ids: [...selected],
      });
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Mode; icon: React.ReactNode; label: string }[] = [
    { id: "contacts", icon: <BookUser className="h-4 w-4" />, label: "My Contacts" },
    { id: "new-contact", icon: <UserPlus className="h-4 w-4" />, label: "New Contact" },
    { id: "group", icon: <Users className="h-4 w-4" />, label: "New Group" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} aria-label="Close" />
      <div className="relative w-full max-w-md glass-strong rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold">
            {mode === "contacts" ? "My Contacts" : mode === "new-contact" ? "New Contact" : "New Group"}
          </h2>
          <button onClick={handleClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Tabs */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-surface-2 border border-white/5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => switchMode(t.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all duration-200",
                  mode === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Group name / description fields */}
        {mode === "group" && (
          <div className="px-5 pt-4 space-y-3">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
            />
            <input
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
            />
          </div>
        )}

        {/* Search bar (contacts filter or people search) */}
        <div className="px-5 py-4">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-2 px-3 py-2.5 transition-all focus-within:border-primary/40">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={q}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={
                mode === "contacts"
                  ? "Filter contacts…"
                  : mode === "new-contact"
                    ? "Search by username or email…"
                    : "Search contacts to invite…"
              }
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        {/* List */}
        <div className="max-h-64 overflow-y-auto scrollbar-thin px-3 pb-3">

          {/* My Contacts */}
          {mode === "contacts" && (
            contactsLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : filteredContacts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {q ? `No contacts match "${q}".` : "No contacts yet. Use New Contact to find people."}
              </p>
            ) : (
              filteredContacts.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-all duration-200">
                  <Avatar name={c.user.username} src={c.user.avatar_url} online={isOnline(c.user.last_seen)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.user.username}</p>
                    <p className="text-[10px] text-muted-foreground">{isOnline(c.user.last_seen) ? "Online" : "Offline"}</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => void handleStartChat(c.user.id)}
                    className="rounded-lg bg-primary text-primary-foreground text-xs px-3 py-1.5 font-medium disabled:opacity-50 hover:opacity-90 transition-all"
                  >
                    Chat
                  </button>
                </div>
              ))
            )
          )}

          {/* New Contact */}
          {mode === "new-contact" && (
            !q.trim() ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Search for a person to add or message.</p>
            ) : discoverLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
            ) : discoverUsers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
            ) : (
              discoverUsers.map((u) => {
                const isContact = contactUserIds.has(u.id);
                const st = addStatus[u.id];
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-all duration-200">
                    <Avatar name={u.username} src={u.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.username}</p>
                      {isContact && <p className="text-[10px] text-primary">Contact</p>}
                    </div>
                    <div className="flex gap-1.5">
                      {!isContact && (
                        <button
                          disabled={st === "busy" || st === "sent"}
                          onClick={() => {
                            setAddStatus((s) => ({ ...s, [u.id]: "busy" }));
                            void addContact(u.username)
                              .then(() => setAddStatus((s) => ({ ...s, [u.id]: "sent" })))
                              .catch(() => setAddStatus((s) => ({ ...s, [u.id]: "busy" })));
                          }}
                          className="flex items-center gap-1 rounded-lg bg-primary/15 text-primary text-xs px-2 py-1.5 font-medium hover:bg-primary/25 transition-all disabled:opacity-50"
                        >
                          <UserPlus className="h-3 w-3" />
                          {st === "sent" ? "Sent" : "Add"}
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => void handleStartChat(u.id)}
                        className="rounded-lg bg-white/5 text-foreground text-xs px-2 py-1.5 font-medium hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        Chat
                      </button>
                    </div>
                  </div>
                );
              })
            )
          )}

          {/* New Group — invite from contacts */}
          {mode === "group" && (
            (() => {
              const pool = q.trim()
                ? discoverUsers
                : contacts.map((c) => c.user);
              const loading = q.trim() ? discoverLoading : contactsLoading;
              return loading && pool.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
              ) : pool.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {q ? "No users found." : "No contacts yet. Search above to find people."}
                </p>
              ) : (
                pool.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-all duration-200">
                    <Avatar name={u.username} src={u.avatar_url} />
                    <p className="flex-1 text-sm font-medium truncate">{u.username}</p>
                    <button
                      onClick={() => toggleUser(u.id)}
                      className={cn(
                        "rounded-lg text-xs px-3 py-1.5 font-medium border transition-all",
                        selected.has(u.id)
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      )}
                    >
                      {selected.has(u.id) ? "Selected" : "Invite"}
                    </button>
                  </div>
                ))
              );
            })()
          )}
        </div>

        {/* Group create footer */}
        {mode === "group" && (
          <footer className="px-5 py-4 border-t border-white/5">
            <button
              disabled={busy || !groupName.trim()}
              onClick={() => void handleCreateGroup()}
              className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Creating…" : `Create group${selected.size ? ` (${selected.size} invited)` : ""}`}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
