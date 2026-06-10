import type { CallType } from "@/lib/types";

export type CallLogStatus = "completed" | "missed" | "declined" | "cancelled";

export type CallLog = {
  call_type: CallType;
  status: CallLogStatus;
  duration_seconds: number;
  call_id?: string | null;
};

export function formatCallDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function callLogLabel(
  callLog: CallLog,
  viewerId: string | undefined,
  senderId: string,
): { title: string; subtitle?: string; tone: "neutral" | "missed" | "declined" } {
  const isCaller = viewerId === senderId;
  const isVideo = callLog.call_type === "video";
  const kind = isVideo ? "Video call" : "Voice call";

  if (callLog.status === "completed") {
    return {
      title: kind,
      subtitle: formatCallDuration(callLog.duration_seconds),
      tone: "neutral",
    };
  }
  if (callLog.status === "declined") {
    return {
      title: isCaller ? `${kind} declined` : `Declined ${kind.toLowerCase()}`,
      tone: "declined",
    };
  }
  if (callLog.status === "cancelled") {
    return {
      title: isCaller ? "Call cancelled" : `Missed ${kind.toLowerCase()}`,
      tone: isCaller ? "neutral" : "missed",
    };
  }
  return {
    title: isCaller ? "No answer" : `Missed ${kind.toLowerCase()}`,
    tone: "missed",
  };
}

export const MISSED_CALL_QUICK_MESSAGES = [
  "Sorry I missed your call — I'll call you back.",
  "Can't talk right now. I'll message you when I'm free.",
  "Hey, are you available to chat?",
] as const;
