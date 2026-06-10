import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, Image as ImageIcon, Info, Mic, Paperclip, Pencil, Phone, Send, Smile, Video, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { clockTime, formatLastSeen, mediaUrl } from "@/lib/format";
import { useChat } from "@/lib/use-chat";
import { useCalls } from "@/lib/use-calls";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/api";
import { toast } from "sonner";
import type { Conversation, Message, MessageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  conv: Conversation;
  onBack?: () => void;
  onOpenDetails: () => void;
};

export function ChatView({ conv, onBack, onOpenDetails }: Props) {
  const { user } = useAuth();
  const {
    messages,
    messagesLoading,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    sendTyping,
    uploadAndSendImage,
    typingInActive,
    typingUsername,
    editMessageContent,
    blockedUserIds,
    onlineUserIds,
  } = useChat();
  const { startCall, call: activeCall } = useCalls();

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const title = conv.type === "direct" ? conv.other_user?.username ?? "Chat" : conv.name ?? "Group";
  const subtitle = typingInActive
    ? `${typingUsername ?? "Someone"} is typing…`
    : conv.type === "direct"
      ? conv.online ? "Online" : formatLastSeen(conv.other_user?.last_seen)
      : `${conv.members?.filter((m) => m.status === "accepted").length ?? 0} members`;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, conv.id]);

  function handleSend() {
    const body = draft.trim();
    if (!body) return;
    sendMessage(body);
    setDraft("");
    sendTyping(false);
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (value.trim()) sendTyping(true);
    else sendTyping(false);
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAndSendImage(file);
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to upload image");
    } finally {
      setUploading(false);
    }
    e.target.value = "";
  }

  const canCall =
    conv.type === "direct" &&
    !!conv.other_user &&
    !blockedUserIds.has(conv.other_user.id) &&
    onlineUserIds.has(conv.other_user.id) &&
    !activeCall;

  function handleStartCall(callType: "audio" | "video") {
    if (conv.type !== "direct" || !conv.other_user) {
      toast.error("Calls are only available in direct chats");
      return;
    }
    if (blockedUserIds.has(conv.other_user.id)) {
      toast.error("Cannot call this user");
      return;
    }
    if (!onlineUserIds.has(conv.other_user.id)) {
      toast.error("User is offline");
      return;
    }
    if (activeCall) {
      toast.error("Already in a call");
      return;
    }
    startCall(conv, callType);
  }

  async function saveEdit(messageId: string) {
    const body = editDraft.trim();
    if (!body) return;
    try {
      await editMessageContent(messageId, body);
      setEditingId(null);
      setEditDraft("");
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to edit");
    }
  }

  return (
    <section className="flex h-full flex-1 flex-col bg-chat-bg">
      <header className="flex items-center gap-3 px-3 md:px-5 py-3 border-b border-white/5 glass-strong">
        {onBack && (
          <button onClick={onBack} className="md:hidden grid h-9 w-9 place-items-center rounded-lg hover:bg-white/5 transition-all duration-300">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <button onClick={onOpenDetails} className="flex items-center gap-3 min-w-0 group">
          <Avatar
            name={title}
            src={conv.type === "direct" ? conv.other_user?.avatar_url : undefined}
            online={conv.type === "direct" ? conv.online : false}
          />
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold truncate group-hover:text-primary transition-all duration-300">{title}</p>
            <p className={cn("text-xs truncate", typingInActive ? "text-primary" : "text-muted-foreground")}>{subtitle}</p>
          </div>
        </button>
        <div className="ml-auto flex items-center gap-1">
          {conv.type === "direct" && (
            <>
              <HeaderIcon
                onClick={() => handleStartCall("audio")}
                disabled={!canCall}
                title={canCall ? "Voice call" : "Unavailable"}
              >
                <Phone className="h-4 w-4" />
              </HeaderIcon>
              <HeaderIcon
                onClick={() => handleStartCall("video")}
                disabled={!canCall}
                title={canCall ? "Video call" : "Unavailable"}
              >
                <Video className="h-4 w-4" />
              </HeaderIcon>
            </>
          )}
          <HeaderIcon onClick={onOpenDetails}><Info className="h-4 w-4" /></HeaderIcon>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 md:px-6 py-6 space-y-1.5">
        {hasMoreMessages && (
          <div ref={topRef} className="flex justify-center pb-2">
            <button
              onClick={() => void loadMoreMessages()}
              className="text-xs text-primary hover:underline"
            >
              Load older messages
            </button>
          </div>
        )}
        {messagesLoading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender.id === user?.id;
            const prev = messages[i - 1];
            const groupedWithPrev = prev && prev.sender.id === m.sender.id;
            return (
              <MessageBubble
                key={m.id}
                m={m}
                mine={mine}
                showAvatar={!mine && conv.type === "group" && !groupedWithPrev}
                showName={!mine && conv.type === "group" && !groupedWithPrev}
                memberColor={conv.members?.find((x) => x.user_id === m.sender.id)?.color ?? undefined}
                editing={editingId === m.id}
                editDraft={editDraft}
                onStartEdit={() => { if (mine && m.body) { setEditingId(m.id); setEditDraft(m.body); } }}
                onEditDraftChange={setEditDraft}
                onSaveEdit={() => void saveEdit(m.id)}
                onCancelEdit={() => { setEditingId(null); setEditDraft(""); }}
              />
            );
          })
        )}
        {typingInActive && (
          <div className="flex items-end gap-2 pl-1">
            <Avatar name={typingUsername ?? "?"} size={28} />
            <div className="rounded-2xl rounded-bl-sm bg-bubble-other px-4 py-3 flex items-center gap-1">
              <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" style={{ animationDelay: "0ms" }} />
              <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" style={{ animationDelay: "150ms" }} />
              <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="px-3 md:px-5 py-3 border-t border-white/5 glass-strong">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => void handleImagePick(e)} />
        <div className="flex items-end gap-2">
          <ComposerIcon><Paperclip className="h-4 w-4" /></ComposerIcon>
          <ComposerIcon onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <span className="text-xs">…</span> : <ImageIcon className="h-4 w-4" />}
          </ComposerIcon>
          <div className="flex-1 flex items-end gap-2 rounded-2xl border border-white/5 bg-surface-2 px-3 py-2 transition-all duration-300 focus-within:border-primary/40">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              onBlur={() => sendTyping(false)}
              placeholder="Write a message…"
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground max-h-32"
            />
            <button type="button" className="text-muted-foreground hover:text-foreground transition-all duration-300"><Smile className="h-4 w-4" /></button>
          </div>
          {draft.trim() ? (
            <button onClick={handleSend} className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-primary/30">
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

function HeaderIcon({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300 disabled:opacity-30 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

function ComposerIcon({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300 disabled:opacity-50">
      {children}
    </button>
  );
}

function MessageBubble({
  m, mine, showAvatar, showName, memberColor,
  editing, editDraft, onStartEdit, onEditDraftChange, onSaveEdit, onCancelEdit,
}: {
  m: Message; mine: boolean; showAvatar?: boolean; showName?: boolean; memberColor?: string;
  editing?: boolean; editDraft?: string;
  onStartEdit?: () => void; onEditDraftChange?: (v: string) => void;
  onSaveEdit?: () => void; onCancelEdit?: () => void;
}) {
  const imgSrc = mediaUrl(m.image_url, API_URL);
  return (
    <div className={cn("flex items-end gap-2 group", mine ? "justify-end" : "justify-start")}>
      {!mine && (
        <div className="w-7 shrink-0">
          {showAvatar && <Avatar name={m.sender.username} src={m.sender.avatar_url} size={28} />}
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
              : "bg-bubble-other text-foreground rounded-2xl rounded-bl-sm",
          )}
        >
          {imgSrc && (
            <a href={imgSrc} target="_blank" rel="noreferrer">
              <img src={imgSrc} alt="" className="mb-1 rounded-lg max-h-72 object-cover cursor-pointer" />
            </a>
          )}
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editDraft}
                onChange={(e) => onEditDraftChange?.(e.target.value)}
                className="w-full bg-transparent outline-none resize-none text-sm"
                rows={2}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={onCancelEdit} className="text-xs opacity-70 hover:opacity-100"><X className="h-3 w-3 inline" /></button>
                <button onClick={onSaveEdit} className="text-xs font-medium">Save</button>
              </div>
            </div>
          ) : (
            m.body && <p className="whitespace-pre-wrap">{m.body}</p>
          )}
          <div className={cn("flex items-center gap-1 mt-1 text-[10px]", mine ? "text-white/70 justify-end" : "text-muted-foreground")}>
            <span>{clockTime(m.created_at)}{m.edited_at ? " · edited" : ""}</span>
            {mine && !editing && m.body && (
              <button onClick={onStartEdit} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" title="Edit">
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {mine && <ReadReceipt status={m.status ?? undefined} />}
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
