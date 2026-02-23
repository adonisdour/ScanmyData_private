#!/usr/bin/env python3
"""Basic test to ensure the search page knows when there are receipt-enabled custom categories.
"""
import sys
import json
import flask_login

sys.path.insert(0, '/workspaces/ScanmyData_private')
import app as app_module
from app import app


def test_search_page_receipt_flag(monkeypatch):
    # Prepare a fake credential with one receipt-enabled custom category
    fake_cred = {
        "name": "TestClient",
        "vat": "999999999",
        "custom_categories": [
            {"id": "custom1", "label": "Δοκιμή", "enabled": True, "applies_to_receipts": True}
        ],
    }

    # Create a temporary DATA_DIR and credentials.json so that
    # the inner read_credentials_list_local() inside search() picks it up.
    import tempfile, os
    tmpdir = tempfile.mkdtemp()
    monkeypatch.setattr(app_module, 'DATA_DIR', tmpdir)
    monkeypatch.setattr(app_module, 'credentials_path_for_request', lambda: os.path.join(tmpdir, 'credentials.json'))
    os.makedirs(tmpdir, exist_ok=True)
    with open(os.path.join(tmpdir, 'credentials.json'), 'w', encoding='utf-8') as f:
        json.dump([fake_cred], f)

    # Monkeypatch session loader to return our fake credential
    monkeypatch.setattr(app_module, 'get_active_credential_from_session', lambda: fake_cred)
    # simulate logged-in user by overriding the imported current_user in app_module
    class DummyUser:
        is_authenticated = True
    monkeypatch.setattr(app_module, 'current_user', DummyUser())

    # disable login checks for the duration of this test
    app_module.app.config['LOGIN_DISABLED'] = True
    with app_module.app.test_client() as c:
        # set session active credential name
        with c.session_transaction() as sess:
            sess['active_credential'] = fake_cred['name']
        resp = c.get('/search')
        assert resp.status_code == 200
        body = resp.get_data(as_text=True)
        # the new receipt modals template should be present
        assert 'id="rc-receipt-modals-template"' in body
        # our new helper for receipt-classification should be injected
        assert 'openReceiptClassModal' in body
        # the classification modal markup should exist in the template
        assert 'id="receiptClassModal"' in body
        # should render a select element for categories (dropdown)
        assert '<select' in body and 'receiptClassList' in body
        # the JavaScript snippet should also include our custom category slug
        assert '"custom1"' in body
        # ensure receiptModeChooser element exists in markup (hidden initially)
        assert 'id="receiptsModeChooser"' in body
        # the modal should include the new in-modal mode chooser buttons
        assert 'data-receipt-mode="analysis"' in body and 'data-receipt-mode="mixed"' in body
        # menu should be positioned with left-0 rather than right-0 to avoid off-screen
        assert 'id="receiptsModeMenu"' in body and 'left-0' in body
        # edit button for receipt classification should be included (initially hidden)
        assert 'id="editReceiptClassBtn"' in body
        # there should be a repeat switch checkbox present as well
        assert 'id="repeatEntrySwitch"' in body
        # our JS logic must reference the repeat flag and helper that updates
        assert 'isRepeat' in body and 'updateReceiptClassEditButton' in body
        # the renderSummaryLines logic should gate on receiptsMode && isRepeat
        assert 'receiptsMode && isRepeat' in body
        # since toggle switch was removed there should be no analysis checkbox
        assert 'receiptAnalysisSwitch' not in body

    # now verify a credential that has no explicit applies_to_receipts flag
    # but does have non-empty accounts for a custom category – chooser should
    # still appear.
    fake2 = {
        "name": "TestClient2",
        "vat": "888888888",
        "custom_categories": [
            {"id": "custom2", "label": "Λογαριασμός-only", "enabled": True,
             "accounts": {"6": "85.01"}}
        ],
    }
    monkeypatch.setattr(app_module, 'get_active_credential_from_session', lambda: fake2)
    with app_module.app.test_client() as c2:
        with c2.session_transaction() as sess:
            sess['active_credential'] = fake2['name']
        resp2 = c2.get('/search')
        assert resp2.status_code == 200
        body2 = resp2.get_data(as_text=True)
        assert 'id="receiptsModeChooser"' in body2
        # server-side JS variable should initialise to true
        assert 'let hasReceiptCustomCategories' in body2
        assert 'return !!true' in body2
        # API should list our slug when mode=receipts
        resp_api = c2.get('/api/char_profiles?vat=888888888&mode=receipts')
        api_body = resp_api.get_json()
        assert api_body and 'expense_tags' in api_body
        assert 'custom2' in api_body['expense_tags']

    # scenario: credential lacks receipts-enabled flag/accounts, but a
    # profiles entry contains mapping
    fake3 = {
        "name": "TestClient3",
        "vat": "777777777",
        "custom_categories": [
            {"id": "custom3", "label": "NoFlag", "enabled": True}
        ],
        "char_profiles": [
            {"name": "P1", "mapping": {"6": "custom3"}, "mode": "receipts"}
        ]
    }
    monkeypatch.setattr(app_module, 'get_active_credential_from_session', lambda: fake3)
    with app_module.app.test_client() as c3:
        with c3.session_transaction() as sess:
            sess['active_credential'] = fake3['name']
        resp3 = c3.get('/search')
        assert resp3.status_code == 200
        body3 = resp3.get_data(as_text=True)
        assert 'id="receiptsModeChooser"' in body3
        assert 'let hasReceiptCustomCategories' in body3
        assert 'return !!true' in body3

    # explicit false override: accounts present but checkbox unchecked
    fake4 = {
        "name": "TestClient4",
        "vat": "666666666",
        "custom_categories": [
            {"id": "custom4", "label": "Απενεργοποιημένη", "enabled": True,
             "accounts": {"6": "85.01"}, "applies_to_receipts": False}
        ],
    }
    monkeypatch.setattr(app_module, 'get_active_credential_from_session', lambda: fake4)
    with app_module.app.test_client() as c4:
        with c4.session_transaction() as sess:
            sess['active_credential'] = fake4['name']
        resp4 = c4.get('/search')
        body4 = resp4.get_data(as_text=True)
        # chooser should STILL appear even though the flag is false
        assert 'id="receiptsModeChooser"' in body4
        # analysis option should be present but styled disabled/grey
        assert 'data-receipt-mode="analysis"' in body4
        # clicking it should redirect (JS snippet should exist)
        assert 'window.location.href' in body4
        # but initial JS boolean should still be false
        assert 'return !!false' in body4
        # API tags should omit slug (fallback may return ['αποδειξακια'])
        resp_api4 = c4.get('/api/char_profiles?vat=666666666&mode=receipts')
        tags4 = resp_api4.get_json().get('expense_tags')
        assert tags4 in ([], ['αποδειξακια'])


