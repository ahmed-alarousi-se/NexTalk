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
import { playCallRingtone, stopCallRingtone } from "@/lib/sounds";
import type { ActiveCall, CallType, Conversation, UserLite } from "@/lib/types";
import { WebRtcCall } from "@/lib/webrtc";
import { nexTalkSocket } from "@/lib/ws";

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

  const callRef = useRef<ActiveCall | null>(null);
  const rtcRef = useRef<WebRtcCall | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  callRef.current = call;

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
    rtcRef.current?.close();
    rtcRef.current = null;
    pendingIceRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCall(null);
  }, []);

  const endCall = useCallback(() => {
    const current = callRef.current;
    if (current) {
      nexTalkSocket.send({ type: "call_end", call_id: current.callId });
    }
    cleanup();
  }, [cleanup]);

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
      playCallRingtone();

      nexTalkSocket.send({
        type: "call_invite",
        call_id: callId,
        to_user_id: peer.id,
        conversation_id: conv.id,
        call_type: callType,
      });
    },
    [user],
  );

  const acceptCall = useCallback(() => {
    const current = callRef.current;
    if (!current || current.phase !== "incoming") return;

    stopCallRingtone();
    setCall({ ...current, phase: "connecting" });
    nexTalkSocket.send({ type: "call_accept", call_id: current.callId });

    void setupRtc(current.callType, false).catch(() => {
      toast.error("Could not access camera or microphone");
      endCall();
    });
  }, [endCall, setupRtc]);

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
        playCallRingtone();
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
        setCall({ ...current, phase: "connecting" });
        void setupRtc(current.callType, true).catch(() => {
          toast.error("Could not access camera or microphone");
          endCall();
        });
        return;
      }

      if (ev.type === "call_rejected") {
        if (callRef.current?.callId === ev.call_id) {
          toast.info("Call declined");
          cleanup();
        }
        return;
      }

      if (ev.type === "call_ended") {
        if (callRef.current?.callId === ev.call_id) {
          if (ev.reason === "disconnected") {
            toast.info("Call ended — peer disconnected");
          }
          cleanup();
        }
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
  }, [cleanup, endCall, setupRtc]);

  useEffect(() => () => cleanup(), [cleanup]);

  const value: CallCtx = {
    call,
    localStream,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
