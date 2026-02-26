#!/usr/bin/env python3
"""
Playwright E2E: verify the cash->MTYPE warning modal appears when saving a
G-category invoice paid in cash and the selected article MTYPE differs from
the configured cash article-code.

Run: pip install playwright && playwright install

This test populates `#summaryJsonInput` with an invoice (paymentMethodType=3),
opens the Summary modal, selects MTYPE '12' and presses the modal Save button.
It expects a confirmation modal (id starting with `modalConfirm_`) to appear.
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
    for _ in range(30):
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

            # Invoice summary payload with paymentMethodType = '3' (cash)
            payload = {
                'mark': 'TEST-E2E-MARK-01',
                'AFM': VAT,
                'is_receipt': False,
                'docType': 'invoice',
                'type': '1.1',
                'type_name': 'Τιμολόγιο',
                'paymentMethodType': '3',
                'paymentMethodLabel': 'Μετρητά',
                'lines': [{'id': 'r0', 'description': 'Item', 'amount': '100.00', 'vat': '24'}],
                'totalNetValue': '100.00',
                'totalVatAmount': '24.00',
                'totalValue': '124.00'
            }

            # Put payload into legacy hidden input and open modal
            page.evaluate('(v) => { document.getElementById("summaryJsonInput").value = JSON.stringify(v); }', payload)
            page.evaluate("() => { try { if (window.RC_forcePopulateSummaryModal) window.RC_forcePopulateSummaryModal(); if (typeof prefillSummaryModal === 'function') prefillSummaryModal(); const m = document.getElementById('summaryModal'); if (m) m.style.display = 'flex'; } catch(e){ console.warn(e); } }")
            time.sleep(0.4)

            # Ensure the invoice MTYPE select is visible
            page.wait_for_selector('#invoiceMtypeSelect', timeout=2000)
            opts = page.eval_on_selector('#invoiceMtypeSelect', 'el => Array.from(el.options).map(o=>({v:o.value,t:o.text}))')
            print('invoiceMtypeSelect options:', opts)

            # Prefer selecting '12' (Αγορών - Εξόδων) which should differ from configured cash '16'
            target = None
            for cand in ['12','16','14']:
                if any(o['v'] == cand for o in opts):
                    target = cand
                    break
            if not target:
                # pick first real option
                target = next((o['v'] for o in opts if o['v']), None)
            if not target:
                raise RuntimeError('No MTYPE option available in invoice select')

            print('Selecting invoice MTYPE ->', target)
            page.select_option('#invoiceMtypeSelect', target)
            page.evaluate("() => { const sel = document.getElementById('invoiceMtypeSelect'); sel && sel.dispatchEvent(new Event('change', { bubbles: true })); }")
            time.sleep(0.2)

            # Click Summary modal Save button (this should trigger legacy form submit)
            page.click('#summaryModal .modal-save-btn')

            # Wait briefly for confirmation modal to appear
            try:
                page.wait_for_selector('div[id^="modalConfirm_"]', timeout=2000)
                print('OK: confirmation modal appeared')
            except Exception:
                # Dump some useful debug info from the page for diagnosis
                console_log = page.evaluate('() => (window.__RC_DEBUG_SUMMARY || {})')
                print('Confirmation modal did NOT appear; debug snapshot:', console_log)
                # grab summaryJsonInput and summaryDataInput
                legacy = page.eval_on_selector('#summaryJsonInput', 'el => el ? el.value : ""')
                comp = page.eval_on_selector('#summaryDataInput', 'el => el ? el.value : ""')
                print('legacy summaryJsonInput:', legacy)
                print('component summaryDataInput:', comp)
                raise AssertionError('Confirmation modal did not appear')

            # simulate clicking the 'Αλλαγή τώρα' button so the script updates the mtype
            page.click('div[id^="modalConfirm_"] button:has-text("Αλλαγή τώρα")')
            time.sleep(0.2)
            # verify that invoiceMtypeSelect and hidden JSON have been updated
            updated_sel = page.eval_on_selector('#invoiceMtypeSelect', 'el => el ? el.value : ""')
            updated_json = page.eval_on_selector('#summaryJsonInput', 'el => el ? el.value : ""')
            print('after change-now, select=', updated_sel, 'json=', updated_json)
            if updated_sel != cash_code and cash_code not in updated_json:
                raise AssertionError('Cash-override did not apply correctly')


            # --- ensure clicking close/cancel does NOT submit the legacy form ---
            page.evaluate("() => { window.__TEST_SUBMIT_HIT = false; const f = document.getElementById('saveSummaryForm'); if(f){ f.addEventListener('submit', () => { window.__TEST_SUBMIT_HIT = true; }); } }")
            # open the modal again (it was left open after last cancel)
            page.click('#summaryModal .modal-summary-close');
            time.sleep(0.2)
            hit = page.evaluate('() => window.__TEST_SUBMIT_HIT');
            print('submit hit after component close X?', hit)
            if hit:
                raise AssertionError('Legacy form was submitted when clicking component X to close modal')
            # also try the legacy close button if present
            page.click('#modalCloseBtn');
            time.sleep(0.2)
            hit_legacy = page.evaluate('() => window.__TEST_SUBMIT_HIT');
            print('submit hit after legacy close btn?', hit_legacy)
            if hit_legacy:
                raise AssertionError('Legacy form was submitted when clicking #modalCloseBtn')
            # reopen and click cancel
            page.click('#summaryModal .modal-save-btn');
            time.sleep(0.2)
            page.click('#summaryModal .modal-cancel-btn');
            time.sleep(0.2)
            hit2 = page.evaluate('() => window.__TEST_SUBMIT_HIT');
            print('submit hit after cancel button?', hit2)
            if hit2:
                raise AssertionError('Legacy form was submitted when cancelling modal')

            # --- verify amount-wrapping logic ---
            payload2 = dict(payload)
            payload2['lines'] = [{'id': 'r0', 'description': 'Item', 'amount': '38 50', 'vat': '24'}]
            page.evaluate('(v) => { document.getElementById("summaryJsonInput").value = JSON.stringify(v); }', payload2)
            page.evaluate("() => { try { if (window.RC_forcePopulateSummaryModal) window.RC_forcePopulateSummaryModal(); if (typeof prefillSummaryModal === 'function') prefillSummaryModal(); const m = document.getElementById('summaryModal'); if (m) m.style.display = 'flex'; } catch(e){ console.warn(e); } }")
            time.sleep(0.4)
            # check that the amount cell contains a <br>
            amt_html = page.eval_on_selector('#summaryModal .amount-col', 'el => el ? el.innerHTML : ""')
            print('wrapped amount html:', amt_html)
            if '<br' not in amt_html:
                raise AssertionError('Amount formatting did not insert break for spaced values')

            # --- repeat entry flow warning (should appear automatically) ---
            # enable repeat switch and inject a problematic summary without clicking save
            page.check('#repeatEntrySwitch')
            payload3 = dict(payload)
            payload3['paymentMethodType'] = '3'
            payload3['lines'] = [{'id': 'r0', 'description': 'Item', 'amount': '100.00', 'vat': '24'}]
            page.evaluate('(v) => { document.getElementById("summaryJsonInput").value = JSON.stringify(v); }', payload3)
            # open modal to trigger guard
            page.evaluate("() => { const m = document.getElementById('summaryModal'); if(m) m.style.display='flex'; }")
            # wait for the warning confirm
            try:
                page.wait_for_selector('div[id^="modalConfirm_"]', timeout=2000)
                print('OK: repeat warning modal appeared')
            except Exception:
                raise AssertionError('Repeat warning modal did NOT appear when repeat is on and wrong mtype')
            # close the confirmation (choose continue) to allow save
            page.click('div[id^="modalConfirm_"] button:has-text("Συνέχεια")')
            time.sleep(0.2)

            browser.close()
    finally:
        if server:
            print('Stopping Flask...')
            stop_proc(server)


if __name__ == '__main__':
    main()
