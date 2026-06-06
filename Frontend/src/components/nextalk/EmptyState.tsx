import { MessageCircle } from "lucide-react";

export function EmptyState() {
  return (
    <section className="hidden md:flex h-full flex-1 items-center justify-center bg-chat-bg">
      <div className="text-center max-w-sm px-6">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl gradient-shimmer">
          <MessageCircle className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Welcome to NexTalk</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          End-to-end fast, beautifully quiet. Select a conversation on the left, or start a new one to begin.
        </p>
        <p className="mt-6 text-[11px] text-muted-foreground/70">Encrypted · Realtime · Cross-device</p>
      </div>
    </section>
  );
}
