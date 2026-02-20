import os
import json
from pathlib import Path

import pytest

import app as _app_module
from app import app, save_settings, load_settings, get_customer_docs_file


def test_api_validate_payment_mtype_respects_configured_article_codes(tmp_path):
    """When paymentMethodType==3 (Μετρητά) the endpoint should consult
    credentials/settings article movement codes and suggest the configured code
    (not a hard-coded value).
    """
    vat = "999000111"
    mark = "TEST-MARK-CASH-01"

    with app.test_client() as client, app.app_context():
        # Disable auth enforcement for this unit test (avoid depending on DB users)
        app.config['LOGIN_DISABLED'] = True

        # Backup and ensure stable settings
        orig_settings = load_settings() or {}
        try:
            # write a configured cash article movement code different from defaults
            s = dict(orig_settings)
            s["article_movement_type_tameiaki"] = "42"  # user-configured code
            save_settings(s)

            # Prepare a per-vat invoices file containing our test invoice
            inv = {"mark": mark, "paymentMethodType": "3", "AFM_issuer": vat}
            invoices_path = get_customer_docs_file(vat)
            os.makedirs(os.path.dirname(invoices_path), exist_ok=True)
            with open(invoices_path, "w", encoding="utf-8") as f:
                json.dump([inv], f, ensure_ascii=False)

            # Call API with a non-matching article-code (should trigger special_case)
            resp = client.post(
                "/api/validate_payment_mtype",
                json={"mark": mark, "vat": vat, "selected_mtype": "15"},
            )
            assert resp.status_code == 200
            data = resp.get_json()
            assert data.get("ok") is True
            assert data.get("special_case") is True, data
            assert data.get("expected_mtype") and data["expected_mtype"]["code"] == "42"

            # If client already selects the configured article-code -> no warning
            resp2 = client.post("/api/validate_payment_mtype", json={"mark": mark, "vat": vat, "selected_mtype": "42"})
            assert resp2.status_code == 200
            data2 = resp2.get_json()
            assert data2.get("warning") is None

            # If client selects the epsilon MTYPE matching paymentMethodType -> no warning
            resp3 = client.post(
                "/api/validate_payment_mtype",
                json={"mark": mark, "vat": vat, "selected_mtype": "3.4.2"},
            )
            assert resp3.status_code == 200
            data3 = resp3.get_json()
            assert data3.get("warning") is None

        finally:
            # restore original settings and cleanup test invoices file
            save_settings(orig_settings or {})
            try:
                if os.path.exists(invoices_path):
                    os.remove(invoices_path)
            except Exception:
                pass

def test_enrich_g_categories_includes_cash_code():
    """The helper should include cash_mtype_code and cash_mtype_label in the
    returned structure so the client can use it for pre‑checks.
    """
    from g_category_helpers import enrich_categories_with_mtype

    settings = {"article_movement_type_agoron_exodon_tameiaki": "XYZ"}
    result = enrich_categories_with_mtype(["foo"], settings)
    assert result.get("cash_mtype_code") == "XYZ"
    # label is derived from MOVEMENT_TYPE_LABELS constant
    assert "Ταμειακή" in result.get("cash_mtype_label", "")