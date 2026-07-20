import { Minus, Plus, Users } from "lucide-react";

export function ServingsControl({
  servings,
  baseServings,
  onChange,
}: {
  servings: number;
  baseServings: number;
  onChange: (n: number) => void;
}) {
  const scaled = servings !== baseServings;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm no-print">
      <Users className="h-4 w-4 text-coral" />
      <span className="text-muted-foreground">Servings</span>
      <button
        type="button"
        onClick={() => onChange(servings - 1)}
        disabled={servings <= 1}
        aria-label="Decrease servings"
        className="rounded-full p-1 hover:bg-secondary disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center font-semibold tabular-nums text-primary">{servings}</span>
      <button
        type="button"
        onClick={() => onChange(servings + 1)}
        disabled={servings >= 24}
        aria-label="Increase servings"
        className="rounded-full p-1 hover:bg-secondary disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {scaled && (
        <button
          type="button"
          onClick={() => onChange(baseServings)}
          className="ml-1 text-xs text-muted-foreground hover:text-primary underline"
        >
          reset
        </button>
      )}
    </div>
  );
}
