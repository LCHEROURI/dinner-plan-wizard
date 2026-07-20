import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { setPreferredServings } from "@/lib/meal-plans.functions";

const KEY = (planId: string) => `mp:servings:${planId}`;

export function useServingsScale(
  planId: string,
  baseServings: number,
  preferredServings?: number | null,
) {
  const initial =
    preferredServings && preferredServings > 0 ? preferredServings : baseServings;
  const [servings, setServings] = useState<number>(initial);
  const persistFn = useServerFn(setPreferredServings);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<number | null>(preferredServings ?? null);

  // Sync when server value or plan changes
  useEffect(() => {
    const next =
      preferredServings && preferredServings > 0 ? preferredServings : baseServings;
    setServings(next);
    lastSaved.current = preferredServings ?? null;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY(planId), String(next));
    }
  }, [planId, baseServings, preferredServings]);

  const update = (n: number) => {
    const clamped = Math.max(1, Math.min(24, Math.round(n)));
    setServings(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY(planId), String(clamped));
    }
    // Debounced persist to server
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const value = clamped === baseServings ? null : clamped;
      if (value === lastSaved.current) return;
      lastSaved.current = value;
      persistFn({ data: { planId, servings: value } }).catch(() => {
        // Non-fatal: local state still reflects the choice
      });
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const factor = baseServings > 0 ? servings / baseServings : 1;
  return { servings, setServings: update, factor };
}
