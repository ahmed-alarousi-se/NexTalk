import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password · NexTalk" },
      { name: "description", content: "Choose a new password for your NexTalk account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    await new Promise((r) => setTimeout(r, 700));
    setBusy(false);
    setDone(true);
    setTimeout(() => navigate({ to: "/auth" }), 1500);
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden grid place-items-center p-5">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl gradient-shimmer">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <p className="text-base font-semibold tracking-tight">NexTalk</p>
        </div>

        <div className="glass-strong rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl">
          {done ? (
            <div className="text-center py-4">
              <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-primary/15 text-primary mb-4">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight">Password updated</h2>
              <p className="mt-2 text-sm text-muted-foreground">Redirecting you to sign in…</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">Set a new password</h2>
                <p className="mt-1 text-sm text-muted-foreground">Use at least 8 characters. Mix letters, numbers, and symbols.</p>
              </div>

              <label className="block mb-4">
                <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Lock className="h-4 w-4" /> New password</span>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    required minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="at least 8 characters"
                    className={cn(inputCls, "pr-9")}
                  />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <label className="block mb-4">
                <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Lock className="h-4 w-4" /> Confirm password</span>
                <input
                  type={show ? "text" : "password"}
                  required minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="repeat password"
                  className={inputCls}
                />
              </label>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground/90 mb-4">{error}</div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25 hover:brightness-110 disabled:opacity-70"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Update password <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-white/10 bg-surface-2/80 px-3 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary/50 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25";
