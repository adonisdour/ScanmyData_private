import json
import os
import sys
from pathlib import Path

# Ensure workspace root is on sys.path so we can import app.py
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import app as flask_app

VAT = '802576637'
# tests run against the 'tony' group data folder where the credential "ΒΑΨΙΜΟ" exists
E_FILE = os.path.join('data', 'tony', 'epsilon', f'{VAT}_epsilon_invoices.json')

summary_with_mtype = {
    'mark': '000000000000001',
    'AFM': VAT,
    'Name': 'Test Company',
    'type': 'ΑΠΟΔΕΙΞΗ',
    'is_receipt': True,
    'lines': [{'id': 'r0', 'amount': '10.00', 'vat': '24', 'vatCategory': '24%', 'description': 'Item'}],
    'mtype': '16'
}

summary_with_camel = {
    'mark': '000000000000002',
    'AFM': VAT,
    'Name': 'Test Company',
    'type': 'ΑΠΟΔΕΙΞΗ',
    'is_receipt': True,
    'lines': [{'id': 'r0', 'amount': '5.00', 'vat': '24', 'vatCategory': '24%', 'description': 'Item2'}],
    'receiptMtype': '12'  # camelCase to test server normalization
}

summary_json_only = {
    'mark': '000000000000003',
    'AFM': VAT,
    'Name': 'Test Company',
    'type': 'ΑΠΟΔΕΙΞΗ',
    'is_receipt': True,
    'lines': [{'id': 'r0', 'amount': '7.50', 'vat': '24', 'vatCategory': '24%', 'description': 'Item3'}],
    # no mtype keys here; server should apply repeat_entry fallback (likely none)
}


def read_epsilon():
    try:
        with open(E_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def do_post_form(client, payload):
    data = {'summary_json': json.dumps(payload)}
    resp = client.post('/save_summary', data=data)
    print('FORM POST status:', resp.status_code, resp.location if resp.status_code in (301,302) else '')
    try:
        print('Response:', resp.get_data(as_text=True)[:400])
    except Exception:
        pass


def do_post_json(client, payload):
    resp = client.post('/save_summary', json=payload)
    print('JSON POST status:', resp.status_code)
    try:
        print('Response JSON:', resp.get_data(as_text=True)[:400])
    except Exception:
        pass


if __name__ == '__main__':
    with flask_app.test_client() as c:
        # Log in as admin so before_request does not redirect to /login
        login_resp = c.post('/login', data={'username': 'admin', 'password': 'admin123'}, follow_redirects=True)
        print('Login status:', login_resp.status_code)
        # ensure the test client has an active credential in session (match credentials.json)
        with c.session_transaction() as sess:
            # ensure test client reads group-specific credentials (data/tony/credentials.json)
            sess['active_group'] = 'tony'
            sess['active_credential'] = 'ΒΑΨΙΜΟ'

        print('Epsilon before:', read_epsilon())
        print('\n-- Sending form POST with mtype --')
        do_post_form(c, summary_with_mtype)
        eps1 = read_epsilon()
        print('Epsilon after first:', eps1)
        # assert mark1 present with mtype '16'
        if not any((e.get('mark') == summary_with_mtype['mark'] and (e.get('mtype') == '16' or e.get('receipt_mtype') == '16' or e.get('invoice_mtype') == '16')) for e in eps1):
            print('ERROR: first summary not found in epsilon or mtype mismatch')
            sys.exit(2)

        print('\n-- Sending JSON POST with camelCase receiptMtype --')
        do_post_json(c, summary_with_camel)
        eps2 = read_epsilon()
        print('Epsilon after second:', eps2)
        if not any((e.get('mark') == summary_with_camel['mark'] and (e.get('mtype') == '12' or e.get('receipt_mtype') == '12' or e.get('invoice_mtype') == '12')) for e in eps2):
            print('ERROR: second summary not found in epsilon or receiptMtype not normalized to 12')
            sys.exit(3)

        print('\n-- Sending JSON POST without mtype (should rely on repeat_entry) --')
        do_post_json(c, summary_json_only)
        eps3 = read_epsilon()
        print('Epsilon after third:', eps3)
        if not any(e.get('mark') == summary_json_only['mark'] for e in eps3):
            print('ERROR: third summary not appended to epsilon')
            sys.exit(4)

        print('\nAll checks passed')

