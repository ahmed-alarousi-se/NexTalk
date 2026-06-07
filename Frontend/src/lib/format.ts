export function avatarColor(name: string) {
  const palette = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#a78bfa", "#22d3ee", "#ef4444", "#84cc16"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function initials(name: string) {
  const parts = name.replace(/[._-]/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0]?.toUpperCase() || "?";
}

export function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function isOnline(lastSeen: string | null | undefined, windowMs = 120_000) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < windowMs;
}

export function mediaUrl(path: string | null | undefined, base: string) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
