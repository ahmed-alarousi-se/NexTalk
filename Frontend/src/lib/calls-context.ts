import { createContext } from "react";

import type { ActiveCall, CallType, Conversation, MissedCallPrompt } from "@/lib/types";

export type CallCtx = {
  call: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  missedCallPrompt: MissedCallPrompt | null;
  startCall: (conv: Conversation, callType: CallType) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  sendQuickMessage: (text: string) => void;
  dismissMissedCallPrompt: () => void;
};

export const CallContext = createContext<CallCtx | null>(null);
