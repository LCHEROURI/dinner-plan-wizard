import { useEffect, useState } from "react";
import { auth } from "@/integrations/firebase/config";
import { onAuthStateChanged } from "firebase/auth";

/**
 * Reactive auth-state hook. Returns `true` once a Firebase user exists,
 * `false` once we know there isn't one, and `null` while initial auth check is in flight.
 */
export function useIsAuthenticated(): boolean | null {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setState(!!user);
    });
    return () => unsub();
  }, []);
  return state;
}
