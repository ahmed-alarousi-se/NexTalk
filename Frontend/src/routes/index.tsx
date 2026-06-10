import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CallOverlay } from "@/components/nextalk/CallOverlay";
import { ComposeDialog } from "@/components/nextalk/ComposeDialog";
import { Sidebar } from "@/components/nextalk/Sidebar";
import { ChatView } from "@/components/nextalk/ChatView";
import { EmptyState } from "@/components/nextalk/EmptyState";
import { RightPanel, type PanelKind } from "@/components/nextalk/RightPanel";
import { useAuth } from "@/lib/auth";
import { CallProvider } from "@/lib/calls";
import { ChatProvider } from "@/lib/chat";
import { useChat } from "@/lib/use-chat";

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
      <CallProvider>
        <ChatShell />
        <CallOverlay />
      </CallProvider>
    </ChatProvider>
  );
}

function ChatShell() {
  const { activeId, setActiveId, activeConversation, registerOnChatOpen } = useChat();
  const [panel, setPanel] = useState<PanelKind>("details");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(() => {
    registerOnChatOpen(() => setMobileChatOpen(true));
  }, [registerOnChatOpen]);

  const showChat = !!activeId && (!!activeConversation || mobileChatOpen);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} />
      <div className={mobileChatOpen ? "hidden md:flex" : "flex flex-1 md:flex-none"}>
        <Sidebar
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setPanel("details"); setMobileChatOpen(true); }}
          onOpenRequests={() => setPanel("requests")}
          onOpenNotifications={() => setPanel("notifications")}
          onOpenDiscover={() => setPanel("discover")}
          onOpenSettings={() => setPanel("settings")}
          onCompose={() => setComposeOpen(true)}
        />
      </div>

      <div className={`${showChat ? "flex" : "hidden md:flex"} flex-1 min-w-0`}>
        {activeConversation ? (
          <ChatView
            conv={activeConversation}
            onBack={() => setMobileChatOpen(false)}
            onOpenDetails={() => setPanel("details")}
          />
        ) : activeId ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Opening chat…</div>
        ) : (
          <EmptyState />
        )}
      </div>

      <RightPanel panel={panel} conv={activeConversation} onClose={() => setPanel(null)} />
    </div>
  );
}
