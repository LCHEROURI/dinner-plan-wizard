#!/usr/bin/env python3
"""
E2E UI test (positive case): for AUTHENTICATED viewers, the servings
stepper and its scaling-derived controls MUST render — on the shared
probe route (which imports ServingsControl directly) and on the
protected plan detail route.

Companion to:
  - tests/e2e-shared-ui-no-stepper.py
  - tests/e2e-shared-import-no-stepper.py
  - tests/servings-control-auth.test.tsx

Requirements:
  - LOVABLE_BROWSER_AUTH_STATUS=injected (user signed in via preview)
  - PG* env for seeding a plan owned by the signed-in user

Run:  python3 tests/e2e-authed-stepper-visible.py
"""
import asyncio
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from playwright.async_api import async_playwright

AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
if AUTH_STATUS != "injected":
    sys.exit(
        f"LOVABLE_BROWSER_AUTH_STATUS={AUTH_STATUS!r}; sign in via the "
        f"Lovable preview so a Supabase session is injected, then re-run."
    )
if not os.environ.get("PGHOST"):
    sys.exit("Missing PG* env for seeding")

SESSION_JSON = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
STORAGE_KEY = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
USER_ID = json.loads(SESSION_JSON)["user"]["id"]

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
SCREENSHOTS = Path("/tmp/browser/authed-stepper-visible")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

plan_id = str(uuid.uuid4())
share_token = f"authtest-{uuid.uuid4().hex[:12]}"
PREF = 6

results: list[tuple[str, bool, str]] = []

def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, bool(cond), detail))
    print(f"{'✓' if cond else '✗'} {name}" + (f" — {detail}" if detail else ""))

def psql(sql: str) -> None:
    subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-c", sql],
        check=True, capture_output=True, text=True,
    )

async def restore_session(context, page) -> None:
    if COOKIES_JSON:
        cookies = json.loads(COOKIES_JSON)
        for c in cookies:
            c["url"] = BASE_URL
        await context.add_cookies(cookies)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(SESSION_JSON)})"
    )

async def assert_stepper_present(page, label: str, screenshot: str) -> None:
    try:
        await page.wait_for_selector(
            'button[aria-label="Increase servings"]', timeout=10_000
        )
    except Exception:
        pass
    await page.screenshot(path=str(SCREENSHOTS / screenshot))

    inc = await page.get_by_role("button", name="Increase servings").count()
    dec = await page.get_by_role("button", name="Decrease servings").count()
    stepper = await page.locator(
        'div:has(button[aria-label*="servings" i])'
    ).count()
    check(f"{label}: Increase servings button present", inc >= 1, f"found {inc}")
    check(f"{label}: Decrease servings button present", dec >= 1, f"found {dec}")
    check(f"{label}: stepper widget present", stepper >= 1, f"found {stepper}")

async def main() -> None:
    psql(
        f"SELECT public._test_seed_shared_plan('{plan_id}'::uuid, "
        f"'{USER_ID}'::uuid, '{share_token}', {PREF});"
    )
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await context.new_page()
            await restore_session(context, page)

            # 1) Shared probe route — component is imported directly and
            #    must render for the authenticated viewer.
            resp = await page.goto(
                f"{BASE_URL}/share/probe", wait_until="networkidle"
            )
            check("probe route loads", bool(resp) and resp.ok,
                  f"status {resp.status if resp else '?'}")
            slot = await page.locator('[data-testid="probe-slot"]').count()
            check("probe slot mounted", slot == 1, f"count={slot}")
            await assert_stepper_present(page, "shared probe (authed)", "1_probe.png")

            # Bump the stepper and confirm the reset affordance appears —
            # proves scaling-derived controls also render for authed users.
            await page.get_by_role("button", name="Increase servings").first.click()
            reset_ct = await page.get_by_role("button", name="reset").count()
            check("shared probe (authed): 'reset' appears after scaling",
                  reset_ct >= 1, f"found {reset_ct}")

            # 2) Protected plan detail route — owner must see the stepper.
            resp2 = await page.goto(
                f"{BASE_URL}/plans/{plan_id}", wait_until="networkidle"
            )
            check("protected plan route loads for owner",
                  bool(resp2) and resp2.ok,
                  f"status {resp2.status if resp2 else '?'}")
            # Not the /auth redirect.
            check("owner not redirected to /auth",
                  "/auth" not in page.url, f"url={page.url}")
            await assert_stepper_present(
                page, "protected plan (owner)", "2_plan.png"
            )

            await browser.close()
    finally:
        try:
            psql(
                f"SELECT public._test_cleanup_shared_plan('{plan_id}'::uuid, "
                f"'{USER_ID}'::uuid);"
            )
        except subprocess.CalledProcessError as e:
            print(f"cleanup failed: {e.stderr}", file=sys.stderr)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} passed")
    if passed != len(results):
        sys.exit(1)

asyncio.run(main())
