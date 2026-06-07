export type JwtClaims = {
  iss?: string;
  aud?: string;
  auth_time?: number;
  user_id?: string;
  sub?: string;
  iat?: number;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  firebase?: {
    identities?: Record<string, string[]>;
    sign_in_provider?: string;
  };
};

export type TokenInfo = {
  raw: string;
  expiresAt: number;
  issuedAt: number;
  authTime: number | null;
  remainingMs: number;
  claims: JwtClaims;
};

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

export function buildTokenInfo(token: string, now = Date.now()): TokenInfo | null {
  const claims = decodeJwt(token);
  if (!claims?.exp || !claims?.iat) return null;

  const expiresAt = claims.exp * 1000;
  const issuedAt = claims.iat * 1000;

  return {
    raw: token,
    expiresAt,
    issuedAt,
    authTime: claims.auth_time ? claims.auth_time * 1000 : null,
    remainingMs: Math.max(0, expiresAt - now),
    claims,
  };
}

export function maskToken(token: string, visible = 12): string {
  if (token.length <= visible * 2) return token;
  return `${token.slice(0, visible)}…${token.slice(-visible)}`;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function tokenStatus(remainingMs: number): "valid" | "expiring" | "expired" {
  if (remainingMs <= 0) return "expired";
  if (remainingMs <= 5 * 60 * 1000) return "expiring";
  return "valid";
}
