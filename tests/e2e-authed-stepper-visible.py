#!/usr/bin/env python3
"""
E2E UI test (positive case, self-authenticating): the servings stepper
and scaling-derived controls MUST render for AUTHENTICATED viewers on
both the shared probe route (which imports ServingsControl directly)
and the protected plan detail route.

This test self-provisions its auth: no reliance on
LOVABLE_BROWSER_AUTH_STATUS. It seeds a confirmed auth user via a
service-only PG helper, exchanges email+password for a Supabase session,
injects it into the browser, seeds an owned plan, then drives the UI.

Requirements:
  - PG* env (sandbox) for seeding
  - VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env
  - Dev server on :8080

Run:  python tests/e2e-authed-stepper-visible.py
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from playwright.async_api import async_playwright

if not os.environ.get("PGHOST"):
    sys.exit("Missing PG* env for seeding")

def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    p = Path(".env")
    if not p.exists():
        return env
    for line in p.read_text().splitlines():
        m = re.match(r'^([A-Z0-9_]+)="?(.*?)"?$', line.strip())
        if m:
            env[m.group(1)] = m.group(2)
    return env

ENV = load_env()
SUPABASE_URL = ENV.get("VITE_SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
SUPABASE_KEY = ENV.get("VITE_SUPABASE_PUBLISHABLE_KEY") or os.environ.get(
    "VITE_SUPABASE_PUBLISHABLE_KEY"
)
PROJECT_ID = ENV.get("VITE_SUPABASE_PROJECT_ID") or os.environ.get(
    "VITE_SUPABASE_PROJECT_ID"
)
if not (SUPABASE_URL and SUPABASE_KEY and PROJECT_ID):
    sys.exit("Missing VITE_SUPABASE_URL / _PUBLISHABLE_KEY / _PROJECT_ID in .env")

STORAGE_KEY = f"sb-{PROJECT_ID}-auth-token"
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
SCREENSHOTS = Path("/tmp/browser/authed-stepper-visible")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

email = f"e2e-{uuid.uuid4().hex[:12]}@test.local"
password = f"Pw-{uuid.uuid4().hex}"
plan_id = str(uuid.uuid4())
share_token = f"authtest-{uuid.uuid4().hex[:12]}"
PREF = 6

results: list[tuple[str, bool, str]] = []

def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, bool(cond), detail))
    print(f"{'✓' if cond else '✗'} {name}" + (f" — {detail}" if detail else ""))

def psql(sql: str) -> str:
    out = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-tAc", sql],
        check=True, capture_output=True, text=True,
    )
    return out.stdout.strip()

def gotrue_post(path: str, body: dict) -> dict:
    req = Request(
        f"{SUPABASE_URL}{path}",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
    )
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        sys.exit(f"POST {path} failed: {e.code} {e.read().decode()[:300]}")

def sign_up(email: str, password: str) -> str:
    data = gotrue_post("/auth/v1/signup", {"email": email, "password": password})
    return data["id"] if "id" in data else data["user"]["id"]

def sign_in(email: str, password: str) -> dict:
    return gotrue_post(
        "/auth/v1/token?grant_type=password",
        {"email": email, "password": password},
    )

async def restore_session(page, session: dict) -> None:
    # Supabase JS reads this exact shape from localStorage.
    payload = {
        "access_token": session["access_token"],
        "refresh_token": session["refresh_token"],
        "expires_in": session.get("expires_in", 3600),
        "expires_at": session.get("expires_at"),
        "token_type": session.get("token_type", "bearer"),
        "user": session["user"],
    }
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(payload))})"
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
    # 1) Seed a confirmed auth user + owned plan.
    esc_email = email.replace("'", "''")
    esc_pw = password.replace("'", "''")
    user_id = psql(
        f"SELECT public._test_seed_authed_user('{esc_email}', '{esc_pw}');"
    )
    check("seeded auth user", bool(user_id), f"user_id={user_id}")
    # Direct insert (bypasses _test_seed_shared_plan which would try to
    # re-create the auth.users row we just made).
    psql(
        f"INSERT INTO public.meal_plans "
        f"(id, owner_id, name, plan_length, servings, status, share_token, preferred_servings) "
        f"VALUES ('{plan_id}'::uuid, '{user_id}'::uuid, 'E2E auth stepper', "
        f"5, 4, 'ready', '{share_token}', {PREF});"
    )
    check("seeded owned plan", True, f"plan_id={plan_id}")

    try:
        # 2) Sign in against GoTrue to get a real session.
        session = sign_in(email, password)
        check("acquired Supabase session via password grant",
              "access_token" in session, f"user={session.get('user',{}).get('id')}")

        # 3) Drive the UI.
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await context.new_page()
            await restore_session(page, session)

            # 3a) Shared probe route: component imported directly and must render.
            resp = await page.goto(
                f"{BASE_URL}/share/probe", wait_until="networkidle"
            )
            check("probe route loads", bool(resp) and resp.ok,
                  f"status {resp.status if resp else '?'}")
            slot = await page.locator('[data-testid="probe-slot"]').count()
            check("probe slot mounted", slot == 1, f"count={slot}")
            await assert_stepper_present(page, "shared probe (authed)", "1_probe.png")

            # Bump stepper → 'reset' scaling-derived control appears.
            await page.get_by_role("button", name="Increase servings").first.click()
            reset_ct = await page.get_by_role("button", name="reset").count()
            check("shared probe (authed): 'reset' appears after scaling",
                  reset_ct >= 1, f"found {reset_ct}")

            # 3b) Protected plan detail route: owner must see the stepper.
            resp2 = await page.goto(
                f"{BASE_URL}/plans/{plan_id}", wait_until="networkidle"
            )
            check("protected plan route loads for owner",
                  bool(resp2) and resp2.ok,
                  f"status {resp2.status if resp2 else '?'}")
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
                f"'{user_id}'::uuid);"
            )
        except subprocess.CalledProcessError as e:
            print(f"cleanup failed: {e.stderr}", file=sys.stderr)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} passed")
    if passed != len(results):
        sys.exit(1)

asyncio.run(main())
