import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  ArrowRight, Bell, Globe, Mail, MessageCircle, Moon, Phone,
  Shield, Star, Sun, Users, Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "NexTalk — Realtime messaging, beautifully quiet" },
      { name: "description", content: "NexTalk is a premium realtime messaging platform with real-time chats, group conversations, voice & video calls, and secure Firebase authentication." },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const { user, loading } = useAuth();
  const { theme, toggle } = useTheme();

  if (!loading && user) return <Navigate to="/" />;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass-strong border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3 gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-shimmer">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight leading-none">NexTalk</p>
              <p className="hidden sm:block text-[11px] text-muted-foreground -mt-0.5">Realtime messaging</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggle}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/auth"
              className="rounded-xl border border-white/10 bg-surface-2/60 px-3 sm:px-4 py-2 text-sm font-medium transition-all hover:bg-surface-2 hover:border-white/20 whitespace-nowrap"
            >
              Sign In
            </Link>
            <Link
              to="/auth"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 whitespace-nowrap"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary mb-6">
          <Zap className="h-3 w-3 shrink-0" />
          Real-time messaging, beautifully quiet
        </div>

        <h1 className="text-[2.25rem] leading-[1.1] sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight max-w-4xl mx-auto">
          Conversations that feel{" "}
          <span className="text-primary">instant</span>,{" "}
          <br className="hidden md:block" />
          secured by design.
        </h1>

        <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2">
          NexTalk brings you real-time messaging with read receipts, typing indicators,
          group chats, voice &amp; video calls — all wrapped in a beautiful minimal interface.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 px-4 sm:px-0">
          <Link
            to="/auth"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25 hover:brightness-110 active:scale-95"
          >
            Get Started — it's free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/auth"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface-2/60 px-6 py-3.5 text-sm font-medium transition-all hover:bg-surface-2 hover:border-white/20 active:scale-95"
          >
            Sign In to my account
          </Link>
        </div>

        {/* Social proof */}
        <div className="mt-10 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <span className="ml-1">Trusted by developers worldwide</span>
        </div>
      </section>

      {/* App Preview */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-20">
        <div className="glass rounded-2xl sm:rounded-3xl border border-white/10 overflow-hidden shadow-2xl shadow-black/30">
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-surface-2/50">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            <div className="flex-1 mx-4">
              <div className="h-5 rounded-md bg-white/5 max-w-48 mx-auto" />
            </div>
          </div>
          {/* App shell */}
          <div className="flex h-52 sm:h-72 md:h-80">
            {/* Sidebar mock */}
            <div className="hidden sm:flex w-44 md:w-52 border-r border-white/5 bg-surface-2/30 flex-col gap-2 p-3">
              <div className="h-4 rounded-md bg-white/10 w-3/4" />
              <div className="h-3 rounded-md bg-white/5 w-1/2 mt-1" />
              <div className="mt-3 space-y-1.5">
                {[80, 60, 70, 55, 65].map((pct, i) => (
                  <div key={i} className={`flex items-center gap-2 h-9 rounded-xl bg-white/${i === 0 ? "10" : "5"} px-2`}>
                    <div className="h-6 w-6 rounded-full shrink-0 bg-primary/20" />
                    <div className="h-2.5 rounded bg-white/10 flex-1" style={{ maxWidth: `${pct}%` }} />
                  </div>
                ))}
              </div>
            </div>
            {/* Chat mock */}
            <div className="flex-1 flex flex-col p-3 sm:p-4 bg-chat-bg/50">
              <div className="flex items-center gap-2 pb-3 border-b border-white/5 mb-3">
                <div className="h-7 w-7 rounded-full bg-primary/30 shrink-0" />
                <div className="space-y-1">
                  <div className="h-2.5 w-20 rounded bg-white/15" />
                  <div className="h-2 w-12 rounded bg-white/8" />
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-hidden">
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-bubble-other/80 px-3 py-2 text-[11px] text-muted-foreground max-w-[65%]">
                    Hey! How are you? 👋
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-br-sm bg-bubble-self px-3 py-2 text-[11px] text-white max-w-[65%]">
                    I'm doing great! Let's chat 😊
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-bubble-other/80 px-3 py-2 text-[11px] text-muted-foreground max-w-[70%]">
                    Want to hop on a quick call?
                  </div>
                </div>
                <div className="flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] text-primary">
                    <Phone className="h-3 w-3" />
                    <span>Voice call · 2m 34s</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 h-9 rounded-xl bg-surface-2/60 border border-white/5 flex items-center px-3 gap-2">
                <div className="flex-1 h-2 rounded bg-white/10" />
                <div className="h-6 w-6 rounded-full bg-primary grid place-items-center shrink-0">
                  <ArrowRight className="h-3 w-3 text-primary-foreground" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Everything you need to connect
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
            Built for real conversations, not just messaging.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} />
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
        <div className="glass rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center border border-white/10 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
          </div>

          <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl gradient-shimmer mb-6">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Ready to get started?
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
            Join NexTalk today and experience messaging the way it should be.
            Free to use, no credit card required.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 px-4 sm:px-0">
            <Link
              to="/auth"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25 hover:brightness-110 active:scale-95"
            >
              Create Account — Free <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="mailto:nextalkcp@gmail.com"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface-2/60 px-6 py-3.5 text-sm font-medium transition-all hover:bg-surface-2 hover:border-white/20 active:scale-95"
            >
              <Mail className="h-4 w-4" />
              Contact Developer
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="grid h-6 w-6 place-items-center rounded-lg gradient-shimmer shrink-0">
                <MessageCircle className="h-3 w-3 text-white" />
              </div>
              <span>© 2025 NexTalk — built for focused conversation.</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <a
                href="mailto:nextalkcp@gmail.com"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <Mail className="h-3 w-3" />
                nextalkcp@gmail.com
              </a>
              <Link to="/auth" className="hover:text-foreground transition-colors">
                Sign In
              </Link>
              <Link to="/auth" className="hover:text-foreground transition-colors">
                Create Account
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const FEATURES: Array<{ icon: React.ReactNode; title: string; desc: string }> = [
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Real-time messaging",
    desc: "Messages delivered instantly via WebSockets with typing indicators and read receipts.",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Group conversations",
    desc: "Create groups, invite contacts, manage members and roles — all in one place.",
  },
  {
    icon: <Phone className="h-5 w-5" />,
    title: "Voice & video calls",
    desc: "Crystal-clear audio and video calls built directly into your conversations.",
  },
  {
    icon: <Shield className="h-5 w-5" />,
    title: "Secure by default",
    desc: "Firebase authentication with Google sign-in, silent token refresh, and privacy controls.",
  },
  {
    icon: <Bell className="h-5 w-5" />,
    title: "Smart notifications",
    desc: "Real-time alerts, group invitations, and contact requests — stay always informed.",
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: "Discover people",
    desc: "Find people by username or email, send contact requests, and discover public groups.",
  },
];

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:border-primary/20 group">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary mb-4 group-hover:bg-primary/25 transition-all duration-300">
        {icon}
      </div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
