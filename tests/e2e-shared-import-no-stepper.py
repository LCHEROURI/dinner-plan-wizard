#!/usr/bin/env python3
"""
E2E UI test: even when a shared (unauthenticated) route imports
ServingsControl directly, anonymous viewers must never see the stepper
or any scaling-derived controls.

The probe route at /share/probe imports ServingsControl and mounts it in
the DOM tree. This test loads that page in a fresh, unauthenticated
Chromium context and asserts:
  - the page loads
  - the probe slot exists (so we know the component was mounted)
  - the slot is empty (component returned null)
  - no stepper aria-labels, no reset button, no wrapping stepper widget

Run:  python3 tests/e2e-shared-import-no-stepper.py
"""
import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
SCREENSHOTS = Path("/tmp/browser/shared-import-no-stepper")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

results: list[tuple[str, bool, str]] = []

def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, bool(cond), detail))
    print(f"{'✓' if cond else '✗'} {name}" + (f" — {detail}" if detail else ""))

async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        # Ensure truly anonymous: no storage state, no cookies.
        await context.clear_cookies()
        page = await context.new_page()

        url = f"{BASE_URL}/share/probe"
        resp = await page.goto(url, wait_until="networkidle")
        check("probe route loads for anon viewer",
              bool(resp) and resp.ok, f"status {resp.status if resp else '?'}")

        # Wait for the probe slot to prove the shared route mounted and
        # imported ServingsControl.
        try:
            await page.wait_for_selector('[data-testid="probe-slot"]', timeout=10_000)
            mounted = True
        except Exception:
            mounted = False
        check("shared route imported and mounted ServingsControl", mounted)

        await page.screenshot(path=str(SCREENSHOTS / "probe.png"))

        slot_html = (await page.locator('[data-testid="probe-slot"]').inner_html()).strip()
        check("probe slot is empty (component returned null)",
              slot_html == "", f"innerHTML={slot_html!r}")

        inc = await page.get_by_role("button", name="Increase servings").count()
        dec = await page.get_by_role("button", name="Decrease servings").count()
        check("no 'Increase servings' button", inc == 0, f"found {inc}")
        check("no 'Decrease servings' button", dec == 0, f"found {dec}")

        stepper = await page.locator(
            'div:has(button[aria-label*="servings" i])'
        ).count()
        check("no scaling stepper widget in DOM", stepper == 0, f"found {stepper}")

        reset_btn = await page.get_by_role("button", name="reset").count()
        check("no scaling 'reset' button", reset_btn == 0, f"found {reset_btn}")

        # Auth state must remain unauthenticated throughout.
        auth_keys = await page.evaluate(
            "() => Object.keys(localStorage).filter(k => k.startsWith('sb-'))"
        )
        check("no supabase auth session in localStorage",
              len(auth_keys) == 0, f"keys={auth_keys}")

        await browser.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} passed")
    if passed != len(results):
        sys.exit(1)

asyncio.run(main())
