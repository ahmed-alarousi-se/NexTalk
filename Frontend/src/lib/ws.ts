import { API_URL } from "@/lib/api";

export type WsOutgoing =
  | { type: "ping" }
  | { type: "join_conversation"; conversation_id: string }
  | { type: "leave_conversation"; conversation_id: string }
  | { type: "typing"; conversation_id: string; is_typing: boolean }
  | { type: "send_message"; conversation_id: string; body?: string; image_url?: string }
  | { type: "mark_read"; conversation_id: string }
  | { type: "edit_message"; message_id: string; body: string }
  | {
      type: "call_invite";
      call_id: string;
      to_user_id: string;
      conversation_id: string;
      call_type: "audio" | "video";
    }
  | { type: "call_accept"; call_id: string }
  | { type: "call_reject"; call_id: string }
  | { type: "call_end"; call_id: string }
  | { type: "call_offer"; call_id: string; sdp: RTCSessionDescriptionInit }
  | { type: "call_answer"; call_id: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice_candidate"; call_id: string; candidate: RTCIceCandidateInit };

export type WsIncoming = { type: string; [key: string]: unknown };

type Listener = (event: WsIncoming) => void;

export function buildWsUrl(token: string): string {
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}/api/v1/ws?token=${encodeURIComponent(token)}`;
}

export class NexTalkSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private token: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private _connected = false;
  private generation = 0;
  private intentionalClose = false;

  get connected() {
    return this._connected;
  }

  connect(token: string) {
    const state = this.ws?.readyState;
    if (
      this.token === token &&
      !this.intentionalClose &&
      (state === WebSocket.OPEN || state === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.intentionalClose = false;
    this.token = token;
    this.open();
  }

  disconnect() {
    this.intentionalClose = true;
    this.token = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.closeSocket();
    this.generation += 1;
    this._connected = false;
  }

  send(payload: WsOutgoing) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    this.abandonSocket(ws);
  }

  /** Detach handlers; avoid closing CONNECTING sockets (noisy browser error). */
  private abandonSocket(ws: WebSocket) {
    const staleGen = this.generation;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN) {
      ws.onopen = null;
      ws.close(1000, "Client disconnect");
      return;
    }
    // If still handshaking, close once it opens without logging a connect error.
    ws.onopen = () => {
      if (staleGen !== this.generation) {
        try {
          ws.close(1000, "Superseded");
        } catch {
          // ignore
        }
      }
    };
  }

  private open() {
    if (!this.token) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSocket();
    this.generation += 1;
    const gen = this.generation;

    const ws = new WebSocket(buildWsUrl(this.token));
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.generation) return;
      this._connected = true;
      this.emit({ type: "connected" });
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), 25_000);
    };

    ws.onmessage = (ev) => {
      if (gen !== this.generation) return;
      try {
        this.emit(JSON.parse(ev.data as string) as WsIncoming);
      } catch {
        // ignore bad frames
      }
    };

    ws.onclose = () => {
      if (gen !== this.generation) return;
      this._connected = false;
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.emit({ type: "disconnected" });
      if (this.token && !this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => this.open(), 2000);
      }
    };

    ws.onerror = () => {
      // onclose handles reconnect; avoid calling close() here (race with CONNECTING)
    };
  }

  private emit(event: WsIncoming) {
    for (const fn of this.listeners) fn(event);
  }
}

export const nexTalkSocket = new NexTalkSocket();
