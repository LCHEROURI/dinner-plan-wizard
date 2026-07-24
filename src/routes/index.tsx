import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChefHat, Sparkles, ShoppingBasket, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
      setSignedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const cta = signedIn
    ? { label: "Go to dashboard", to: "/dashboard" as const }
    : { label: "Get started free", to: "/auth" as const };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <ChefHat className="h-6 w-6 text-coral" />
          Lovable Meals
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {signedIn ? (
            <Link to="/dashboard" className="rounded-full bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/auth" className="text-primary hover:opacity-80">Sign in</Link>
              <Link to="/auth" className="rounded-full bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-coral/30 bg-coral/10 px-3 py-1 text-xs font-medium text-coral">
              <Sparkles className="h-3.5 w-3.5" /> AI weeknight planner
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-primary md:text-6xl">
              Dinner, sorted for the whole week.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Tell Lovable Meals about your week — schedule, household, allergies, what's in your pantry —
              and get a 3, 5, or 7-night dinner plan with real, recognizable recipes and one
              tidy shopping list.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <button
                onClick={() => navigate({ to: cta.to })}
                className="rounded-full bg-coral px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                {cta.label}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 pb-24 md:grid-cols-3">
          {[
            { icon: ChefHat, title: "Real recipes only", body: "Chicken Piccata, Chana Masala, Oyakodon — never made-up AI mashups." },
            { icon: Clock, title: "Fits your week", body: "Set your max total time. Skill-appropriate. Leftovers included." },
            { icon: ShoppingBasket, title: "One shopping list", body: "Consolidated by category, checkable, printable." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-3xl border border-border bg-card p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-coral/10 text-coral">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-primary">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        AI recipes are suggestions — always check ingredients against your own allergies.
      </footer>
    </div>
  );
}
