import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, Image as ImageIcon, Info, Mic, Paperclip, Pencil, Phone, PhoneIncoming, PhoneMissed, PhoneOff, Send, Smile, Video, X } from "lucide-react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { Avatar } from "./Avatar";
import { callLogLabel, type CallLog } from "@/lib/call-log";
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const title = conv.type === "direct" ? conv.other_user?.username ?? "Chat" : conv.name ?? "Group";
  const subtitle = typingInActive
    ? `${typingUsername ?? "Someone"} is typing…`
    : conv.type === "direct"
      ? conv.online ? "Online" : formatLastSeen(conv.other_user?.last_seen)
      : `${conv.members?.filter((m) => m.status === "accepted").length ?? 0} members`;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, conv.id]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insidePicker = emojiPickerRef.current?.contains(target);
      const insideButton = emojiButtonRef.current?.contains(target);
      if (!insidePicker && !insideButton) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  function handleSend() {
    const body = draft.trim();
    if (!body) return;
    sendMessage(body);
    setDraft("");
    sendTyping(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (value.trim()) sendTyping(true);
    else sendTyping(false);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }
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

  function handleEmojiSelect(emoji: { native: string }) {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart ?? draft.length;
      const end = ta.selectionEnd ?? draft.length;
      const next = draft.slice(0, start) + emoji.native + draft.slice(end);
      setDraft(next);
      handleDraftChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + emoji.native.length;
        ta.setSelectionRange(pos, pos);
      });
    } else {
      const next = draft + emoji.native;
      setDraft(next);
      handleDraftChange(next);
    }
    setShowEmojiPicker(false);
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
    <section className="flex h-full flex-1 flex-col bg-chat-bg min-w-0">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 md:px-5 py-2.5 border-b border-white/5 glass-strong shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden grid h-10 w-10 place-items-center rounded-lg hover:bg-white/5 active:bg-white/10 transition-all duration-300 shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        )}
        <button onClick={onOpenDetails} className="flex items-center gap-3 min-w-0 flex-1 group py-1">
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
        <div className="flex items-center gap-0.5 shrink-0">
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
          <HeaderIcon onClick={onOpenDetails} title="Details">
            <Info className="h-4 w-4" />
          </HeaderIcon>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 md:px-6 py-4 space-y-1.5">
        {hasMoreMessages && (
          <div ref={topRef} className="flex justify-center pb-2">
            <button
              onClick={() => void loadMoreMessages()}
              className="text-xs text-primary hover:underline px-4 py-2"
            >
              Load older messages
            </button>
          </div>
        )}
        {messagesLoading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hello! 👋</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender.id === user?.id;
            const prev = messages[i - 1];
            const groupedWithPrev = prev && prev.sender.id === m.sender.id;

            if (m.message_type === "call" && m.call_log) {
              return (
                <CallLogBubble
                  key={m.id}
                  callLog={m.call_log}
                  senderId={m.sender.id}
                  viewerId={user?.id}
                  createdAt={m.created_at}
                />
              );
            }

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

      {/* Composer */}
      <div ref={composerRef} className="px-3 md:px-4 py-3 border-t border-white/5 glass-strong shrink-0">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => void handleImagePick(e)}
        />
        <div className="relative flex items-end gap-1.5 sm:gap-2">
          {showEmojiPicker && (
            <div
              ref={emojiPickerRef}
              className="absolute bottom-full mb-2 z-50 drop-shadow-2xl"
              style={{
                right: 0,
                maxWidth: "min(352px, calc(100vw - 24px))",
              }}
            >
              <Picker
                data={data}
                onEmojiSelect={handleEmojiSelect}
                theme="dark"
                previewPosition="none"
                skinTonePosition="none"
              />
            </div>
          )}

          <ComposerIcon disabled title="Attach file (coming soon)">
            <Paperclip className="h-4 w-4" />
          </ComposerIcon>
          <ComposerIcon onClick={() => fileRef.current?.click()} disabled={uploading} title="Send image">
            {uploading ? <span className="text-xs font-medium">…</span> : <ImageIcon className="h-4 w-4" />}
          </ComposerIcon>

          <div className="flex-1 flex items-end gap-2 rounded-2xl border border-white/5 bg-surface-2 px-3 py-2 transition-all duration-300 focus-within:border-primary/40 min-w-0">
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              onBlur={() => sendTyping(false)}
              placeholder="Write a message…"
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground overflow-y-auto min-w-0"
              style={{ height: "auto", maxHeight: "120px" }}
            />
            <button
              ref={emojiButtonRef}
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className={cn("shrink-0 grid h-7 w-7 place-items-center rounded-md transition-all duration-300", showEmojiPicker ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              title="Emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
          </div>

          {draft.trim() ? (
            <button
              onClick={handleSend}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-primary/30"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          ) : (
            <ComposerIcon title="Voice message (coming soon)">
              <Mic className="h-4 w-4" />
            </ComposerIcon>
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
      className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-white/10 transition-all duration-300 disabled:opacity-30 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

function ComposerIcon({ children, onClick, disabled, title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-white/10 transition-all duration-300 disabled:opacity-50"
    >
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
      <div className={cn("max-w-[82%] sm:max-w-[72%] md:max-w-[62%] flex flex-col gap-1", mine ? "items-end" : "items-start")}>
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
              <img src={imgSrc} alt="" className="mb-1 rounded-lg max-h-64 sm:max-h-72 w-full object-cover cursor-pointer" />
            </a>
          )}
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editDraft}
                onChange={(e) => onEditDraftChange?.(e.target.value)}
                className="w-full bg-transparent outline-none resize-none text-sm min-w-[160px]"
                rows={2}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={onCancelEdit} className="text-xs opacity-70 hover:opacity-100 p-1">
                  <X className="h-3.5 w-3.5 inline" />
                </button>
                <button onClick={onSaveEdit} className="text-xs font-medium px-2 py-1 rounded-md bg-white/10 hover:bg-white/20">
                  Save
                </button>
              </div>
            </div>
          ) : (
            m.body && <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
          )}
          <div className={cn("flex items-center gap-1 mt-1 text-[10px]", mine ? "text-white/70 justify-end" : "text-muted-foreground")}>
            <span>{clockTime(m.created_at)}{m.edited_at ? " · edited" : ""}</span>
            {mine && !editing && m.body && (
              <button onClick={onStartEdit} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 p-0.5" title="Edit">
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

function CallLogBubble({
  callLog,
  senderId,
  viewerId,
  createdAt,
}: {
  callLog: CallLog;
  senderId: string;
  viewerId?: string;
  createdAt: string;
}) {
  const { title, subtitle, tone } = callLogLabel(callLog, viewerId, senderId);
  const Icon =
    tone === "missed" ? PhoneMissed : tone === "declined" ? PhoneOff : callLog.call_type === "video" ? Video : PhoneIncoming;

  return (
    <div className="flex justify-center py-2">
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs shadow-sm",
          tone === "missed" && "border-destructive/30 bg-destructive/10 text-destructive",
          tone === "declined" && "border-amber-500/30 bg-amber-500/10 text-amber-200",
          tone === "neutral" && "border-white/10 bg-surface/80 text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{title}</span>
        {subtitle && <span className="opacity-80 hidden sm:inline">· {subtitle}</span>}
        <span className="opacity-60">· {clockTime(createdAt)}</span>
      </div>
    </div>
  );
}
