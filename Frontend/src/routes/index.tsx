import { useEffect, useRef, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { CallOverlay } from "@/components/nextalk/CallOverlay";
import { ComposeDialog } from "@/components/nextalk/ComposeDialog";
import { Sidebar } from "@/components/nextalk/Sidebar";
import { ChatView } from "@/components/nextalk/ChatView";
import { EmptyState } from "@/components/nextalk/EmptyState";
import { RightPanel, PanelContent, type PanelKind } from "@/components/nextalk/RightPanel";
import { useAuth } from "@/lib/auth";
import { CallProvider } from "@/lib/calls";
import { ChatProvider } from "@/lib/chat";
import { useChat } from "@/lib/use-chat";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

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
    return (
      <div className="grid h-screen place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-shimmer animate-pulse">
            <div className="h-5 w-5 rounded bg-white/40" />
          </div>
          <p className="text-sm text-muted-foreground">Loading NexTalk…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/welcome" />;

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
  const [panel, setPanel] = useState<PanelKind>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [isLg, setIsLg] = useState(true);
  const isLgRef = useRef(true);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setIsLg(mql.matches);
      isLgRef.current = mql.matches;
    };
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    registerOnChatOpen(() => setMobileChatOpen(true));
  }, [registerOnChatOpen]);

  const showChat = !!activeId && (!!activeConversation || mobileChatOpen);

  function handlePanelOpen(kind: PanelKind) {
    setPanel(kind);
  }

  const mobileDrawerOpen = !!panel && !isLg;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} />

      {/* Mobile panel drawer (< lg) */}
      <Drawer
        open={mobileDrawerOpen}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DrawerContent className="flex flex-col overflow-hidden" style={{ maxHeight: "88dvh" }}>
          {panel && (
            <div className="flex flex-col overflow-hidden flex-1 min-h-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
                <h2 className="text-sm font-semibold tracking-tight">{panelTitle(panel)}</h2>
                <button
                  onClick={() => setPanel(null)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                <PanelContent panel={panel} conv={activeConversation} onClose={() => setPanel(null)} />
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* Sidebar */}
      <div className={cn(mobileChatOpen ? "hidden md:flex" : "flex flex-1 md:flex-none")}>
        <Sidebar
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); if (isLg) handlePanelOpen("details"); setMobileChatOpen(true); }}
          onOpenSettings={() => handlePanelOpen("settings")}
          onCompose={() => setComposeOpen(true)}
        />
      </div>

      {/* Chat area */}
      <div className={cn(showChat ? "flex" : "hidden md:flex", "flex-1 min-w-0")}>
        {activeConversation ? (
          <ChatView
            conv={activeConversation}
            onBack={() => setMobileChatOpen(false)}
            onOpenDetails={() => handlePanelOpen("details")}
          />
        ) : activeId ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Opening chat…</div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Desktop right panel (lg+) */}
      <RightPanel panel={panel} conv={activeConversation} onClose={() => setPanel(null)} />
    </div>
  );
}

function panelTitle(p: Exclude<PanelKind, null>) {
  return ({
    details: "Details",
    settings: "Settings",
  } as const)[p];
}