# verify that when the server sends a receipt summary via the test hook,
# the page includes the javascript snippet that will auto-check the receipts
# switch on load.

def test_receipts_switch_auto_checks_for_server_summary(monkeypatch):
    fake_cred = {"name": "TestClient", "vat": "555555555", "custom_categories": []}
    monkeypatch.setattr(app_module, 'get_active_credential_from_session', lambda: fake_cred)
    app_module.app.config['LOGIN_DISABLED'] = True
    with app_module.app.test_client() as c:
        with c.session_transaction() as sess:
            sess['active_credential'] = fake_cred['name']
        resp = c.get('/search?test_receipt_summary=1')
        assert resp.status_code == 200
        body = resp.get_data(as_text=True)
        # the injected snippet that reads initialSummary should appear
        assert 'const initialSummary' in body
        assert 'sw.checked = true' in body
        assert 'test_receipt_summary' not in body  # query param not echoed


def test_debug_log_writes_file():
    # ensure the debug endpoint appends to receipt_debug.log in workspace
    import os
    logpath = os.path.join(os.getcwd(), 'receipt_debug.log')
    try:
        os.remove(logpath)
    except OSError:
        pass
    # first call with login disabled (existing behaviour)
    app_module.app.config['LOGIN_DISABLED'] = True
    with app_module.app.test_client() as c:
        resp = c.get('/_debug_log?msg=test123')
        assert resp.status_code == 204
    # and now ensure route is public even when login checks are active
    app_module.app.config['LOGIN_DISABLED'] = False
    with app_module.app.test_client() as c2:
        # simulate not-logged-in by not setting session
        resp2 = c2.get('/_debug_log?msg=test456')
        assert resp2.status_code == 204
    assert os.path.exists(logpath)
    with open(logpath, encoding='utf-8') as f:
        data = f.read()
    assert 'test123' in data and 'test456' in data
