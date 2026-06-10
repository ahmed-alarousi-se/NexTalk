import type { CallType } from "@/lib/types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export class WebRtcCall {
  private pc: RTCPeerConnection | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;

  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;

  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;

  async start(callType: CallType): Promise<void> {
    this.close();
    this.remoteStream = new MediaStream();

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: callType === "video" ? { facingMode: "user" } : false,
    });

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    this.pc.ontrack = (ev) => {
      const incoming = ev.streams[0] ?? new MediaStream([ev.track]);
      for (const track of incoming.getTracks()) {
        if (!this.remoteStream!.getTracks().some((t) => t.id === track.id)) {
          this.remoteStream!.addTrack(track);
        }
      }
      this.onRemoteStream?.(this.remoteStream!);
    };

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.onIceCandidate?.(ev.candidate.toJSON());
      }
    };
  }

  async createOffer(_callType: CallType): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("Peer connection not started");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("Peer connection not started");
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.hasRemoteDescription = true;
    await this.flushCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error("Peer connection not started");
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.hasRemoteDescription = true;
    await this.flushCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !candidate.candidate) return;
    if (!this.hasRemoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Stale or duplicate candidates are harmless during negotiation.
    }
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  setVideoEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  close(): void {
    this.pc?.close();
    this.pc = null;
    this.pendingCandidates = [];
    this.hasRemoteDescription = false;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.remoteStream = null;
  }

  private async flushCandidates(): Promise<void> {
    if (!this.pc) return;
    const pending = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const c of pending) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        // ignore stale ICE
      }
    }
  }
}

export function hasVideoTrack(stream: MediaStream | null): boolean {
  return !!stream?.getVideoTracks().some((t) => t.readyState === "live");
}

export function hasAudioTrack(stream: MediaStream | null): boolean {
  return !!stream?.getAudioTracks().some((t) => t.readyState === "live");
}
