import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

export function AuthCallback() {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function handleAuthCallback() {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

        const error =
          searchParams.get("error_description") ||
          searchParams.get("error") ||
          hashParams.get("error_description");
        if (error) {
          throw new Error(error);
        }

        const code = searchParams.get("code");
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            console.warn("exchangeCodeForSession:", exchangeErr.message);
          }
        }

        const accessToken = searchParams.get("access_token") || hashParams.get("access_token");
        const refreshToken = searchParams.get("refresh_token") || hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error: setSessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionErr) console.warn("setSession error:", setSessionErr.message);
        }

        // Check for existing session
        const {
          data: { session },
          error: sessionErr,
        } = await supabase.auth.getSession();

        if (sessionErr) throw sessionErr;

        if (session && mounted) {
          toast.success("Successfully signed in!");
          navigate({ to: "/dashboard", replace: true });
          return;
        }

        // Listen for auth state change
        const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
          if (newSession && mounted) {
            toast.success("Successfully signed in!");
            navigate({ to: "/dashboard", replace: true });
          }
        });

        // Fallback check after 3 seconds
        const timer = setTimeout(async () => {
          if (!mounted) return;
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            navigate({ to: "/dashboard", replace: true });
          } else {
            setErrorMsg("Could not complete sign-in. Please try again.");
          }
        }, 3000);

        return () => {
          clearTimeout(timer);
          authListener.subscription.unsubscribe();
        };
      } catch (err) {
        if (mounted) {
          const msg = err instanceof Error ? err.message : "Sign-in callback failed";
          setErrorMsg(msg);
          toast.error(msg);
        }
      }
    }

    handleAuthCallback();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (errorMsg) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-3xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-destructive">Sign-in Error</h1>
          <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
          <button
            onClick={() => navigate({ to: "/auth", replace: true })}
            className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-coral" />
        <h2 className="mt-4 text-lg font-semibold text-primary">Completing sign-in…</h2>
        <p className="mt-1 text-sm text-muted-foreground">Please wait while we log you in.</p>
      </div>
    </div>
  );
}
