import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reactive auth-state hook. Returns `true` once a Supabase session exists,
 * `false` once we know there isn't one, and `null` while the initial
 * getSession() is still in flight. Components that must never render for
 * anonymous viewers should treat `null` and `false` the same and render
 * nothing.
 */
export function useIsAuthenticated(): boolean | null {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setState(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setState(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return state;
}
