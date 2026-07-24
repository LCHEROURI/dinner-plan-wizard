"""End-to-end brand check: every place that used to say "Kun Meals" now
says "Lovable Meals", including anonymous/shared surfaces.

Covers:
  - Public routes: /, /auth
  - Shared anonymous route: /share/{token} (seeded via test SQL helper)
  - HTML <head> metadata on public routes (title, og:title, meta author)

For each route we assert the visible page contains "Lovable Meals" and does
NOT contain the standalone word "Kun" anywhere (case-insensitive, word
boundary — so words like "kunststoff" or "chunk" wouldn't false-flag if
they ever appeared).
"""
import asyncio, re, subprocess, sys, uuid
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:8080"
SCREENSHOTS = Path(__file__).parent.parent / "tmp" / "brand-rename"
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

KUN_WORD = re.compile(r"\bkun\b", re.IGNORECASE)

results: list[tuple[str, bool, str]] = []

def check(label: str, ok: bool, detail: str = "") -> None:
    marker = "\u2713" if ok else "\u2717"
    print(f"{marker} {label}{' \u2014 ' + detail if detail else ''}")
    results.append((label, ok, detail))

def psql(sql: str) -> str:
    return subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-tAc", sql],
        check=True, capture_output=True, text=True,
    ).stdout.strip()

async def assert_route(page, label: str, url: str, screenshot_name: str) -> None:
    resp = await page.goto(url, wait_until="networkidle")
    check(f"{label}: route loads",
          bool(resp) and resp.ok,
          f"status {resp.status if resp else '?'}")
    # Full HTML (includes <head>) + rendered text.
    html = await page.content()
    body_text = await page.locator("body").inner_text()
    await page.screenshot(path=str(SCREENSHOTS / screenshot_name))
    check(f"{label}: 'Lovable Meals' present in body",
          "Lovable Meals" in body_text,
          f"body_len={len(body_text)}")
    kun_body = KUN_WORD.findall(body_text)
    check(f"{label}: no standalone 'Kun' in body",
          not kun_body, f"matches={kun_body}")
    kun_html = KUN_WORD.findall(html)
    check(f"{label}: no standalone 'Kun' in full HTML (head + body)",
          not kun_html, f"matches={kun_html[:5]}")

async def main() -> None:
    # Seed an anonymous-shareable plan so /share/{token} is reachable.
    plan_id = str(uuid.uuid4())
    owner_id = str(uuid.uuid4())
    share_token = f"brand-{uuid.uuid4().hex[:10]}"
    psql(
        f"SELECT public._test_seed_shared_plan("
        f"'{plan_id}'::uuid, '{owner_id}'::uuid, '{share_token}', 4);"
    )
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await context.new_page()

            await assert_route(page, "public home (/)", f"{BASE_URL}/", "1_home.png")
            await assert_route(page, "auth (/auth)", f"{BASE_URL}/auth", "2_auth.png")
            await assert_route(
                page, f"shared (/share/{share_token})",
                f"{BASE_URL}/share/{share_token}", "3_share.png",
            )

            await browser.close()
    finally:
        try:
            psql(
                f"SELECT public._test_cleanup_shared_plan("
                f"'{plan_id}'::uuid, '{owner_id}'::uuid);"
            )
        except subprocess.CalledProcessError as e:
            print(f"cleanup failed: {e.stderr}", file=sys.stderr)

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{passed}/{total} passed")
    if passed != total:
        sys.exit(1)

asyncio.run(main())
