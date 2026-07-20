import { z } from "zod";

export const PLAN_NAME_MIN = 1;
export const PLAN_NAME_MAX = 80;

export const planNameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(PLAN_NAME_MIN, { message: "Name can't be empty" })
      .max(PLAN_NAME_MAX, { message: `Keep it under ${PLAN_NAME_MAX} characters` })
      .regex(/^[^\r\n\t]+$/, { message: "No line breaks or tabs" }),
  );

/** Client-side validator. Returns error message or null. */
export function validatePlanName(
  raw: string,
  opts: { existing?: string[]; current?: string } = {},
): string | null {
  const parsed = planNameSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid name";
  const name = parsed.data;
  const others = (opts.existing ?? [])
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n && n !== (opts.current ?? "").trim().toLowerCase());
  if (others.includes(name.toLowerCase())) return "You already have a plan with this name";
  return null;
}
