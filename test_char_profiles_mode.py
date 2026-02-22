#!/usr/bin/env python3
"""Tests for char_profiles API mode handling (invoices vs receipts)."""

import json, os, tempfile, sys
sys.path.insert(0, '/workspaces/ScanmyData_private')
import app as app_module
from app import app


def setup_client(monkeypatch, profiles=None, expense_tags=None, custom_categories=None):
    fake_cred = {
        "name": "TestClient",
        "vat": "999999999",
        "expense_tags": expense_tags or [],
        "custom_categories": custom_categories or [],
        "char_profiles": profiles or []
    }
    # prepare DATA_DIR infrastructure
    import tempfile
    tmpdir = tempfile.mkdtemp()
    monkeypatch.setattr(app_module, 'DATA_DIR', tmpdir)
    monkeypatch.setattr(app_module, 'credentials_path_for_request', lambda: os.path.join(tmpdir, 'credentials.json'))
    with open(os.path.join(tmpdir, 'credentials.json'), 'w', encoding='utf-8') as f:
        json.dump([fake_cred], f)
    monkeypatch.setattr(app_module, 'get_active_credential_from_session', lambda: fake_cred)
    class DummyUser:
        is_authenticated = True
    monkeypatch.setattr(app_module, 'current_user', DummyUser())
    app_module.app.config['LOGIN_DISABLED'] = True
    return fake_cred


def test_char_profiles_mode_filter(monkeypatch):
    # create client with two profiles, one for invoices and one for receipts
    profs = [
        {"id": "p1", "name": "InvProf", "mapping": {"kat_fpa_a":"cat1"}, "mode":"invoices"},
        {"id": "p2", "name": "RecProf", "mapping": {"kat_fpa_a":"cat2"}, "mode":"receipts"},
    ]
    cred = setup_client(monkeypatch, profiles=profs, expense_tags=["cat1","cat2"])
    with app_module.app.test_client() as c:
        with c.session_transaction() as sess:
            sess['active_credential'] = cred['name']
        # fetch invoices mode (default)
        resp = c.get('/api/char_profiles?vat=999999999')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['ok']
        names = [p['name'] for p in body['profiles']]
        assert 'InvProf' in names and 'RecProf' not in names
        # fetch receipts mode
        resp = c.get('/api/char_profiles?vat=999999999&mode=receipts')
        body = resp.get_json()
        names = [p['name'] for p in body['profiles']]
        assert 'RecProf' in names and 'InvProf' not in names


def test_char_profiles_save_mode(monkeypatch):
    cred = setup_client(monkeypatch)
    with app_module.app.test_client() as c:
        with c.session_transaction() as sess:
            sess['active_credential'] = cred['name']
        # save a receipts profile
        payload = {"vat":"999999999","name":"R1","mapping":{"kat_fpa_a":"foo","kat_fpa_b":"foo","kat_fpa_g":"foo","kat_fpa_d":"foo","kat_fpa_e":"foo"},"mode":"receipts"}
        resp = c.post('/api/char_profiles/save', json=payload)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['ok']
        # now retrieve receipts only
        resp = c.get('/api/char_profiles?vat=999999999&mode=receipts')
        body = resp.get_json()
        assert any(p['name']=='R1' for p in body['profiles'])
        # invoice list should not include it
        resp = c.get('/api/char_profiles?vat=999999999')
        body = resp.get_json()
        assert not any(p['name']=='R1' for p in body['profiles'])

        # also verify that the profiles page HTML reflects mode
        resp = c.get('/profiles?vat=999999999&mode=receipts')
        assert resp.status_code == 200
        html = resp.get_data(as_text=True)
        assert 'Προφίλ Χαρακτηρισμών' in html
        assert 'id="modeHeadline"' in html
        assert 'Αποδείξεις' in html
        # page loaded (categories will depend on receipt-enabled custom tags)
        pass

    # ensure API returns invoice tags as receipt categories when no custom receipts
    cred2 = setup_client(monkeypatch, expense_tags=["foo","bar"], profiles=[])
    with app_module.app.test_client() as c2:
        with c2.session_transaction() as sess:
            sess['active_credential'] = cred2['name']
        resp = c2.get('/api/char_profiles?vat=999999999&mode=receipts')
        body = resp.get_json()
        assert "foo" in body['expense_tags'] and "bar" in body['expense_tags']


if __name__ == '__main__':
    test_char_profiles_mode_filter(None)
    test_char_profiles_save_mode(None)
    print("char_profiles_mode tests passed")
