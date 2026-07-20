#!/usr/bin/env python3
"""
End-to-end UI test: the shared-link page (/share/:token) rendered for an
anonymous viewer must NEVER show the servings stepper or any
servings-derived scaling controls.

Seeds a shared plan via the existing SECURITY DEFINER helper, opens the
shared URL in a fresh, unauthenticated Chromium context, and asserts that
none of the scaling affordances (Increase/Decrease servings buttons,
stepper widget, reset control) are present in the DOM. Also confirms that
the authenticated plan route does not leak the stepper to anon viewers.

Run:  python3 tests/e2e-shared-ui-no-stepper.py
Requires PG* env vars for seeding and a dev server on :8080.
"""
import asyncio
import os
import subprocess
import sys
import uuid
from playwright.async_api import async_playwright

if not os.environ.get("PGHOST"):
    sys.exit("Missing PG* env for seeding")

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
plan_id = str(uuid.uuid4())
owner_id = str(uuid.uuid4())
share_token = f"uitest-{uuid.uuid4().hex[:12]}"
PREF = 8

results: list[tuple[str, bool, str]] = []

def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, bool(cond), detail))
    mark = "✓" if cond else "✗"
    print(f"{mark} {name}" + (f" — {detail}" if detail else ""))

def psql(sql: str) -> None:
    subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-c", sql],
        check=True, capture_output=True, text=True,
    )

async def main() -> None:
    psql(
        f"SELECT public._test_seed_shared_plan('{plan_id}'::uuid, "
        f"'{owner_id}'::uuid, '{share_token}', {PREF});"
    )
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await context.new_page()

            url = f"{BASE_URL}/share/{share_token}"
            resp = await page.goto(url, wait_until="networkidle")
            check("shared page loads for anon viewer",
                  bool(resp) and resp.ok, f"status {resp.status if resp else '?'} @ {url}")

            # Give the query time to resolve.
            try:
                await page.wait_for_selector("main h1", timeout=10_000)
            except Exception:
                pass

            heading = (await page.locator("h1").first.text_content() or "").strip()
            check("plan heading rendered (not the error fallback)",
                  heading and heading != "Link unavailable", f'heading="{heading}"')

            # No stepper buttons (aria-labels come from ServingsControl).
            inc = await page.get_by_role("button", name="Increase servings").count()
            dec = await page.get_by_role("button", name="Decrease servings").count()
            check("no 'Increase servings' button", inc == 0, f"found {inc}")
            check("no 'Decrease servings' button", dec == 0, f"found {dec}")

            # No stepper widget (any container wrapping a servings aria-label).
            stepper = await page.locator(
                'div:has(button[aria-label*="servings" i])'
            ).count()
            check("no scaling stepper widget in DOM", stepper == 0, f"found {stepper}")

            # No reset control produced by the stepper.
            reset_btn = await page.get_by_role("button", name="reset").count()
            check("no scaling 'reset' button", reset_btn == 0, f"found {reset_btn}")

            # Authenticated plan URLs must not leak the stepper to anon either.
            gated = await page.goto(
                f"{BASE_URL}/plans/{plan_id}", wait_until="networkidle"
            )
            leaked = await page.get_by_role(
                "button", name="Increase servings"
            ).count()
            check(
                "authenticated plan route does not leak stepper to anon",
                leaked == 0,
                f"status {gated.status if gated else '?'}, stepper buttons={leaked}",
            )

            await browser.close()
    finally:
        try:
            psql(
                f"SELECT public._test_cleanup_shared_plan('{plan_id}'::uuid, "
                f"'{owner_id}'::uuid);"
            )
        except subprocess.CalledProcessError as e:
            print(f"cleanup failed: {e.stderr}", file=sys.stderr)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} passed")
    if passed != len(results):
        sys.exit(1)

asyncio.run(main())
