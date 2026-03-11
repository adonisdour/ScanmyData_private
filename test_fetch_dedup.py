import os
import json
from pathlib import Path

import pytest

import app as _app_module
from app import (
    append_doc_to_customer_file,
    append_summary_to_customer_file,
    get_customer_docs_file,
    get_customer_summary_file,
    load_settings,
    save_settings,
)


def _clean_file(path):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


def test_append_doc_promotes_classification(tmp_path):
    # make sure legacy mode not active for this scenario
    os.environ.pop('LEGACY_FETCH_MODE', None)
    vat = "999111222"
    invoices_path = get_customer_docs_file(vat)
    os.makedirs(os.path.dirname(invoices_path), exist_ok=True)

    # start with an unclassified entry
    first = {"mark": "AAA111", "classification": ""}
    with open(invoices_path, "w", encoding="utf-8") as f:
        json.dump([first], f, ensure_ascii=False)

    # re-adding identical object should return False and not modify file
    assert append_doc_to_customer_file(first, vat) is False
    with open(invoices_path, encoding="utf-8") as f:
        data = json.load(f)
    assert data == [first]

    # now fetch the same mark with χαρακτηρισμενο
    second = {"mark": "AAA111", "classification": "χαρακτηρισμενο"}
    assert append_doc_to_customer_file(second, vat) is True
    with open(invoices_path, encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 1
    assert data[0]["classification"] == "χαρακτηρισμενο"
    assert "updated_at" in data[0]

    # if the classification is already χαρακτηρισμενο but other fields change
    third = {"mark": "AAA111", "classification": "χαρακτηρισμενο", "totalValue": "42"}
    assert append_doc_to_customer_file(third, vat) is True
    with open(invoices_path, encoding="utf-8") as f:
        data = json.load(f)
    assert data[0]["totalValue"] == "42"
    # updated_at should remain present (not removed)
    assert "updated_at" in data[0]

    # ensure receipts are not merged
    receipt1 = {"mark": "RRR001", "classification": "", "_is_receipt": True}
    assert append_doc_to_customer_file(receipt1, vat) is True
    receipt2 = {"mark": "RRR001", "classification": "χαρακτηρισμενο", "_is_receipt": True}
    # since it's a receipt, second record should be appended instead of merged
    assert append_doc_to_customer_file(receipt2, vat) is True
    with open(invoices_path, encoding="utf-8") as f:
        data = json.load(f)
    # expect two entries for the same mark
    assert sum(1 for d in data if d.get("mark") == "RRR001") == 2

    # simulate a corrupted cache containing duplicate invoices for a single mark
    dup1 = {"mark": "AAA111", "classification": "χαρακτηρισμενο", "memo": 1}
    dup2 = {"mark": "AAA111", "classification": "χαρακτηρισμενο", "memo": 2}
    with open(invoices_path, "w", encoding="utf-8") as f:
        json.dump([dup1, dup2], f, ensure_ascii=False)
    # re-adding the same payload should dedupe the extra entry even though
    # nothing meaningful changed
    assert append_doc_to_customer_file(dup1, vat) is True
    with open(invoices_path, encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 1
    assert data[0].get("memo") == 1

    # legacy mode append-only behaviour should coexist with normal tests
    # for this portion of the test we toggle legacy mode via environment
    orig_env = os.environ.get("LEGACY_FETCH_MODE")
    os.environ["LEGACY_FETCH_MODE"] = "1"
    try:
        # start clean again
        with open(invoices_path, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False)
        a = {"mark": "AAA", "classification": ""}
        append_doc_to_customer_file(a, vat)
        b = {"mark": "AAA", "classification": "χαρακτηρισμενο"}
        append_doc_to_customer_file(b, vat)
        with open(invoices_path, encoding="utf-8") as f:
            dlist = json.load(f)
        assert len(dlist) == 2
    finally:
        if orig_env is None:
            os.environ.pop("LEGACY_FETCH_MODE", None)
        else:
            os.environ["LEGACY_FETCH_MODE"] = orig_env

    # test pruning helper removes stale invoice marks
    from app import prune_customer_invoices
    # add a fresh invoice and a stale one
    fresh = {"mark": "NEWMARK", "classification": ""}
    append_doc_to_customer_file(fresh, vat)
    # cache now contains NEWMARK and existing AAA111
    # prune keeping only NEWMARK
    assert prune_customer_invoices(vat, {"NEWMARK"}) is True
    with open(invoices_path, encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 1
    assert data[0].get("mark") == "NEWMARK"

    _clean_file(invoices_path)


def test_prune_respects_date_window(tmp_path):
    # set up a cache with three invoices at different dates
    vat = "555000111"
    invoices_path = get_customer_docs_file(vat)
    os.makedirs(os.path.dirname(invoices_path), exist_ok=True)

    older = {"mark": "OLD", "issueDate": "10/01/2026", "classification": ""}
    middle = {"mark": "MID", "issueDate": "22/02/2026", "classification": ""}
    later = {"mark": "LATE", "issueDate": "26/02/2026", "classification": ""}
    with open(invoices_path, "w", encoding="utf-8") as f:
        json.dump([older, middle, later], f, ensure_ascii=False)

    from app import prune_customer_invoices
    # simulate fetching 20/02-01/03 returning only MID and LATE
    # since our keep set contains both invoices that fall inside the window
    # there should be **no change** to the file
    keep = {"MID", "LATE"}
    changed = prune_customer_invoices(vat, keep, date_from="20/02/2026", date_to="01/03/2026")
    assert changed is False
    with open(invoices_path, encoding="utf-8") as f:
        data = json.load(f)
    # older (10/1) remains, middle and later also remain
    marks = {d.get("mark") for d in data}
    assert "OLD" in marks
    assert "MID" in marks
    assert "LATE" in marks

    # if we prune again with window covering only middle and keep only nothing,
    # then middle should be removed but old and late kept
    changed2 = prune_customer_invoices(vat, set(), date_from="20/02/2026", date_to="25/02/2026")
    assert changed2 is True
    with open(invoices_path, encoding="utf-8") as f:
        data2 = json.load(f)
    marks2 = {d.get("mark") for d in data2}
    assert "MID" not in marks2
    assert "OLD" in marks2
    assert "LATE" in marks2

    _clean_file(invoices_path)


def test_fetch_route_background_returns(monkeypatch):
    """POSTing to /fetch should return a page immediately even if request_docs
    takes time; the work runs in a background thread."""
    from app import app

    def fake_request_docs(date_from, date_to, mark, aade_user, aade_key, debug, save_excel):
        import time
        time.sleep(0.1)
        return [], []

    monkeypatch.setattr('app.request_docs', fake_request_docs)
    os.environ['AADE_USER_ID'] = 'dummy'
    os.environ['AADE_SUBSCRIPTION_KEY'] = 'dummy'

    with app.test_client() as client, app.app_context():
        app.config['LOGIN_DISABLED'] = True
        resp = client.post('/fetch', data={
            'date_from': '01/01/2026',
            'date_to': '02/01/2026',
            'vat_number': '123456789',
            'use_credential': ''
        })
        assert resp.status_code == 200
        assert b'Fetch started' in resp.data
        # now poll notification API until the background thread adds the
        # completion message
        import time
        notif = []
        for _ in range(20):
            nr = client.get('/api/global_notifications')
            assert nr.status_code == 200
            data = nr.get_json() or {}
            notif = data.get('msgs') or []
            if any('Fetch complete for VAT' in m for m in notif):
                break
            time.sleep(0.05)
        assert any('Fetch complete for VAT' in m for m in notif), notif

    os.environ.pop('AADE_USER_ID', None)
    os.environ.pop('AADE_SUBSCRIPTION_KEY', None)


def test_background_fetch_uses_group_folder(tmp_path, monkeypatch):
    """The worker should still write into the active group's directory.

    When the fetch thread runs there is no request context and
    ``auth.get_active_group`` will return ``None``.  in the past this
    meant documents landed in the global ``DATA_DIR`` rather than the
    group's folder; the fix stores the directory in thread-local storage.
    """
    from app import app, get_customer_docs_file
    import auth, threading

    # make the base dir point inside tmp_path so we can inspect it
    monkeypatch.setattr('app.BASE_DIR', str(tmp_path))

    # fake active group: available on main thread only
    class DummyGrp:
        data_folder = 'grpX'
        name = 'grpX'

    def fake_active_group():
        if threading.current_thread().name == 'MainThread':
            return DummyGrp()
        return None

    monkeypatch.setattr('auth.get_active_group', fake_active_group)

    # patch the fetch machinery to return a single invoice/summary
    def fake_request_docs(date_from, date_to, mark, aade_user, aade_key, debug, save_excel):
        return ([{'mark': 'ZZZ1'}], [{ 'mark': 'ZZZ1'}])
    monkeypatch.setattr('app.request_docs', fake_request_docs)

    os.environ['AADE_USER_ID'] = 'dummy'
    os.environ['AADE_SUBSCRIPTION_KEY'] = 'dummy'

    with app.test_client() as client, app.app_context():
        app.config['LOGIN_DISABLED'] = True
        resp = client.post('/fetch', data={
            'date_from': '01/01/2026',
            'date_to': '02/01/2026',
            'vat_number': '111222333',
            'use_credential': ''
        })
        assert resp.status_code == 200
        assert b'Fetch started' in resp.data
        # wait for completion message
        import time
        for _ in range(20):
            nr = client.get('/api/global_notifications')
            data = nr.get_json() or {}
            if any('Fetch complete for VAT' in m for m in data.get('msgs', [])):
                break
            time.sleep(0.05)

    os.environ.pop('AADE_USER_ID', None)
    os.environ.pop('AADE_SUBSCRIPTION_KEY', None)

    # the invoices file should exist under tmp_path/data/grpX
    expected = os.path.join(str(tmp_path), 'data', 'grpX', '111222333_invoices.json')
    assert os.path.exists(expected), f"expected group file {expected} to be written"



def test_global_notifications_endpoint():
    from app import global_notifications, app
    # clear any state
    global_notifications.clear()
    # add a couple of messages
    global_notifications.append('foo')
    global_notifications.append('bar')
    with app.test_client() as client, app.app_context():
        app.config['LOGIN_DISABLED'] = True
        resp = client.get('/api/global_notifications')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get('msgs') == ['foo', 'bar']
        # second call should return empty list
        resp2 = client.get('/api/global_notifications')
        assert resp2.get_json().get('msgs') == []

def test_find_client_no_default():
    # helper should return None when a vat/name isn't found instead of
    # falling back to the first credential in the list.
    from app import _find_client

    creds = [{"vat": "111"}, {"vat": "222"}]
    assert _find_client(creds, vat="111") == creds[0]
    assert _find_client(creds, vat="999") is None


def test_append_summary_promotes_classification(tmp_path):
    # ensure no legacy flag influences summary logic
    os.environ.pop('LEGACY_FETCH_MODE', None)
    vat = "999111333"
    summary_path = get_customer_summary_file(vat)
    os.makedirs(os.path.dirname(summary_path), exist_ok=True)

    first = {"mark": "BBB222", "classification": ""}
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump([first], f, ensure_ascii=False)

    # duplicate insertion should be ignored
    assert append_summary_to_customer_file(first, vat) is False
    with open(summary_path, encoding="utf-8") as f:
        data = json.load(f)
    assert data == [first]

    # promotion to χαρακτηρισμενο
    second = {"mark": "BBB222", "classification": "χαρακτηρισμενο"}
    assert append_summary_to_customer_file(second, vat) is True
    with open(summary_path, encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 1
    assert data[0]["classification"] == "χαρακτηρισμενο"
    assert "updated_at" in data[0]

    # change other fields while classification stays the same
    third = {"mark": "BBB222", "classification": "χαρακτηρισμενο", "totalValue": "99"}
    assert append_summary_to_customer_file(third, vat) is True
    with open(summary_path, encoding="utf-8") as f:
        data = json.load(f)
    assert data[0]["totalValue"] == "99"
    assert "updated_at" in data[0]

    # receipts summaries should not merge
    r1 = {"mark": "RRR002", "classification": "", "is_receipt": True}
    assert append_summary_to_customer_file(r1, vat) is True
    r2 = {"mark": "RRR002", "classification": "χαρακτηρισμενο", "is_receipt": True}
    assert append_summary_to_customer_file(r2, vat) is True
    with open(summary_path, encoding="utf-8") as f:
        data = json.load(f)
    assert sum(1 for s in data if s.get("mark") == "RRR002") == 2

    _clean_file(summary_path)
