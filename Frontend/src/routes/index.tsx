import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Sidebar } from "@/components/nextalk/Sidebar";
import { ChatView } from "@/components/nextalk/ChatView";
import { EmptyState } from "@/components/nextalk/EmptyState";
import { RightPanel, type PanelKind } from "@/components/nextalk/RightPanel";
import { useAuth } from "@/lib/auth";
import { ChatProvider, useChat } from "@/lib/chat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexTalk — Realtime messaging, beautifully quiet" },
      { name: "description", content: "NexTalk is a premium realtime messaging platform with glassy dark UI, read receipts, typing indicators, group controls, and message requests." },
    ],
  }),
  component: NexTalkApp,
});

function NexTalkApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/auth" />;

  return (
    <ChatProvider>
      <ChatShell />
    </ChatProvider>
  );
}

function ChatShell() {
  const { activeId, setActiveId, activeConversation } = useChat();
  const [panel, setPanel] = useState<PanelKind>("details");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
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

      <div className={`${mobileChatOpen ? "flex" : "hidden md:flex"} flex-1 min-w-0`}>
        {activeConversation ? (
          <ChatView
            conv={activeConversation}
            onBack={() => setMobileChatOpen(false)}
            onOpenDetails={() => setPanel("details")}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <RightPanel panel={panel} conv={activeConversation} onClose={() => setPanel(null)} />
    </div>
  );
}
