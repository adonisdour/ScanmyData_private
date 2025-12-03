#!/usr/bin/env python3
"""
Headless E2E test for fragment partial-refresh.
Requires: pip install playwright
Then: playwright install

This script:
 - starts the Flask app (flask run) as a subprocess
 - launches Playwright headless browser with two pages
 - captures #summary-container in page B
 - in page B, performs a direct fragment fetch and replaces DOM (simulating the live-update path)
 - captures snapshot after replacement and diffs

Run from project root.
"""
import os
import sys
import time
import signal
import subprocess
import difflib
from pathlib import Path

from playwright.sync_api import sync_playwright

PROJECT_ROOT = Path(__file__).parents[1].resolve()
HOST = os.getenv('FBP_HOST', '127.0.0.1')
PORT = int(os.getenv('FBP_PORT', '5000'))
BASE_URL = f'http://{HOST}:{PORT}'
VAT = os.getenv('FBP_TEST_VAT', '802576637')

FLASK_CMD = [sys.executable, '-m', 'flask', 'run', '--host', HOST, '--port', str(PORT)]


def start_flask():
    env = os.environ.copy()
    env.setdefault('FLASK_APP', 'app.py')
    env.setdefault('FLASK_ENV', 'development')
    # Run in subprocess
    p = subprocess.Popen(FLASK_CMD, cwd=PROJECT_ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    # wait for server to start
    for i in range(30):
        try:
            import requests
            r = requests.get(f"{BASE_URL}/list?vat={VAT}", timeout=1)
            if r.status_code in (200, 302, 404):
                return p
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError('Flask did not start in time; check logs')


def stop_proc(p):
    try:
        p.send_signal(signal.SIGINT)
        p.wait(timeout=5)
    except Exception:
        try:
            p.kill()
        except Exception:
            pass


def snapshot_container(page):
    # return innerHTML or outerHTML of the container for diff
    html = page.eval_on_selector('#summary-container', 'el => el ? el.innerHTML : ""')
    return html or ''


def main():
    server = None
    try:
        print('Starting Flask...')
        server = start_flask()
        print('Flask started.')

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context_a = browser.new_context()
            context_b = browser.new_context()
            page_a = context_a.new_page()
            page_b = context_b.new_page()

            url = f'{BASE_URL}/list?vat={VAT}'
            print('Opening pages to', url)
            page_a.goto(url)
            page_b.goto(url)
            # wait to ensure client-side JS runs
            time.sleep(1.2)

            before = snapshot_container(page_b)
            print('Captured before snapshot (length=%d).' % len(before))

            # Simulate update: perform fragment fetch in page_b as if triggered by poll
            print('Fetching fragment and replacing DOM in page_b...')
            page_b.evaluate("async (url)=>{ const r=await fetch(url); const j=await r.json(); if(j && j.ok && j.table_html){ document.getElementById('summary-container').innerHTML = j.table_html; } }", f'{BASE_URL}/list/fragment')
            time.sleep(0.8)
            after = snapshot_container(page_b)
            print('Captured after snapshot (length=%d).' % len(after))

            if before == after:
                print('\nOK: runtime DOM identical after fragment replacement.')
            else:
                print('\nDOM differs — unified diff (context lines=3):')
                a = before.splitlines(keepends=True)
                b = after.splitlines(keepends=True)
                diff = difflib.unified_diff(a, b, fromfile='before', tofile='after', n=3)
                for line in diff:
                    sys.stdout.write(line)

            browser.close()
    finally:
        if server:
            print('Stopping Flask...')
            stop_proc(server)


if __name__ == '__main__':
    main()
