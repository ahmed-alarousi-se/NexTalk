/**
 * NexTalk Auth — Frontend mock with a Firebase-shaped surface.
 *
 * In production this layer will wrap Firebase Auth:
 *   - signInWithEmailAndPassword / createUserWithEmailAndPassword
 *   - signInWithPopup(GoogleAuthProvider)
 *   - multiFactor(user).enroll/getSession + PhoneAuthProvider for 2FA
 *   - onIdTokenChanged → refresh access tokens every ~55 min
 *
 * For now we simulate the full lifecycle in-memory + localStorage so the
 * UI flows (sign-in → 2FA → app, refresh, sign-out, password reset)
 * can be designed and exercised without a backend.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type AuthUser = {
  uid: string;
  email: string;
  username: string;
  photoURL?: string | null;
  providerId: "password" | "google.com";
  mfaEnabled: boolean;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type PendingMfa = {
  email: string;
  // 6-digit code; in real life this comes from the authenticator/SMS
  expectedCode: string;
  resolveUser: AuthUser;
};

type AuthCtx = {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  pendingMfa: PendingMfa | null;
  signInWithEmail: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  cancelMfa: () => void;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => void;
};

const STORAGE = "nextalk-auth-session";
const ACCESS_TTL = 55 * 60 * 1000;       // 55 min
const REFRESH_SKEW = 60 * 1000;           // refresh 60s before expiry

const Ctx = createContext<AuthCtx | null>(null);

function rand(prefix = "tk") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
function mintSession(user: AuthUser): AuthSession {
  return {
    user,
    accessToken: rand("at"),
    refreshToken: rand("rt"),
    expiresAt: Date.now() + ACCESS_TTL,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingMfa, setPendingMfa] = useState<PendingMfa | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const s = JSON.parse(raw) as AuthSession;
        if (s.expiresAt > Date.now()) setSession(s);
        else localStorage.removeItem(STORAGE);
      }
    } catch {
      // noop
    }
    setLoading(false);
  }, []);

  // Persist + schedule silent refresh
  const persist = useCallback((s: AuthSession | null) => {
    if (s) localStorage.setItem(STORAGE, JSON.stringify(s));
    else localStorage.removeItem(STORAGE);
    setSession(s);
  }, []);

  useEffect(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (!session) return;
    const ms = Math.max(5_000, session.expiresAt - Date.now() - REFRESH_SKEW);
    refreshTimer.current = setTimeout(() => {
      // Mock: rotate access token, keep refresh token + user
      persist({
        ...session,
        accessToken: rand("at"),
        expiresAt: Date.now() + ACCESS_TTL,
      });
    }, ms);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [session, persist]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 600));
    if (!email || password.length < 6) throw new Error("Invalid email or password.");
    const username = email.split("@")[0];
    const user: AuthUser = {
      uid: rand("uid"),
      email,
      username,
      providerId: "password",
      mfaEnabled: true, // by spec: 2FA on for email/password
    };
    // Stage 2FA
    const code = "123456"; // demo code shown in UI hint
    setPendingMfa({ email, expectedCode: code, resolveUser: user });
    return { mfaRequired: true };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, username: string) => {
    await new Promise((r) => setTimeout(r, 700));
    if (!email || password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (!username) throw new Error("Username is required.");
    const user: AuthUser = {
      uid: rand("uid"),
      email,
      username,
      providerId: "password",
      mfaEnabled: true,
    };
    const code = "123456";
    setPendingMfa({ email, expectedCode: code, resolveUser: user });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 500));
    const user: AuthUser = {
      uid: rand("uid"),
      email: "you@gmail.com",
      username: "you",
      photoURL: null,
      providerId: "google.com",
      mfaEnabled: false, // Google handles MFA upstream
    };
    persist(mintSession(user));
  }, [persist]);

  const verifyMfa = useCallback(async (code: string) => {
    await new Promise((r) => setTimeout(r, 400));
    if (!pendingMfa) throw new Error("No pending verification.");
    if (code.replace(/\s/g, "") !== pendingMfa.expectedCode) {
      throw new Error("Invalid verification code.");
    }
    persist(mintSession(pendingMfa.resolveUser));
    setPendingMfa(null);
  }, [pendingMfa, persist]);

  const cancelMfa = useCallback(() => setPendingMfa(null), []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await new Promise((r) => setTimeout(r, 600));
    if (!email.includes("@")) throw new Error("Enter a valid email.");
  }, []);

  const signOut = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    persist(null);
    setPendingMfa(null);
  }, [persist]);

  const value = useMemo<AuthCtx>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    pendingMfa,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    verifyMfa,
    cancelMfa,
    sendPasswordReset,
    signOut,
  }), [session, loading, pendingMfa, signInWithEmail, signUpWithEmail, signInWithGoogle, verifyMfa, cancelMfa, sendPasswordReset, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within <AuthProvider>");
  return v;
}
