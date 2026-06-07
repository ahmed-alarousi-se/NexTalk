import { API_URL } from "@/lib/api";

export type WsOutgoing =
  | { type: "ping" }
  | { type: "join_conversation"; conversation_id: string }
  | { type: "leave_conversation"; conversation_id: string }
  | { type: "typing"; conversation_id: string; is_typing: boolean }
  | { type: "send_message"; conversation_id: string; body?: string; image_url?: string }
  | { type: "mark_read"; conversation_id: string };

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

  get connected() {
    return this._connected;
  }

  connect(token: string) {
    this.token = token;
    this.open();
  }

  disconnect() {
    this.token = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  send(payload: WsOutgoing) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  on(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private open() {
    if (!this.token) return;
    this.ws?.close();

    const ws = new WebSocket(buildWsUrl(this.token));
    this.ws = ws;

    ws.onopen = () => {
      this._connected = true;
      this.emit({ type: "connected" });
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), 25_000);
    };

    ws.onmessage = (ev) => {
      try {
        this.emit(JSON.parse(ev.data as string) as WsIncoming);
      } catch {
        // ignore bad frames
      }
    };

    ws.onclose = () => {
      this._connected = false;
      this.emit({ type: "disconnected" });
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.token) {
        this.reconnectTimer = setTimeout(() => this.open(), 3000);
      }
    };

    ws.onerror = () => ws.close();
  }

  private emit(event: WsIncoming) {
    for (const fn of this.listeners) fn(event);
  }
}

export const nexTalkSocket = new NexTalkSocket();
