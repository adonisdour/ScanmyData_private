import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import app as flask_app

VAT = '802576637'
E_FILE = os.path.join('data', 'tony', 'epsilon', f'{VAT}_epsilon_invoices.json')

summary_receipt_no_mtype = {
    'mark': '000000000000010',
    'AFM': VAT,
    'Name': 'Test Company',
    'type': 'ΑΠΟΔΕΙΞΗ',
    'is_receipt': True,
    'lines': [{'id': 'r0', 'amount': '11.00', 'vat': '24', 'vatCategory': '24%', 'description': 'RepeatTest'}]
}


def read_epsilon():
    try:
        with open(E_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return []


if __name__ == '__main__':
    with flask_app.test_client() as c:
        # login
        login_resp = c.post('/login', data={'username': 'admin', 'password': 'admin123'}, follow_redirects=True)
        print('login status ->', login_resp.status_code)
        try:
            print('login resp snippet ->', login_resp.get_data(as_text=True)[:200])
        except Exception:
            pass

        with c.session_transaction() as sess:
            sess['active_group'] = 'tony'
            sess['active_credential'] = 'ΒΑΨΙΜΟ'

        # Instead of calling the API, patch credentials.json for the test credential
        # so that save_summary will pick up repeat_entry.receipt_mtype.
        creds_path = Path('data') / 'tony' / 'credentials.json'
        try:
            creds = json.loads(creds_path.read_text(encoding='utf-8'))
        except Exception:
            creds = []

        patched = False
        for cred in creds:
            if cred.get('name') == 'ΒΑΨΙΜΟ':
                rep = cred.get('repeat_entry') or {}
                if not rep.get('mapping'):
                    rep['mapping'] = { '0%':'αποδειξακια', '6%':'αποδειξακια', '13%':'αποδειξακια', '17%':'αποδειξακια', '24%':'αποδειξακια' }
                rep['enabled'] = True
                rep['receipt_mtype'] = '12'
                rep['invoice_mtype'] = rep.get('invoice_mtype', '')
                cred['repeat_entry'] = rep
                patched = True
                break

        if not patched:
            print('ERROR: credential ΒΑΨΙΜΟ not found in data/tony/credentials.json')
            sys.exit(2)

        creds_path.write_text(json.dumps(creds, ensure_ascii=False, indent=2), encoding='utf-8')

        # now POST a receipt without mtype and expect server to apply repeat_entry.receipt_mtype
        resp2 = c.post('/save_summary', json=summary_receipt_no_mtype)
        print('/save_summary ->', resp2.status_code)
        eps = read_epsilon()
        print('Epsilon tail:', eps[-3:])
        if not any(e.get('mark') == summary_receipt_no_mtype['mark'] and (e.get('mtype') == '12' or e.get('receipt_mtype') == '12') for e in eps):
            print('ERROR: repeat receipt save did not apply receipt_mtype from repeat_entry')
            sys.exit(3)

        print('OK: repeat receipt used receipt_mtype from repeat_entry')
