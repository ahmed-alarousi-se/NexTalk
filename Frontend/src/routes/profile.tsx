import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { ProfilePageContent } from "@/components/profile/ProfilePageContent";
import { useAuth } from "@/lib/auth";

type ProfileSearch = {
  tab?: "general" | "security";
};

export const Route = createFileRoute("/profile")({
  validateSearch: (search: Record<string, unknown>): ProfileSearch => ({
    tab: search.tab === "security" ? "security" : "general",
  }),
  head: () => ({
    meta: [
      { title: "Profile · NexTalk" },
      { name: "description", content: "Manage your NexTalk profile, Firebase session, and security settings." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const { tab } = Route.useSearch();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" />;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-1/2 -right-32 h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-10 glass-strong border-b border-white/5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to chats
          </Link>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg gradient-shimmer">
              <MessageCircle className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight hidden sm:inline">Profile & Security</span>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 sm:py-8 pb-16">
        <ProfilePageContent defaultTab={tab} />
      </main>
    </div>
  );
}
