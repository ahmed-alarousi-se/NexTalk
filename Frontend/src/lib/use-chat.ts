import { useContext } from "react";

import { ChatContext } from "@/lib/chat-context";

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within <ChatProvider>");
  return ctx;
}
