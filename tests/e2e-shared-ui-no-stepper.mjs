#!/usr/bin/env node
/**
 * End-to-end UI test: the shared-link page (/share/:token) rendered for an
 * anonymous viewer must NEVER show the servings stepper or any
 * servings-derived scaling controls.
 *
 * Uses Playwright against the running dev server at http://localhost:8080.
 * Seeds a shared plan via the existing SECURITY DEFINER helper, opens the
 * shared URL in a fresh, unauthenticated browser context, and asserts that
 * none of the scaling affordances (Increase/Decrease servings buttons,
 * "Servings" stepper label, reset control) are present in the DOM.
 *
 * Run: node tests/e2e-shared-ui-no-stepper.mjs
 * Requires PG* env vars for seeding and a dev server on :8080.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

if (!process.env.PGHOST) throw new Error("Missing PG* env for seeding");

const planId = randomUUID();
const ownerId = randomUUID();
const shareToken = `uitest-${randomUUID().slice(0, 12)}`;
const PREF = 8;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

function psql(sql) {
  execSync(`psql -v ON_ERROR_STOP=1`, { input: sql, stdio: ["pipe", "pipe", "pipe"] });
}

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

let browser;
try {
  psql(
    `SELECT public._test_seed_shared_plan('${planId}'::uuid, '${ownerId}'::uuid, '${shareToken}', ${PREF});`,
  );

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await context.new_page ? await context.new_page() : await context.newPage();

  const url = `${BASE_URL}/share/${shareToken}`;
  const resp = await page.goto(url, { waitUntil: "networkidle" });
  check("shared page loads for anon viewer", resp && resp.ok(), `status ${resp?.status()} @ ${url}`);

  // Wait for the shared plan heading to render (or the "Link unavailable"
  // fallback) so we know the query resolved before we probe for controls.
  await page
    .waitForSelector('h1:has-text("Link unavailable"), main :is(h1)', { timeout: 10_000 })
    .catch(() => {});

  const heading = (await page.locator("h1").first().textContent())?.trim() ?? "";
  check("plan heading rendered (not the error fallback)", heading && heading !== "Link unavailable", `heading="${heading}"`);

  // No stepper buttons (aria-labels come straight from ServingsControl).
  const incCount = await page.getByRole("button", { name: /increase servings/i }).count();
  const decCount = await page.getByRole("button", { name: /decrease servings/i }).count();
  check("no 'Increase servings' button", incCount === 0, `found ${incCount}`);
  check("no 'Decrease servings' button", decCount === 0, `found ${decCount}`);

  // No stepper label. Anywhere the word appears must be static prose (e.g.
  // "4 servings"), never the stepper widget's "Servings" label.
  const steppers = await page.locator('div:has(button[aria-label*="servings" i])').count();
  check("no scaling stepper widget in DOM", steppers === 0, `found ${steppers}`);

  // No reset control produced by the stepper.
  const resetBtn = await page.getByRole("button", { name: /^reset$/i }).count();
  check("no scaling 'reset' button", resetBtn === 0, `found ${resetBtn}`);

  // Shopping list / servings-derived pages are gated behind /_authenticated.
  // Hitting the plan URL directly as anon must NOT reveal the stepper either.
  const gatedResp = await page.goto(`${BASE_URL}/plans/${planId}`, { waitUntil: "networkidle" });
  const stepperOnGated = await page.getByRole("button", { name: /increase servings/i }).count();
  check(
    "authenticated plan route does not leak stepper to anon",
    stepperOnGated === 0,
    `status ${gatedResp?.status()}, stepper buttons=${stepperOnGated}`,
  );
} finally {
  if (browser) await browser.close();
  try {
    psql(`SELECT public._test_cleanup_shared_plan('${planId}'::uuid, '${ownerId}'::uuid);`);
  } catch (e) {
    console.error("cleanup failed:", e.message);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
