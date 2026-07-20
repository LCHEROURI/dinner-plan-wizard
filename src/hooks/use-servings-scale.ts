import { useEffect, useState } from "react";

const KEY = (planId: string) => `mp:servings:${planId}`;

export function useServingsScale(planId: string, baseServings: number) {
  const [servings, setServings] = useState<number>(baseServings);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(KEY(planId));
    if (stored) {
      const n = parseInt(stored, 10);
      if (Number.isFinite(n) && n > 0) setServings(n);
    } else {
      setServings(baseServings);
    }
  }, [planId, baseServings]);

  const update = (n: number) => {
    const clamped = Math.max(1, Math.min(24, Math.round(n)));
    setServings(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY(planId), String(clamped));
    }
  };

  const factor = baseServings > 0 ? servings / baseServings : 1;
  return { servings, setServings: update, factor };
}
