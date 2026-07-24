"""
End-to-end test: for each plan_length 1..7, the shared plan page must render
the correct "{n} nights" header AND exactly n recipe cards ("Night 1"..."Night n"),
proving the length value renders and downstream calculations stay consistent.

Seeds 7 shared plans via a SECURITY DEFINER helper (service_role only, invoked
through psql), visits /share/<token> with Playwright, asserts the rendered
text, then cleans up.
"""
import asyncio, os, re, subprocess, uuid
from pathlib import Path
from playwright.async_api import async_playwright

# Load .env
for line in Path(".env").read_text().splitlines():
    m = re.match(r'^([A-Z0-9_]+)="?([^"]*)"?$', line)
    if m and m.group(1) not in os.environ:
        os.environ[m.group(1)] = m.group(2)

assert os.environ.get("PGHOST"), "Missing PG* env"

SCREENSHOTS = Path("/tmp/browser/plan-length-render")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

def psql(sql: str) -> None:
    subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-c", sql], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

SERVINGS = 4
plans = []  # (length, plan_id, owner_id, token)
for n in range(1, 8):
    plans.append((n, str(uuid.uuid4()), str(uuid.uuid4()), f"e2e-len-{n}-{uuid.uuid4().hex[:8]}"))

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(f"{'✓' if cond else '✗'} {name}{' — ' + detail if detail else ''}")

async def main():
    # Seed
    for n, pid, oid, tok in plans:
        psql(f"SELECT public._test_seed_shared_plan_with_recipes("
             f"'{pid}'::uuid, '{oid}'::uuid, '{tok}', {n}, {SERVINGS});")

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()

            for n, pid, oid, tok in plans:
                await page.goto(f"http://localhost:8080/share/{tok}", wait_until="domcontentloaded")
                # Wait for the header line "{n} nights · {SERVINGS} servings"
                await page.get_by_text(f"{n} nights · {SERVINGS} servings").wait_for(timeout=8000)
                await page.screenshot(path=str(SCREENSHOTS / f"len_{n}.png"))

                body = (await page.locator("body").inner_text()).lower()
                check(f"length {n}: header shows '{n} nights · {SERVINGS} servings'",
                      f"{n} nights · {SERVINGS} servings".lower() in body)

                # Recipe cards: exactly n "Night i · Test" headings, no "Night n+1"
                for i in range(1, n + 1):
                    ok = await page.get_by_text(f"Night {i} · Test").count() >= 1
                    check(f"length {n}: renders Night {i}", ok)
                overflow = await page.get_by_text(f"Night {n + 1} · Test").count()
                check(f"length {n}: does NOT render Night {n + 1}", overflow == 0)

            await browser.close()
    finally:
        for _, pid, oid, _ in plans:
            psql(f"SELECT public._test_cleanup_shared_plan('{pid}'::uuid, '{oid}'::uuid);")

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        raise SystemExit(1)

asyncio.run(main())
