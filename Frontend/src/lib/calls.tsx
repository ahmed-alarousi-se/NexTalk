import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { CallContext, type CallCtx } from "@/lib/calls-context";
import { useAuth } from "@/lib/auth";
import { playIncomingRingtone, playOutgoingRingtone, stopCallRingtone } from "@/lib/sounds";
import type { ActiveCall, CallType, Conversation, MissedCallPrompt, UserLite } from "@/lib/types";
import { WebRtcCall } from "@/lib/webrtc";
import { nexTalkSocket } from "@/lib/ws";

const RING_TIMEOUT_MS = 45_000;

function markActive(call: ActiveCall): ActiveCall {
  return {
    ...call,
    phase: "active",
    startedAt: call.startedAt ?? Date.now(),
  };
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [missedCallPrompt, setMissedCallPrompt] = useState<MissedCallPrompt | null>(null);

  const callRef = useRef<ActiveCall | null>(null);
  const rtcRef = useRef<WebRtcCall | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  callRef.current = call;

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const flushPendingIce = useCallback(async () => {
    const rtc = rtcRef.current;
    if (!rtc) return;
    const pending = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const candidate of pending) {
      await rtc.addIceCandidate(candidate);
    }
  }, []);

  const cleanup = useCallback(() => {
    stopCallRingtone();
    clearRingTimeout();
    rtcRef.current?.close();
    rtcRef.current = null;
    pendingIceRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCall(null);
  }, [clearRingTimeout]);

  const showMissedPrompt = useCallback(
    (prompt: MissedCallPrompt) => {
      setMissedCallPrompt(prompt);
    },
    [],
  );

  const dismissMissedCallPrompt = useCallback(() => {
    setMissedCallPrompt(null);
  }, []);

  const sendQuickMessage = useCallback(
    (text: string) => {
      const prompt = missedCallPrompt;
      if (!prompt) return;
      nexTalkSocket.send({
        type: "send_message",
        conversation_id: prompt.conversationId,
        body: text,
      });
      setMissedCallPrompt(null);
      toast.success("Message sent");
    },
    [missedCallPrompt],
  );

  const scheduleRingTimeout = useCallback(() => {
    clearRingTimeout();
    ringTimeoutRef.current = setTimeout(() => {
      const current = callRef.current;
      if (!current || current.phase !== "outgoing") return;
      nexTalkSocket.send({ type: "call_end", call_id: current.callId });
      cleanup();
    }, RING_TIMEOUT_MS);
  }, [cleanup, clearRingTimeout]);

  const endCall = useCallback(() => {
    const current = callRef.current;
    if (current) {
      if (current.phase === "outgoing" && current.isCaller) {
        showMissedPrompt({
          conversationId: current.conversationId,
          peerName: current.peer.username,
          callType: current.callType,
          logStatus: "cancelled",
        });
      }
      nexTalkSocket.send({ type: "call_end", call_id: current.callId });
    }
    cleanup();
  }, [cleanup, showMissedPrompt]);

  const setupRtc = useCallback(
    async (callType: CallType, isCaller: boolean) => {
      const rtc = new WebRtcCall();
      rtcRef.current = rtc;

      rtc.onRemoteStream = (stream) => setRemoteStream(stream);
      rtc.onIceCandidate = (candidate) => {
        const current = callRef.current;
        if (!current) return;
        nexTalkSocket.send({
          type: "ice_candidate",
          call_id: current.callId,
          candidate,
        });
      };

      await rtc.start(callType);
      setLocalStream(rtc.localStream);
      await flushPendingIce();

      if (isCaller) {
        const offer = await rtc.createOffer(callType);
        const current = callRef.current;
        if (!current) return;
        nexTalkSocket.send({
          type: "call_offer",
          call_id: current.callId,
          sdp: offer,
        });
      }
    },
    [flushPendingIce],
  );

  const startCall = useCallback(
    (conv: Conversation, callType: CallType) => {
      if (!user) return;
      if (callRef.current) {
        toast.error("Already in a call");
        return;
      }
      if (conv.type !== "direct" || !conv.other_user) {
        toast.error("Calls are only available in direct chats");
        return;
      }

      const callId = crypto.randomUUID();
      const peer = conv.other_user;

      setCall({
        callId,
        conversationId: conv.id,
        callType,
        phase: "outgoing",
        peer,
        isCaller: true,
        localMuted: false,
        videoEnabled: callType === "video",
      });
      playOutgoingRingtone();
      scheduleRingTimeout();

      nexTalkSocket.send({
        type: "call_invite",
        call_id: callId,
        to_user_id: peer.id,
        conversation_id: conv.id,
        call_type: callType,
      });
    },
    [scheduleRingTimeout, user],
  );

  const acceptCall = useCallback(() => {
    const current = callRef.current;
    if (!current || current.phase !== "incoming") return;

    stopCallRingtone();
    clearRingTimeout();
    setCall({ ...current, phase: "connecting" });
    nexTalkSocket.send({ type: "call_accept", call_id: current.callId });

    void setupRtc(current.callType, false).catch(() => {
      toast.error("Could not access camera or microphone");
      endCall();
    });
  }, [clearRingTimeout, endCall, setupRtc]);

  const rejectCall = useCallback(() => {
    const current = callRef.current;
    if (!current) return;
    nexTalkSocket.send({ type: "call_reject", call_id: current.callId });
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    setCall((c) => {
      if (!c) return c;
      const localMuted = !c.localMuted;
      rtcRef.current?.setMuted(localMuted);
      return { ...c, localMuted };
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setCall((c) => {
      if (!c || c.callType !== "video") return c;
      const videoEnabled = !c.videoEnabled;
      rtcRef.current?.setVideoEnabled(videoEnabled);
      return { ...c, videoEnabled };
    });
  }, []);

  useEffect(() => {
    const off = nexTalkSocket.on((ev) => {
      if (ev.type === "call_incoming") {
        if (callRef.current) return;
        const peer: UserLite = {
          id: ev.from_user_id as string,
          username: (ev.from_username as string) ?? "Unknown",
          avatar_url: (ev.from_avatar_url as string | null) ?? undefined,
        };
        setCall({
          callId: ev.call_id as string,
          conversationId: ev.conversation_id as string,
          callType: ev.call_type as CallType,
          phase: "incoming",
          peer,
          isCaller: false,
          localMuted: false,
          videoEnabled: ev.call_type === "video",
        });
        playIncomingRingtone();
        return;
      }

      if (ev.type === "call_ringing") {
        setCall((c) =>
          c && c.callId === ev.call_id ? { ...c, phase: "outgoing" } : c,
        );
        return;
      }

      if (ev.type === "call_accepted") {
        const current = callRef.current;
        if (!current || current.callId !== ev.call_id || !current.isCaller) return;

        stopCallRingtone();
        clearRingTimeout();
        setCall({ ...current, phase: "connecting" });
        void setupRtc(current.callType, true).catch(() => {
          toast.error("Could not access camera or microphone");
          endCall();
        });
        return;
      }

      if (ev.type === "call_rejected") {
        const current = callRef.current;
        if (!current || current.callId !== ev.call_id) return;
        toast.info("Call declined");
        if (current.isCaller) {
          showMissedPrompt({
            conversationId: current.conversationId,
            peerName: current.peer.username,
            callType: current.callType,
            logStatus: "declined",
          });
        }
        cleanup();
        return;
      }

      if (ev.type === "call_missed") {
        const current = callRef.current;
        if (!current || current.callId !== ev.call_id) return;
        if (current.isCaller) {
          toast.info("No answer");
        } else {
          toast.info(`Missed ${current.callType} call from ${current.peer.username}`);
        }
        showMissedPrompt({
          conversationId: current.conversationId,
          peerName: current.peer.username,
          callType: current.callType,
          logStatus: "missed",
        });
        cleanup();
        return;
      }

      if (ev.type === "call_ended") {
        const current = callRef.current;
        if (!current || current.callId !== ev.call_id) return;
        if (ev.reason === "disconnected") {
          toast.info("Call ended — peer disconnected");
        } else if (ev.reason === "cancelled" && !current.isCaller) {
          toast.info(`Missed ${current.callType} call`);
        } else if (
          (ev.reason === "no_answer" || ev.reason === "cancelled" || ev.show_quick_messages) &&
          current.isCaller
        ) {
          toast.info(ev.reason === "cancelled" ? "Call cancelled" : "No answer");
          showMissedPrompt({
            conversationId: current.conversationId,
            peerName: current.peer.username,
            callType: current.callType,
            logStatus: ev.reason === "cancelled" ? "cancelled" : "missed",
          });
        }
        cleanup();
        return;
      }

      if (ev.type === "call_offer") {
        const current = callRef.current;
        if (!current || current.callId !== ev.call_id || current.isCaller) return;

        void (async () => {
          try {
            if (!rtcRef.current) {
              await setupRtc(current.callType, false);
            }
            const answer = await rtcRef.current!.handleOffer(ev.sdp as RTCSessionDescriptionInit);
            nexTalkSocket.send({
              type: "call_answer",
              call_id: current.callId,
              sdp: answer,
            });
            setCall((c) =>
              c && c.callId === ev.call_id ? markActive(c) : c,
            );
          } catch {
            toast.error("Failed to establish call");
            endCall();
          }
        })();
        return;
      }

      if (ev.type === "call_answer") {
        const current = callRef.current;
        if (!current || current.callId !== ev.call_id || !current.isCaller) return;

        void rtcRef.current
          ?.handleAnswer(ev.sdp as RTCSessionDescriptionInit)
          .then(() => {
            setCall((c) =>
              c && c.callId === ev.call_id ? markActive(c) : c,
            );
          })
          .catch(() => {
            toast.error("Failed to establish call");
            endCall();
          });
        return;
      }

      if (ev.type === "ice_candidate") {
        const current = callRef.current;
        if (!current || current.callId !== ev.call_id) return;
        const candidate = ev.candidate as RTCIceCandidateInit;
        if (!rtcRef.current) {
          pendingIceRef.current.push(candidate);
          return;
        }
        void rtcRef.current.addIceCandidate(candidate);
      }

      if (ev.type === "error" && callRef.current?.phase === "outgoing") {
        cleanup();
      }
    });

    return off;
  }, [cleanup, clearRingTimeout, endCall, setupRtc, showMissedPrompt]);

  useEffect(() => () => cleanup(), [cleanup]);

  const value: CallCtx = {
    call,
    localStream,
    remoteStream,
    missedCallPrompt,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    sendQuickMessage,
    dismissMissedCallPrompt,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
