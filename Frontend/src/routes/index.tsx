import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Sidebar } from "@/components/nextalk/Sidebar";
import { ChatView } from "@/components/nextalk/ChatView";
import { EmptyState } from "@/components/nextalk/EmptyState";
import { RightPanel, type PanelKind } from "@/components/nextalk/RightPanel";
import { CONVERSATIONS } from "@/lib/mock-data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexTalk — Realtime messaging, beautifully quiet" },
      { name: "description", content: "NexTalk is a premium realtime messaging platform with glassy dark UI, read receipts, typing indicators, group controls, and message requests." },
      { property: "og:title", content: "NexTalk — Realtime messaging" },
      { property: "og:description", content: "Premium realtime messaging with read receipts, typing, groups, and message requests." },
    ],
  }),
  component: NexTalkApp,
});

function NexTalkApp() {
  const { user, loading } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(CONVERSATIONS[0]?.id ?? null);
  const [panel, setPanel] = useState<PanelKind>("details");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  if (loading) {
    return <div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/auth" />;

  const conv = CONVERSATIONS.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar — hidden on mobile when a chat is open */}
      <div className={mobileChatOpen ? "hidden md:flex" : "flex flex-1 md:flex-none"}>
        <Sidebar
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setPanel("details"); setMobileChatOpen(true); }}
          onOpenRequests={() => setPanel("requests")}
          onOpenNotifications={() => setPanel("notifications")}
          onOpenDiscover={() => setPanel("discover")}
          onOpenSettings={() => setPanel("settings")}
          onCompose={() => setPanel("discover")}
        />
      </div>

      {/* Chat — hidden on mobile when no chat selected */}
      <div className={`${mobileChatOpen ? "flex" : "hidden md:flex"} flex-1 min-w-0`}>
        {conv ? (
          <ChatView conv={conv} onBack={() => setMobileChatOpen(false)} onOpenDetails={() => setPanel("details")} />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Right panel — xl+ only */}
      <RightPanel panel={panel} conv={conv} onClose={() => setPanel(null)} />
    </div>
  );
}
