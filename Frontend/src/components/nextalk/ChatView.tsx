import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, Image as ImageIcon, Info, Mic, Paperclip, Phone, Send, Smile, Video } from "lucide-react";
import { Avatar } from "./Avatar";
import { MESSAGES_BY_CONV, ME, clockTime, type Conversation, type Message, type MessageStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Props = {
  conv: Conversation;
  onBack?: () => void;
  onOpenDetails: () => void;
};

export function ChatView({ conv, onBack, onOpenDetails }: Props) {
  const initial = MESSAGES_BY_CONV[conv.id] ?? [];
  const [messages, setMessages] = useState<Message[]>(initial);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const title = conv.type === "direct" ? conv.other_user?.username ?? "Chat" : conv.name ?? "Group";
  const subtitle = conv.typing
    ? "typing…"
    : conv.type === "direct"
    ? conv.online ? "Online" : "Last seen recently"
    : `${conv.members?.length ?? 0} members`;

  useEffect(() => {
    setMessages(MESSAGES_BY_CONV[conv.id] ?? []);
  }, [conv.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    const m: Message = {
      id: `local-${Date.now()}`,
      conversation_id: conv.id,
      sender: ME,
      body,
      cursor_key: `Z${Date.now()}`,
      created_at: new Date().toISOString(),
      status: "SENT",
    };
    setMessages((prev) => [...prev, m]);
    setDraft("");
    // simulate delivery + read
    setTimeout(() => setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, status: "DELIVERED" } : x)), 700);
    setTimeout(() => setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, status: "READ" } : x)), 1800);
  }

  return (
    <section className="flex h-full flex-1 flex-col bg-chat-bg">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 md:px-5 py-3 border-b border-white/5 glass-strong">
        {onBack && (
          <button onClick={onBack} className="md:hidden grid h-9 w-9 place-items-center rounded-lg hover:bg-white/5 transition-all duration-300">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <button onClick={onOpenDetails} className="flex items-center gap-3 min-w-0 group">
          <Avatar name={title} online={conv.type === "direct" ? conv.online : false} />
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold truncate group-hover:text-primary transition-all duration-300">{title}</p>
            <p className={cn("text-xs truncate", conv.typing ? "text-primary" : "text-muted-foreground")}>{subtitle}</p>
          </div>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <HeaderIcon><Phone className="h-4 w-4" /></HeaderIcon>
          <HeaderIcon><Video className="h-4 w-4" /></HeaderIcon>
          <HeaderIcon onClick={onOpenDetails}><Info className="h-4 w-4" /></HeaderIcon>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 md:px-6 py-6 space-y-1.5">
        <DayDivider label="Today" />
        {messages.map((m, i) => {
          const mine = m.sender.id === ME.id;
          const prev = messages[i - 1];
          const groupedWithPrev = prev && prev.sender.id === m.sender.id;
          return (
            <MessageBubble
              key={m.id}
              m={m}
              mine={mine}
              showAvatar={!mine && conv.type === "group" && !groupedWithPrev}
              showName={!mine && conv.type === "group" && !groupedWithPrev}
              memberColor={conv.members?.find((x) => x.user_id === m.sender.id)?.color}
            />
          );
        })}
        {conv.typing && (
          <div className="flex items-end gap-2 pl-1">
            <Avatar name={conv.other_user?.username ?? "?"} size={28} />
            <div className="rounded-2xl rounded-bl-sm bg-bubble-other px-4 py-3 flex items-center gap-1">
              <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" style={{ animationDelay: "0ms" }} />
              <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" style={{ animationDelay: "150ms" }} />
              <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="px-3 md:px-5 py-3 border-t border-white/5 glass-strong">
        <div className="flex items-end gap-2">
          <ComposerIcon><Paperclip className="h-4 w-4" /></ComposerIcon>
          <ComposerIcon><ImageIcon className="h-4 w-4" /></ComposerIcon>
          <div className="flex-1 flex items-end gap-2 rounded-2xl border border-white/5 bg-surface-2 px-3 py-2 transition-all duration-300 focus-within:border-primary/40">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Write a message…"
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground max-h-32"
            />
            <button className="text-muted-foreground hover:text-foreground transition-all duration-300"><Smile className="h-4 w-4" /></button>
          </div>
          {draft.trim() ? (
            <button onClick={send} className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-primary/30">
              <Send className="h-4 w-4" />
            </button>
          ) : (
            <ComposerIcon><Mic className="h-4 w-4" /></ComposerIcon>
          )}
        </div>
      </div>
    </section>
  );
}

function HeaderIcon({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300">
      {children}
    </button>
  );
}
function ComposerIcon({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300">
      {children}
    </button>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-3">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-surface-2 px-3 py-1 rounded-full border border-white/5">{label}</span>
    </div>
  );
}

function MessageBubble({ m, mine, showAvatar, showName, memberColor }: { m: Message; mine: boolean; showAvatar?: boolean; showName?: boolean; memberColor?: string }) {
  return (
    <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine && (
        <div className="w-7 shrink-0">
          {showAvatar && <Avatar name={m.sender.username} size={28} />}
        </div>
      )}
      <div className={cn("max-w-[78%] md:max-w-[60%] flex flex-col gap-1", mine ? "items-end" : "items-start")}>
        {showName && (
          <span className="text-[11px] font-semibold px-1" style={{ color: memberColor ?? "var(--color-muted-foreground)" }}>
            {m.sender.username}
          </span>
        )}
        <div
          className={cn(
            "px-3.5 py-2 text-sm shadow-md break-words",
            mine
              ? "bg-bubble-self text-white rounded-2xl rounded-br-sm"
              : "bg-bubble-other text-foreground rounded-2xl rounded-bl-sm"
          )}
        >
          {m.image_url && (
            <img src={m.image_url} alt="" className="mb-1 rounded-lg max-h-72 object-cover" />
          )}
          {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
          <div className={cn("flex items-center gap-1 mt-1 text-[10px]", mine ? "text-white/70 justify-end" : "text-muted-foreground")}>
            <span>{clockTime(m.created_at)}</span>
            {mine && <ReadReceipt status={m.status} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadReceipt({ status }: { status?: MessageStatus }) {
  if (!status) return null;
  if (status === "SENT") return <Check className="h-3 w-3" />;
  if (status === "DELIVERED") return <CheckCheck className="h-3 w-3" />;
  return <CheckCheck className="h-3 w-3 text-sky-300" />;
}
