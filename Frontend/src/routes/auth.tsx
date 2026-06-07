import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Loader2, Mail, MessageCircle,
  ShieldCheck, User, Lock, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · NexTalk" },
      { name: "description", content: "Sign in or create your NexTalk account with email or Google." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot" | "reset-sent";

function AuthPage() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");

  if (!loading && user) {
    return <Navigate to="/" />;
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Brand pane */}
        <aside className="hidden lg:flex flex-col justify-between p-10 xl:p-14 relative">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl gradient-shimmer">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">NexTalk</p>
              <p className="text-xs text-muted-foreground -mt-0.5">Realtime messaging, beautifully quiet.</p>
            </div>
          </div>

          <div className="space-y-8 max-w-md">
            <h2 className="text-4xl xl:text-5xl font-semibold tracking-tight leading-[1.05]">
              Conversations that feel <span className="text-primary">instant</span>, secured by design.
            </h2>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <Feature icon={<ShieldCheck className="h-4 w-4" />} title="Firebase authentication" desc="Email, password, and Google sign-in secured by Firebase Auth." />
              <Feature icon={<KeyRound className="h-4 w-4" />} title="Silent token refresh" desc="Sessions renew quietly in the background — no surprise sign-outs." />
              <Feature icon={<CheckCircle2 className="h-4 w-4" />} title="Google one-tap" desc="Bring your Google identity and skip the password entirely." />
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">© NexTalk — built for focused conversation.</p>
        </aside>

        {/* Form pane */}
        <main className="flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-md">
            {/* Mobile brand */}
            <div className="flex lg:hidden items-center gap-3 mb-8">
              <div className="grid h-10 w-10 place-items-center rounded-xl gradient-shimmer">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <p className="text-base font-semibold tracking-tight">NexTalk</p>
            </div>

            <div className="glass-strong rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl">
              {mode === "signin" ? (
                <SignInForm onSwitch={setMode} />
              ) : mode === "signup" ? (
                <SignUpForm onSwitch={setMode} />
              ) : mode === "forgot" ? (
                <ForgotForm onSwitch={setMode} onSent={() => setMode("reset-sent")} />
              ) : (
                <ResetSent onBack={() => setMode("signin")} />
              )}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              By continuing you agree to NexTalk's <a className="underline underline-offset-2 hover:text-foreground" href="#">Terms</a> and <a className="underline underline-offset-2 hover:text-foreground" href="#">Privacy Policy</a>.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---------------- Sub-forms ---------------- */

function SignInForm({ onSwitch }: { onSwitch: (m: Mode) => void }) {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"none" | "email" | "google">("none");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setBusy("email");
    try { await signInWithEmail(email, password); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy("none"); }
  }

  async function onGoogle() {
    setError(null); setBusy("google");
    try { await signInWithGoogle(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy("none"); }
  }

  return (
    <>
      <Header title="Welcome back" subtitle="Sign in to continue your conversations." />
      <GoogleButton busy={busy === "google"} onClick={onGoogle} label="Continue with Google" />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" icon={<Mail className="h-4 w-4" />}>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className={inputCls} />
        </Field>
        <Field label="Password" icon={<Lock className="h-4 w-4" />} action={
          <button type="button" onClick={() => onSwitch("forgot")} className="text-xs text-primary hover:underline">Forgot?</button>
        }>
          <div className="relative">
            <input type={show ? "text" : "password"} required minLength={6} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={cn(inputCls, "pr-9")} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        {error && <ErrorNote msg={error} />}

        <PrimaryButton busy={busy === "email"}>
          Sign in <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <button onClick={() => onSwitch("signup")} className="text-primary font-medium hover:underline">Create an account</button>
      </p>
    </>
  );
}

function SignUpForm({ onSwitch }: { onSwitch: (m: Mode) => void }) {
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"none" | "email" | "google">("none");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setBusy("email");
    try { await signUpWithEmail(email, password, username); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy("none"); }
  }

  const strength = scorePassword(password);

  return (
    <>
      <Header title="Create your account" subtitle="Pick a username and we'll create your NexTalk profile." />
      <GoogleButton busy={busy === "google"} onClick={async () => { setBusy("google"); try { await signInWithGoogle(); } finally { setBusy("none"); } }} label="Sign up with Google" />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Username" icon={<User className="h-4 w-4" />}>
          <input required minLength={2} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your_handle" className={inputCls} />
        </Field>
        <Field label="Email" icon={<Mail className="h-4 w-4" />}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className={inputCls} />
        </Field>
        <Field label="Password" icon={<Lock className="h-4 w-4" />}>
          <div className="relative">
            <input type={show ? "text" : "password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" className={cn(inputCls, "pr-9")} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password && <PasswordMeter score={strength} />}
        </Field>

        {error && <ErrorNote msg={error} />}

        <PrimaryButton busy={busy === "email"}>
          Create account <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <button onClick={() => onSwitch("signin")} className="text-primary font-medium hover:underline">Sign in</button>
      </p>
    </>
  );
}

function ForgotForm({ onSwitch, onSent }: { onSwitch: (m: Mode) => void; onSent: () => void }) {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await sendPasswordReset(email); onSent(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={() => onSwitch("signin")} className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> back to sign in
      </button>
      <Header title="Reset your password" subtitle="We'll email you a secure link to set a new password." />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" icon={<Mail className="h-4 w-4" />}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className={inputCls} />
        </Field>
        {error && <ErrorNote msg={error} />}
        <PrimaryButton busy={busy}>Send reset link <ArrowRight className="h-4 w-4" /></PrimaryButton>
      </form>
    </>
  );
}

function ResetSent({ onBack }: { onBack: () => void }) {
  return (
    <div className="text-center py-4">
      <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-primary/15 text-primary mb-4">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Check your inbox</h2>
      <p className="mt-2 text-sm text-muted-foreground">If an account exists for that email, a reset link is on its way.</p>
      <button onClick={onBack} className="mt-6 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </button>
    </div>
  );
}

/* ---------------- Atoms ---------------- */

const inputCls = "w-full rounded-xl border border-white/10 bg-surface-2/80 px-3 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary/50 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25";

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Field({ label, icon, action, children }: { label: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}{label}
        </span>
        {action}
      </div>
      {children}
    </label>
  );
}

function PrimaryButton({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="group relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25 hover:brightness-110 disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

function GoogleButton({ onClick, busy, label }: { onClick: () => void; busy?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-surface-2/60 px-4 py-2.5 text-sm font-medium transition-all hover:bg-surface-2 hover:border-white/20 disabled:opacity-70"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleGlyph />}
      {label}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
      <div className="h-px flex-1 bg-white/10" /> or continue with email <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function ErrorNote({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground/90">
      {msg}
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-primary/12 text-primary">{icon}</div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs">{desc}</p>
      </div>
    </li>
  );
}

function scorePassword(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}

function PasswordMeter({ score }: { score: number }) {
  const labels = ["Too weak", "Weak", "Okay", "Strong", "Excellent"];
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            i < score ? (score >= 3 ? "bg-primary" : score === 2 ? "bg-amber-400" : "bg-destructive") : "bg-white/10"
          )} />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{labels[score]}</p>
    </div>
  );
}
