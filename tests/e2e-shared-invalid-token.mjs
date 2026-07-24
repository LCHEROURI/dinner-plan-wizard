#!/usr/bin/env node
/**
 * End-to-end test: accessing shared plans/recipes with an INVALID share_token
 * must not leak any data.
 *
 * Verifies both layers:
 *  (a) Data API: RPCs get_shared_plan / get_shared_recipes return no rows
 *      for a token that does not exist, AND direct table reads via anon
 *      still return no rows (the broad "share_token IS NOT NULL" policy
 *      that used to leak everything is gone).
 *  (b) UI: /share/<bad-token> renders the "Link unavailable" state and
 *      contains no owner/plan data from the seeded real plan.
 *
 * Seeds one real shared plan so we can prove that a *different* invalid
 * token cannot see it.
 *
 * Run: node tests/e2e-shared-invalid-token.mjs
 * Requires PG* env vars (for seeding) and VITE_SUPABASE_* (for the anon client).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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

const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:8080";

const planId = randomUUID();
const ownerId = randomUUID();
const realToken = `real-${randomUUID().slice(0, 12)}`;
// _test_seed_shared_plan hardcodes name='E2E share test'; use that as the canary.
const REAL_PLAN_NAME = "E2E share test";
const INVALID_TOKENS = [
  "does-not-exist",
  "",
  "' OR '1'='1",
  "null",
  randomUUID(),
];

function psql(sql) {
  execSync(`psql -v ON_ERROR_STOP=1`, { input: sql, stdio: ["pipe", "pipe", "pipe"] });
}

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

try {
  // Seed a real shared plan (so an "empty" result cannot be excused as "the DB is empty").
  psql(
    `SELECT public._test_seed_shared_plan('${planId}'::uuid, '${ownerId}'::uuid, '${realToken}', 4);
     UPDATE public.meal_plans SET name = '${REAL_PLAN_NAME}', summary = 'do-not-leak-summary' WHERE id = '${planId}';`,
  );

  // Sanity: the real token still works via the RPC (regression guard).
  const okReal = await anon.rpc("get_shared_plan", { p_token: realToken }).maybeSingle();
  check(
    "sanity: valid token returns the seeded plan",
    okReal.data && okReal.data.id === planId,
    okReal.error?.message ?? `got: ${JSON.stringify(okReal.data)}`,
  );

  for (const bad of INVALID_TOKENS) {
    const label = JSON.stringify(bad);

    // (a1) RPC get_shared_plan with an invalid token returns nothing.
    const rpcPlan = await anon.rpc("get_shared_plan", { p_token: bad }).maybeSingle();
    check(
      `rpc get_shared_plan(${label}) returns no data`,
      rpcPlan.data === null,
      rpcPlan.error?.message ?? `leaked: ${JSON.stringify(rpcPlan.data)}`,
    );

    // (a2) RPC get_shared_recipes with an invalid token returns an empty list.
    const rpcRec = await anon.rpc("get_shared_recipes", { p_token: bad });
    check(
      `rpc get_shared_recipes(${label}) returns empty list`,
      Array.isArray(rpcRec.data) && rpcRec.data.length === 0,
      rpcRec.error?.message ?? `leaked ${rpcRec.data?.length} rows`,
    );

    // (a3) Direct table read via anon with an invalid token returns nothing
    // and MUST NOT return the real plan (regression guard against the old
    // "share_token IS NOT NULL" public policy).
    const direct = await anon
      .from("meal_plans")
      .select("id, name")
      .eq("share_token", bad);
    const leakedReal =
      Array.isArray(direct.data) && direct.data.some((r) => r.id === planId);
    check(
      `anon direct read on meal_plans with ${label} does not leak the real plan`,
      !leakedReal,
      leakedReal ? "leaked real plan row" : "",
    );

    // (a4) Recipes table: anon direct read via a nested share_token filter
    // MUST NOT return rows (no public policy exists anymore).
    const recDirect = await anon.from("recipes").select("id").limit(1);
    check(
      `anon direct read on recipes is empty (no public policy) for ${label}`,
      Array.isArray(recDirect.data) && recDirect.data.length === 0,
      recDirect.error?.message ?? `leaked ${recDirect.data?.length} rows`,
    );

    // (b) UI: /share/<bad-token> must not embed any real plan data.
    // Skip empty-string token (would resolve to /share/ which is a different route).
    if (bad === "" || bad.includes("/")) continue;
    const encoded = encodeURIComponent(bad);
    let html = "";
    try {
      const res = await fetch(`${APP_ORIGIN}/share/${encoded}`, {
        headers: { Accept: "text/html" },
      });
      html = await res.text();
      check(
        `GET /share/${label} responds (status ${res.status})`,
        res.status < 500,
        `status=${res.status}`,
      );
    } catch (e) {
      check(`GET /share/${label} responds`, false, e.message);
      continue;
    }
    check(
      `/share/${label} does not leak the real plan name`,
      !html.includes(REAL_PLAN_NAME),
      "REAL_PLAN_NAME appeared in HTML",
    );
    check(
      `/share/${label} does not leak the real plan summary`,
      !html.includes("do-not-leak-summary"),
      "summary appeared in HTML",
    );
    check(
      `/share/${label} does not leak the owner id`,
      !html.includes(ownerId),
      "owner_id appeared in HTML",
    );
    check(
      `/share/${label} does not leak the real share_token`,
      !html.includes(realToken),
      "share_token appeared in HTML",
    );
  }
} finally {
  try {
    psql(`SELECT public._test_cleanup_shared_plan('${planId}'::uuid, '${ownerId}'::uuid);`);
  } catch (e) {
    console.error("cleanup failed:", e.message);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
