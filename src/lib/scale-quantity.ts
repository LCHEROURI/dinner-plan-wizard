// Client-side ingredient quantity scaling.
// Parses common recipe quantity strings and scales the numeric portion by a factor.

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
  "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

function parseNumberToken(tok: string): number | null {
  tok = tok.trim();
  if (!tok) return null;
  if (UNICODE_FRACTIONS[tok] != null) return UNICODE_FRACTIONS[tok];
  // mixed like "1 1/2"
  const mixed = tok.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  // fraction "1/2"
  const frac = tok.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  // decimal or int
  const num = parseFloat(tok);
  return Number.isFinite(num) ? num : null;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  // Round to nearest common fraction eighths for small values
  const rounded = Math.round(n * 8) / 8;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  const fracMap: Record<string, string> = {
    "0.125": "⅛", "0.25": "¼", "0.375": "⅜", "0.5": "½",
    "0.625": "⅝", "0.75": "¾", "0.875": "⅞",
  };
  const key = frac.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (frac === 0) return String(whole);
  const fracStr = fracMap[frac.toString()] ?? fracMap[key];
  if (fracStr) return whole > 0 ? `${whole} ${fracStr}` : fracStr;
  // fall back to decimal, trim trailing zeros
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Scale a quantity string like "2 cups", "1 1/2 lb", "3", "1/2 tsp",
 * "2-3 cloves", "a pinch", "to taste" by the given factor.
 * Non-numeric strings pass through unchanged.
 */
export function scaleQuantity(qty: string, factor: number): string {
  if (!qty || factor === 1) return qty;
  const trimmed = qty.trim();
  if (!trimmed) return qty;

  // Range like "2-3" or "2 - 3"
  const range = trimmed.match(/^([\d./\s½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+?)\s*[-–]\s*([\d./\s½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+?)(\s+.*)?$/);
  if (range) {
    const a = parseNumberToken(range[1]);
    const b = parseNumberToken(range[2]);
    const rest = range[3] ?? "";
    if (a != null && b != null) return `${formatNumber(a * factor)}–${formatNumber(b * factor)}${rest}`;
  }

  // Leading number (possibly mixed / fraction / unicode), followed by rest
  const m = trimmed.match(/^([\d./\s½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+?)(\s+.*)?$/);
  if (m) {
    const numPart = m[1].trim();
    const rest = m[2] ?? "";
    const n = parseNumberToken(numPart);
    if (n != null) return `${formatNumber(n * factor)}${rest}`;
  }
  return qty; // "to taste", "a pinch", etc.
}

/** Scale a shopping list display_text which may contain "+" concatenations. */
export function scaleDisplayText(text: string | null | undefined, factor: number): string {
  if (!text) return "";
  if (factor === 1) return text;
  return text.split(" + ").map((part) => scaleQuantity(part, factor)).join(" + ");
}
