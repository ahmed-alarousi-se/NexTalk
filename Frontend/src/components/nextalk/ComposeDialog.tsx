import { useMemo, useState } from "react";
import { MessageCircle, Users, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { useChat } from "@/lib/use-chat";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Mode = "direct" | "group";

export function ComposeDialog({ open, onClose }: Props) {
  const {
    contacts,
    contactsLoading,
    discoverUsers,
    discoverLoading,
    searchPeople,
    startChat,
    createGroup,
  } = useChat();

  const [mode, setMode] = useState<Mode>("direct");
  const [q, setQ] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    if (mode === "group" && !q.trim()) {
      return contacts.map((c) => c.user);
    }
    return discoverUsers;
  }, [mode, q, contacts, discoverUsers]);

  if (!open) return null;

  function handleSearch(value: string) {
    setQ(value);
    if (value.trim()) searchPeople(value.trim());
  }

  function toggleUser(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDirect(userId: string) {
    setBusy(true);
    try {
      await startChat(userId);
      onClose();
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
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md glass-strong rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold">New conversation</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-2 border border-white/5">
            <ModeBtn active={mode === "direct"} onClick={() => setMode("direct")} icon={<MessageCircle className="h-4 w-4" />} label="Direct chat" />
            <ModeBtn active={mode === "group"} onClick={() => setMode("group")} icon={<Users className="h-4 w-4" />} label="New group" />
          </div>
        </div>

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

        <div className="px-5 py-4">
          <input
            value={q}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={mode === "group" && !q.trim() ? "Search contacts to invite…" : "Search by username or email…"}
            className="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
          />
        </div>

        <div className="max-h-64 overflow-y-auto scrollbar-thin px-3 pb-3">
          {(discoverLoading || contactsLoading) && results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {mode === "group" && !q.trim() ? "No contacts yet. Search for people first." : "No users found."}
            </p>
          ) : (
            results.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
                <Avatar name={u.username} src={u.avatar_url} />
                <p className="flex-1 text-sm font-medium truncate">{u.username}</p>
                {mode === "direct" ? (
                  <button
                    disabled={busy}
                    onClick={() => void handleDirect(u.id)}
                    className="rounded-lg bg-primary text-primary-foreground text-xs px-3 py-1.5 font-medium disabled:opacity-50"
                  >
                    Chat
                  </button>
                ) : (
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
                )}
              </div>
            ))
          )}
        </div>

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

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
