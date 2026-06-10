import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";

import { getMe, syncUser, updateMe, type ApiUser } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { buildTokenInfo, type TokenInfo } from "@/lib/token-utils";

export type AuthUser = {
  uid: string;
  id: string;
  email: string;
  username: string;
  photoURL?: string | null;
  providerId: "password" | "google.com";
  createdAt?: string;
  emailVerified?: boolean;
  showLastSeen: boolean;
  readReceiptsEnabled: boolean;
};

type AuthCtx = {
  user: AuthUser | null;
  loading: boolean;
  idToken: string | null;
  tokenInfo: TokenInfo | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  refreshIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  updateProfile: (data: { username?: string }) => Promise<void>;
  updatePrivacy: (data: { show_last_seen?: boolean; read_receipts_enabled?: boolean }) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

function mapProvider(providerId: string | undefined): AuthUser["providerId"] {
  return providerId === "google.com" ? "google.com" : "password";
}

function toAuthUser(fbUser: FirebaseUser, profile: ApiUser): AuthUser {
  return {
    uid: fbUser.uid,
    id: profile.id,
    email: profile.email,
    username: profile.username,
    photoURL: profile.avatar_url ?? fbUser.photoURL,
    providerId: mapProvider(profile.auth_provider),
    createdAt: profile.created_at,
    emailVerified: fbUser.emailVerified,
    showLastSeen: profile.show_last_seen ?? true,
    readReceiptsEnabled: profile.read_receipts_enabled ?? true,
  };
}

function firebaseErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 8 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled.";
    default:
      return (error as Error)?.message || "Authentication failed.";
  }
}

async function loadProfile(fbUser: FirebaseUser, username?: string): Promise<AuthUser> {
  const token = await fbUser.getIdToken();
  try {
    const profile = await getMe(token);
    return toAuthUser(fbUser, profile);
  } catch (error) {
    const message = (error as Error).message;
    if (!message.includes("not found") && !message.includes("404")) {
      throw error;
    }
    const profile = await syncUser(token, username);
    return toAuthUser(fbUser, profile);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!idToken) {
      setTokenInfo(null);
      return;
    }
    setTokenInfo(buildTokenInfo(idToken, clock));
  }, [idToken, clock]);

  useEffect(() => {
    return onIdTokenChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setIdToken(null);
        setLoading(false);
        return;
      }

      try {
        const token = await fbUser.getIdToken();
        setIdToken(token);
        const profile = await loadProfile(fbUser);
        setUser(profile);
      } catch {
        setUser(null);
        setIdToken(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const refreshIdToken = useCallback(async (forceRefresh = false) => {
    const fbUser = auth.currentUser;
    if (!fbUser) return null;
    const token = await fbUser.getIdToken(forceRefresh);
    setIdToken(token);
    return token;
  }, []);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    return refreshIdToken(forceRefresh);
  }, [refreshIdToken]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profile = await loadProfile(cred.user);
      setUser(profile);
      setIdToken(await cred.user.getIdToken());
    } catch (error) {
      throw new Error(firebaseErrorMessage(error));
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, username: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const profile = await loadProfile(cred.user, username);
      setUser(profile);
      setIdToken(await cred.user.getIdToken());
    } catch (error) {
      throw new Error(firebaseErrorMessage(error));
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const profile = await loadProfile(cred.user);
      setUser(profile);
      setIdToken(await cred.user.getIdToken());
    } catch (error) {
      throw new Error(firebaseErrorMessage(error));
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      });
    } catch (error) {
      throw new Error(firebaseErrorMessage(error));
    }
  }, []);

  const updateProfile = useCallback(async (data: { username?: string }) => {
    const token = await refreshIdToken();
    if (!token) throw new Error("Not signed in.");
    const profile = await updateMe(token, data);
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error("Not signed in.");
    setUser(toAuthUser(fbUser, profile));
  }, [refreshIdToken]);

  const updatePrivacy = useCallback(async (data: { show_last_seen?: boolean; read_receipts_enabled?: boolean }) => {
    const token = await refreshIdToken();
    if (!token) throw new Error("Not signed in.");
    const profile = await updateMe(token, data);
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error("Not signed in.");
    setUser(toAuthUser(fbUser, profile));
  }, [refreshIdToken]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setIdToken(null);
    setTokenInfo(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      idToken,
      tokenInfo,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      sendPasswordReset,
      signOut,
      getIdToken,
      refreshIdToken,
      updateProfile,
      updatePrivacy,
    }),
    [
      user,
      loading,
      idToken,
      tokenInfo,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      sendPasswordReset,
      signOut,
      getIdToken,
      refreshIdToken,
      updateProfile,
      updatePrivacy,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAuth must be used within <AuthProvider>");
  return value;
}
