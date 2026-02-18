#!/usr/bin/env python3
"""
Playwright E2E: verify SummaryModal writes MTYPE into `#summaryDataInput` and
that the legacy `#summaryJsonInput` is mirrored.

Run: pip install playwright && playwright install

This test does NOT require authentication; it exercises client-side modal
population + select-change -> hidden-input mirroring to prevent the
intermittent race reported by QA.
"""
import os
import sys
import time
import signal
import subprocess
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
    p = subprocess.Popen(FLASK_CMD, cwd=PROJECT_ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
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


def main():
    server = None
    try:
        print('Starting Flask...')
        server = start_flask()
        print('Flask started.')

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context()
            page = ctx.new_page()

            url = f'{BASE_URL}/list?vat={VAT}'
            print('Opening', url)
            page.goto(url)
            time.sleep(1.0)

            # Prepare a small summary payload and write it into the legacy hidden input
            payload = {
                'mark': '000000000000001',
                'AFM': VAT,
                'is_receipt': True,
                'type': 'ΑΠΟΔΕΙΞΗ',
                'lines': [{'id': 'r0', 'description': 'Item', 'amount': '10.00', 'vat': '24'}]
            }

            page.evaluate("(v) => { document.getElementById('summaryJsonInput').value = JSON.stringify(v); }", payload)
            # Open/populate the modal using the client helpers
            page.evaluate("() => { try { if (window.RC_forcePopulateSummaryModal) window.RC_forcePopulateSummaryModal(); if (typeof prefillSummaryModal === 'function') prefillSummaryModal(); const m = document.getElementById('summaryModal'); if (m) m.style.display = 'flex'; } catch(e){ console.warn(e); } }")
            time.sleep(0.5)

            # Ensure the modal and the receipt select exist
            hasModal = page.eval_on_selector('#summaryModal', 'el => !!el')
            if not hasModal:
                raise RuntimeError('Summary modal not present')

            # Wait for the receipt select to be available and populate options
            page.wait_for_selector('#receiptMtypeSelectSummary', timeout=2000)

            # If the select has no options, attempt to call setupReceiptMtype
            opts_count = page.eval_on_selector('#receiptMtypeSelectSummary', 'el => el ? el.options.length : 0')
            if opts_count <= 1:
                # try to invoke setup helper
                page.evaluate("() => { try { if (typeof setupReceiptMtype === 'function') setupReceiptMtype({}); } catch(e){} }")
                time.sleep(0.2)

            # Choose an MTYPE value (prefer 12 or 16 if present)
            chosen = None
            for candidate in ['12','16','11']:
                found = page.eval_on_selector('#receiptMtypeSelectSummary', f"el => Array.from(el.options).some(o=>o.value==='{candidate}')")
                if found:
                    chosen = candidate
                    break

            if not chosen:
                # fallback: pick first non-empty option
                chosen = page.eval_on_selector('#receiptMtypeSelectSummary', "el => (Array.from(el.options).map(o=>o.value).find(v=>v)&&String(Array.from(el.options).map(o=>o.value).find(v=>v))) || ''")

            if not chosen:
                raise RuntimeError('No usable MTYPE option found in receipt select')

            print('Selecting receipt MTYPE ->', chosen)
            page.select_option('#receiptMtypeSelectSummary', chosen)
            # Trigger change handlers
            page.evaluate("() => { const sel = document.getElementById('receiptMtypeSelectSummary'); sel && sel.dispatchEvent(new Event('change', { bubbles: true })); }")
            time.sleep(0.2)

            # Assert that component hidden input contains the MTYPE
            comp_val = page.eval_on_selector('#summaryDataInput', 'el => el ? el.value : ""')
            if chosen not in comp_val:
                print('ERROR: summaryDataInput does not contain chosen mtype')
                print('summaryDataInput=', comp_val)
                raise AssertionError('summaryDataInput missing mtype')

            # Also assert legacy input mirrors it
            legacy_val = page.eval_on_selector('#summaryJsonInput', 'el => el ? el.value : ""')
            if chosen not in legacy_val:
                print('ERROR: summaryJsonInput did not mirror mtype')
                print('summaryJsonInput=', legacy_val)
                raise AssertionError('summaryJsonInput missing mirrored mtype')

            print('OK: summaryDataInput and summaryJsonInput contain MTYPE', chosen)

            browser.close()
    finally:
        if server:
            print('Stopping Flask...')
            stop_proc(server)


if __name__ == '__main__':
    main()
