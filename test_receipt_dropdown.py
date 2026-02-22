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
        # since toggle switch was removed there should be no analysis checkbox
        assert 'receiptAnalysisSwitch' not in body


if __name__ == '__main__':
    test_search_page_receipt_flag()
    print("Test ran successfully")
