#!/usr/bin/env node
/**
 * End-to-end test: shared-link viewers (anon) must NOT be able to read or
 * update meal_plans.preferred_servings.
 *
 * Seeds a plan with a share_token via psql (server-side), then hits the
 * Supabase Data API with the publishable (anon) key from a fresh client,
 * simulating a real shared-link visitor.
 *
 * Run: node tests/e2e-shared-preferred-servings.mjs
 * Requires PG* env vars (for seeding) and VITE_SUPABASE_* (for the anon client).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Load .env
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !KEY) throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
if (!process.env.PGHOST) throw new Error("Missing PG* env for seeding");

const anon = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const planId = randomUUID();
const ownerId = randomUUID(); // fake owner; RLS treats anon the same regardless
const shareToken = `test-${randomUUID().slice(0, 12)}`;
const PREF = 9;

function psql(sql) {
  execSync(`psql -v ON_ERROR_STOP=1`, { input: sql, stdio: ["pipe", "pipe", "pipe"] });
}

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

try {
  // 1) Seed a shared plan with a non-default preferred_servings value.
  psql(`
    INSERT INTO public.meal_plans
      (id, owner_id, name, plan_length, servings, status, share_token, preferred_servings)
    VALUES
      ('${planId}', '${ownerId}', 'E2E share test', 5, 4, 'ready', '${shareToken}', ${PREF});
  `);

  // 2) Anon read via share_token, requesting ONLY allowed columns → should succeed.
  const okRead = await anon
    .from("meal_plans")
    .select("id, name, plan_length, servings, status, share_token")
    .eq("share_token", shareToken)
    .maybeSingle();
  check(
    "anon can read whitelisted columns of a shared plan",
    okRead.data?.id === planId && !okRead.error,
    okRead.error?.message,
  );

  // 3) Anon SELECT that explicitly requests preferred_servings → must fail
  //    (column-level GRANT to anon excludes preferred_servings).
  const readPref = await anon
    .from("meal_plans")
    .select("id, preferred_servings")
    .eq("share_token", shareToken)
    .maybeSingle();
  check(
    "anon CANNOT SELECT preferred_servings on a shared plan",
    readPref.error !== null && readPref.data === null,
    readPref.error?.message ?? `leaked value: ${readPref.data?.preferred_servings}`,
  );

  // 4) Anon SELECT * → PostgREST expands to all columns; must fail because
  //    preferred_servings is not in the anon column grant.
  const readStar = await anon
    .from("meal_plans")
    .select("*")
    .eq("share_token", shareToken)
    .maybeSingle();
  check(
    "anon SELECT * on shared plan is blocked (no grant on preferred_servings)",
    readStar.error !== null,
    readStar.error?.message ?? "unexpected success",
  );

  // 5) Anon UPDATE of preferred_servings by share_token → must fail (RLS
  //    has no anon UPDATE policy; auth.uid() is null).
  const upd = await anon
    .from("meal_plans")
    .update({ preferred_servings: 24 })
    .eq("share_token", shareToken)
    .select();
  check(
    "anon UPDATE of preferred_servings is blocked",
    upd.error !== null || (Array.isArray(upd.data) && upd.data.length === 0),
    upd.error?.message ?? `rows affected: ${upd.data?.length}`,
  );

  // 6) Confirm the DB value is unchanged after the attempted update.
  const check6 = execSync(
    `psql -Atc "SELECT preferred_servings FROM public.meal_plans WHERE id = '${planId}'"`,
  )
    .toString()
    .trim();
  check(
    "server-side value of preferred_servings is unchanged",
    check6 === String(PREF),
    `expected ${PREF}, got ${check6}`,
  );

  // 7) Anon UPDATE via id (no share_token filter) → must also fail.
  const updById = await anon
    .from("meal_plans")
    .update({ preferred_servings: 1 })
    .eq("id", planId)
    .select();
  check(
    "anon UPDATE by id is blocked",
    updById.error !== null || (Array.isArray(updById.data) && updById.data.length === 0),
    updById.error?.message ?? `rows affected: ${updById.data?.length}`,
  );
} finally {
  // Cleanup
  try {
    psql(`DELETE FROM public.meal_plans WHERE id = '${planId}';`);
  } catch (e) {
    console.error("cleanup failed:", e.message);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exit(1);
}
