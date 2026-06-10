import { createContext } from "react";

import type { ActiveCall, CallType, Conversation } from "@/lib/types";

export type CallCtx = {
  call: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (conv: Conversation, callType: CallType) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
};

export const CallContext = createContext<CallCtx | null>(null);
