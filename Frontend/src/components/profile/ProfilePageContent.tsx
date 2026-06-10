import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";
import { Avatar } from "@/components/nextalk/Avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteAccount } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/auth";
import { toast } from "sonner";
import {
  copyText,
  formatDateTime,
  formatDuration,
  maskToken,
  tokenStatus,
} from "@/lib/token-utils";
import { cn } from "@/lib/utils";

type ProfileTab = "general" | "security";

type Props = {
  defaultTab?: ProfileTab;
};

export function ProfilePageContent({ defaultTab = "general" }: Props) {
  const {
    user,
    idToken,
    tokenInfo,
    refreshIdToken,
    sendPasswordReset,
    signOut,
    updateProfile,
  } = useAuth();

  const [tab, setTab] = useState<ProfileTab>(defaultTab);
  const [username, setUsername] = useState(user?.username ?? "");
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [showToken, setShowToken] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<"token" | "uid" | null>(null);
  const [securityMsg, setSecurityMsg] = useState<string | null>(null);
  const [securityErr, setSecurityErr] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    setUsername(user?.username ?? "");
  }, [user?.username]);

  if (!user) return null;

  const status = tokenInfo ? tokenStatus(tokenInfo.remainingMs) : "expired";
  const providerLabel = user.providerId === "google.com" ? "Google" : "Email & password";

  async function saveProfile() {
    setProfileErr(null);
    setProfileMsg(null);
    if (username.trim().length < 2) {
      setProfileErr("Username must be at least 2 characters.");
      return;
    }
    if (username === user?.username) return;
    setSaving(true);
    try {
      await updateProfile({ username: username.trim() });
      setProfileMsg("Profile updated.");
    } catch (err) {
      setProfileErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshToken(force = true) {
    setSecurityErr(null);
    setSecurityMsg(null);
    setRefreshing(true);
    try {
      await refreshIdToken(force);
      setSecurityMsg(force ? "ID token refreshed from Firebase." : "ID token loaded.");
    } catch (err) {
      setSecurityErr((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCopy(kind: "token" | "uid", value: string) {
    const ok = await copyText(value);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  async function handlePasswordReset() {
    setSecurityErr(null);
    setSecurityMsg(null);
    setResetBusy(true);
    try {
      await sendPasswordReset(user.email);
      setSecurityMsg("Password reset email sent. Check your inbox.");
    } catch (err) {
      setSecurityErr((err as Error).message);
    } finally {
      setResetBusy(false);
    }
  }

  async function handleDeleteAccount() {
    if (!idToken || deleteConfirm !== user.username) return;
    setSecurityErr(null);
    setDeleteBusy(true);
    try {
      await deleteAccount(idToken);
      toast.success("Account deleted");
      await signOut();
    } catch (err) {
      setSecurityErr((err as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Hero */}
      <section className="glass-strong rounded-3xl border border-white/10 p-6 sm:p-8 overflow-hidden relative">
        <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar name={user.username} src={user.photoURL} size={88} ring online />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{user.username}</h1>
              <ProviderBadge provider={user.providerId} />
              {user.emailVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              Firebase UID · <span className="font-mono text-foreground/80">{maskToken(user.uid, 6)}</span>
            </p>
          </div>
        </div>
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ProfileTab)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-surface-2/80 border border-white/5 p-1 h-auto">
          <TabsTrigger value="general" className="gap-2 py-2.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
            <User className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 py-2.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
            <Shield className="h-4 w-4" /> Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-0">
          <SectionCard title="Account details" description="Your public identity across NexTalk.">
            <div className="space-y-4">
              <Field label="Username">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputCls}
                  placeholder="your_handle"
                  minLength={2}
                />
              </Field>
              <Field label="Email" hint="Managed by Firebase — change it in your identity provider.">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-2/50 px-3 py-2.5 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              </Field>
              <Field label="Sign-in method">
                <div className="rounded-xl border border-white/10 bg-surface-2/50 px-3 py-2.5 text-sm">{providerLabel}</div>
              </Field>
              {user.createdAt && (
                <Field label="Member since">
                  <div className="rounded-xl border border-white/10 bg-surface-2/50 px-3 py-2.5 text-sm text-muted-foreground">
                    {formatDateTime(new Date(user.createdAt).getTime())}
                  </div>
                </Field>
              )}

              {profileErr && <Alert tone="error" msg={profileErr} />}
              {profileMsg && <Alert tone="success" msg={profileMsg} />}

              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={saving || username === user.username}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="security" className="space-y-4 mt-0">
          {/* Session status */}
          <SectionCard title="Active session" description="Your current Firebase authentication session.">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-2/50 p-4">
              <span className={cn("h-3 w-3 rounded-full shrink-0", status === "valid" ? "bg-online animate-pulse" : status === "expiring" ? "bg-amber-400 animate-pulse" : "bg-destructive")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {status === "valid" && "Session active"}
                  {status === "expiring" && "Token expiring soon"}
                  {status === "expired" && "Token expired — refresh required"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tokenInfo
                    ? `Renews in ${formatDuration(tokenInfo.remainingMs)} · auto-refresh enabled`
                    : "No token loaded"}
                </p>
              </div>
              <StatusBadge status={status} />
            </div>
          </SectionCard>

          {/* ID Token */}
          <SectionCard
            title="Firebase ID token"
            description="Short-lived JWT sent to the NexTalk API. Refresh before it expires."
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <MetaTile label="Expires" value={tokenInfo ? formatDateTime(tokenInfo.expiresAt) : "—"} />
                <MetaTile label="Issued" value={tokenInfo ? formatDateTime(tokenInfo.issuedAt) : "—"} />
                <MetaTile label="Time left" value={tokenInfo ? formatDuration(tokenInfo.remainingMs) : "—"} highlight={status !== "valid"} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Token value</span>
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {showToken ? <><EyeOff className="h-3.5 w-3.5" /> Hide</> : <><Eye className="h-3.5 w-3.5" /> Reveal</>}
                  </button>
                </div>
                <div className="relative rounded-xl border border-white/10 bg-[oklch(0.14_0.02_265)] p-3">
                  <code className="block text-[11px] leading-relaxed font-mono text-foreground/90 break-all whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin">
                    {idToken ? (showToken ? idToken : maskToken(idToken, 24)) : "No token available"}
                  </code>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <ActionButton
                  icon={<Copy className="h-4 w-4" />}
                  label={copied === "token" ? "Copied!" : "Copy token"}
                  onClick={() => idToken && void handleCopy("token", idToken)}
                  disabled={!idToken}
                  active={copied === "token"}
                />
                <ActionButton
                  icon={refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  label="Refresh token"
                  onClick={() => void handleRefreshToken(true)}
                  disabled={refreshing}
                />
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Firebase rotates refresh tokens silently. Use <strong className="text-foreground/80">Refresh token</strong> to force a new ID token — useful for API debugging or after permission changes.
              </p>
            </div>
          </SectionCard>

          {/* Identity */}
          <SectionCard title="Firebase identity" description="Stable identifiers tied to your account.">
            <div className="space-y-3">
              <CopyRow
                label="Firebase UID"
                value={user.uid}
                masked={maskToken(user.uid, 8)}
                copied={copied === "uid"}
                onCopy={() => void handleCopy("uid", user.uid)}
              />
              <CopyRow
                label="NexTalk user ID"
                value={user.id}
                masked={maskToken(user.id, 8)}
                copied={false}
                onCopy={() => void handleCopy("uid", user.id)}
              />
              <CopyRow
                label="Auth provider"
                value={providerLabel}
                masked={providerLabel}
                copied={false}
                onCopy={() => void handleCopy("uid", user.providerId)}
                hideCopy
              />
            </div>
          </SectionCard>

          {/* Account actions */}
          <SectionCard title="Account actions" description="Manage credentials and sign out.">
            <div className="space-y-3">
              {user.providerId === "password" && (
                <button
                  type="button"
                  onClick={() => void handlePasswordReset()}
                  disabled={resetBusy}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-2/50 px-4 py-3 text-sm hover:border-primary/30 hover:bg-primary/5 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Send password reset email
                  </span>
                  {resetBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/20 transition-all"
              >
                Sign out of this device
              </button>
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm font-medium text-destructive">Delete account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete your NexTalk account and Firebase identity. Type your username to confirm.
                </p>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={user.username}
                  className="w-full rounded-lg border border-destructive/20 bg-surface-2 px-3 py-2 text-sm outline-none focus:border-destructive/40"
                />
                <button
                  type="button"
                  disabled={deleteBusy || deleteConfirm !== user.username}
                  onClick={() => void handleDeleteAccount()}
                  className="w-full rounded-lg bg-destructive text-destructive-foreground py-2 text-sm font-medium disabled:opacity-50"
                >
                  {deleteBusy ? "Deleting…" : "Delete my account"}
                </button>
              </div>
            </div>
          </SectionCard>

          {securityErr && <Alert tone="error" msg={securityErr} />}
          {securityMsg && <Alert tone="success" msg={securityMsg} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl border border-white/10 p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  );
}

function MetaTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", highlight ? "border-amber-400/30 bg-amber-400/5" : "border-white/10 bg-surface-2/50")}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-medium mt-1 truncate">{value}</p>
    </div>
  );
}

function CopyRow({
  label,
  value,
  masked,
  copied,
  onCopy,
  hideCopy,
}: {
  label: string;
  value: string;
  masked: string;
  copied: boolean;
  onCopy: () => void;
  hideCopy?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-2/50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xs font-mono truncate mt-0.5">{masked}</p>
      </div>
      {!hideCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all disabled:opacity-60",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-white/10 bg-surface-2/50 hover:border-primary/30 hover:bg-primary/5",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ProviderBadge({ provider }: { provider: AuthUser["providerId"] }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {provider === "google.com" ? "Google" : "Email"}
    </span>
  );
}

function StatusBadge({ status }: { status: "valid" | "expiring" | "expired" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        status === "valid" && "bg-primary/15 text-primary",
        status === "expiring" && "bg-amber-400/15 text-amber-300",
        status === "expired" && "bg-destructive/15 text-destructive",
      )}
    >
      {status}
    </span>
  );
}

function Alert({ tone, msg }: { tone: "error" | "success"; msg: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-xs",
        tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive-foreground/90"
          : "border-primary/30 bg-primary/10 text-primary",
      )}
    >
      {msg}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-surface-2/80 px-3 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary/50 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25";
