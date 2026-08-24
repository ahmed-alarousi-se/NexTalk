import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, PhoneMissed, Video, VideoOff, X } from "lucide-react";

import { Avatar } from "./Avatar";
import { MISSED_CALL_QUICK_MESSAGES } from "@/lib/call-log";
import { useCalls } from "@/lib/use-calls";
import { hasAudioTrack, hasVideoTrack } from "@/lib/webrtc";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallOverlay() {
  const {
    call,
    localStream,
    remoteStream,
    missedCallPrompt,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    sendQuickMessage,
    dismissMissedCallPrompt,
  } = useCalls();

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!call?.startedAt || call.phase !== "active") {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - call.startedAt!) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call?.startedAt, call?.phase]);

  if (missedCallPrompt && !call) {
    return (
      <MissedCallPromptPanel
        prompt={missedCallPrompt}
        onSend={sendQuickMessage}
        onDismiss={dismissMissedCallPrompt}
      />
    );
  }

  if (!call || call.phase === "idle" || call.phase === "ended") return null;

  const isVideo = call.callType === "video";
  const isIncoming = call.phase === "incoming";
  const isOutgoing = call.phase === "outgoing";
  const isConnecting = call.phase === "connecting";
  const isActive = call.phase === "active";
  const showVideoStage =
    isVideo && (isConnecting || isActive) && (hasVideoTrack(localStream) || hasVideoTrack(remoteStream));
  const needsAudioPlayback = (isConnecting || isActive) && hasAudioTrack(remoteStream);

  const statusLabel = isIncoming
    ? isVideo
      ? "Incoming video call"
      : "Incoming voice call"
    : isOutgoing
      ? "Ringing…"
      : isConnecting
        ? "Connecting…"
        : isActive
          ? formatDuration(elapsed)
          : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[oklch(0.12_0.02_265)]">
      {needsAudioPlayback && <AudioFeed stream={remoteStream} />}

      {showVideoStage ? (
        <VideoStage
          localStream={localStream}
          remoteStream={remoteStream}
          peerName={call.peer.username}
          peerAvatar={call.peer.avatar_url}
          videoEnabled={call.videoEnabled}
        />
      ) : (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6">
          <div
            className={cn(
              "relative rounded-full p-1",
              (isIncoming || isOutgoing) && "ring-2 ring-primary/40 ring-offset-4 ring-offset-transparent animate-pulse",
            )}
          >
            <Avatar name={call.peer.username} src={call.peer.avatar_url} size={112} />
          </div>
          <div className="text-center space-y-2">
            <p className="text-2xl font-semibold tracking-tight">{call.peer.username}</p>
            <p className="text-sm text-muted-foreground">{statusLabel}</p>
            {isActive && !isVideo && (
              <p className="text-xs text-primary/80">Voice call in progress</p>
            )}
          </div>
        </div>
      )}

      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-5 py-4 glass-strong border-b border-white/5">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{call.peer.username}</p>
          <p className="text-xs text-muted-foreground truncate">
            {isVideo ? "Video call" : "Voice call"}
            {isActive ? ` · ${formatDuration(elapsed)}` : statusLabel ? ` · ${statusLabel}` : ""}
          </p>
        </div>
        {isActive && (
          <span className="flex items-center gap-1.5 text-xs text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Live
          </span>
        )}
      </div>

      <div className="relative px-6 pb-10 pt-6">
        <div className="mx-auto flex max-w-md items-center justify-center gap-5 rounded-3xl border border-white/8 bg-surface/80 backdrop-blur-xl px-6 py-5 shadow-2xl">
          {isIncoming ? (
            <>
              <CallButton variant="reject" onClick={rejectCall} label="Decline" size="lg">
                <PhoneOff className="h-6 w-6" />
              </CallButton>
              <CallButton variant="accept" onClick={() => void acceptCall()} label="Accept" size="lg">
                {isVideo ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
              </CallButton>
            </>
          ) : (
            <>
              {(isConnecting || isActive) && (
                <>
                  <CallButton
                    variant="control"
                    onClick={toggleMute}
                    label={call.localMuted ? "Unmute" : "Mute"}
                    active={call.localMuted}
                  >
                    {call.localMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </CallButton>
                  {isVideo && (
                    <CallButton
                      variant="control"
                      onClick={toggleVideo}
                      label={call.videoEnabled ? "Camera off" : "Camera on"}
                      active={!call.videoEnabled}
                    >
                      {call.videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                    </CallButton>
                  )}
                </>
              )}
              <CallButton variant="reject" onClick={endCall} label={isOutgoing ? "Cancel" : "End"} size="lg">
                <PhoneOff className="h-6 w-6" />
              </CallButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MissedCallPromptPanel({
  prompt,
  onSend,
  onDismiss,
}: {
  prompt: { peerName: string; callType: string; logStatus: string };
  onSend: (text: string) => void;
  onDismiss: () => void;
}) {
  const title =
    prompt.logStatus === "cancelled"
      ? "Missed call"
      : "No answer";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-surface/95 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-destructive/15 text-destructive">
              <PhoneMissed className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">
                {prompt.callType === "video" ? "Video" : "Voice"} call with {prompt.peerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">Send a quick message:</p>
        <div className="mt-3 flex flex-col gap-2">
          {MISSED_CALL_QUICK_MESSAGES.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onSend(text)}
              className="rounded-2xl border border-white/8 bg-surface-2 px-4 py-3 text-left text-sm hover:border-primary/30 hover:bg-primary/5 transition-colors"
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AudioFeed({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      void el.play().catch(() => {
        // User gesture context should allow playback during active call
      });
    }
  }, [stream]);

  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

function VideoStage({
  localStream,
  remoteStream,
  peerName,
  peerAvatar,
  videoEnabled,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peerName: string;
  peerAvatar?: string | null;
  videoEnabled: boolean;
}) {
  const remoteHasVideo = hasVideoTrack(remoteStream);

  return (
    <div className="relative flex-1 bg-black overflow-hidden">
      {remoteHasVideo ? (
        <VideoFeed stream={remoteStream} className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[oklch(0.14_0.02_265)]">
          <div className="flex flex-col items-center gap-4">
            <Avatar name={peerName} src={peerAvatar} size={96} />
            <p className="text-sm text-white/60">Waiting for {peerName}…</p>
          </div>
        </div>
      )}

      {videoEnabled && hasVideoTrack(localStream) && (
        <div className="absolute bottom-28 right-4 overflow-hidden rounded-2xl border border-white/15 shadow-2xl md:bottom-32 md:right-6">
          <VideoFeed
            stream={localStream}
            muted
            mirror
            className="h-28 w-36 object-cover md:h-40 md:w-52"
          />
        </div>
      )}
    </div>
  );
}

function VideoFeed({
  stream,
  muted,
  mirror,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      void el.play().catch(() => {});
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn(className, mirror && "scale-x-[-1]")}
    />
  );
}

function CallButton({
  children,
  onClick,
  variant,
  label,
  size = "md",
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "accept" | "reject" | "control";
  label: string;
  size?: "md" | "lg";
  active?: boolean;
}) {
  const dim = size === "lg" ? "h-16 w-16" : "h-12 w-12";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "grid place-items-center rounded-full transition-all duration-300 hover:scale-105 active:scale-95",
        dim,
        variant === "accept" && "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
        variant === "reject" && "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30",
        variant === "control" && [
          "border border-white/10 bg-surface-2 text-foreground",
          active && "bg-destructive/20 border-destructive/40 text-destructive",
        ],
      )}
    >
      {children}
    </button>
  );
}
