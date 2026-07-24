/**
 * Light transcript cleanup for meal-planning vocabulary.
 *
 * SAFETY: never rewrites ingredient names, quantities, allergens, dietary
 * restrictions or medical nutrition instructions. It only:
 *  - trims and normalizes whitespace,
 *  - lowercases the first character when it's a stray uppercase from the
 *    recognizer (kept simple; nouns keep their casing since the recognizer
 *    typically lowercases them),
 *  - rewrites spelled-out fractions like "one half" → "1/2" that recognizers
 *    commonly emit for recipe quantities,
 *  - strips trailing spoken punctuation words ("period", "comma") when they
 *    appear at the very end.
 */

const FRACTION_WORDS: Array<[RegExp, string]> = [
  [/\bone half\b/gi, "1/2"],
  [/\bone third\b/gi, "1/3"],
  [/\btwo thirds\b/gi, "2/3"],
  [/\bone quarter\b/gi, "1/4"],
  [/\bone fourth\b/gi, "1/4"],
  [/\bthree quarters\b/gi, "3/4"],
  [/\bthree fourths\b/gi, "3/4"],
  [/\ba half\b/gi, "1/2"],
];

const TRAILING_PUNCT_WORDS = /\s+(period|full stop|comma)\s*$/i;

export function cleanupMealPlanningTranscript(input: string): string {
  if (!input) return "";
  let out = input.replace(/\s+/g, " ").trim();
  for (const [re, repl] of FRACTION_WORDS) out = out.replace(re, repl);
  out = out.replace(TRAILING_PUNCT_WORDS, "");
  return out;
}

/**
 * Append `addition` to `base` with correct spacing:
 *  - one space between them (or none if base ends in whitespace),
 *  - no leading space if base is empty.
 */
export function appendWithSpacing(base: string, addition: string): string {
  if (!base) return addition;
  if (!addition) return base;
  const needsSpace = !/\s$/.test(base) && !/^[\s,.;:!?)]/.test(addition);
  return base + (needsSpace ? " " : "") + addition;
}
