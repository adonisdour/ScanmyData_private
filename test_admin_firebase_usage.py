import os
from app import app, api_admin_firebase_usage
import admin_panel


def test_api_admin_firebase_usage_parses_activity_log(tmp_path, monkeypatch):
    # Prepare a temporary activity.log with firebase.read entries
    # create data directory and log file inside it
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    test_log = data_dir / "activity.log"
    lines = [
        "2026-02-20 12:00:00+00:00 INFO firebase.read path=/groups size=123\n",
        "2026-02-20 12:45:30+00:00 INFO firebase.read path=/groups size=77\n",
        "2026-02-20 13:10:05+00:00 INFO firebase.read path=/users size=200\n",
    ]
    test_log.write_text(''.join(lines))

    # Point the app's cwd data path to our tmp path by monkeypatching os.getcwd
    monkeypatch.chdir(tmp_path)

    # Ensure admin check passes (we call the wrapped function to skip login_required)
    monkeypatch.setattr(admin_panel, 'is_admin', lambda u: True)

    with app.test_request_context('/api/admin/firebase-usage'):
        resp = api_admin_firebase_usage.__wrapped__()
        # resp may be a Flask response object or a tuple
        if hasattr(resp, 'get_json'):
            data = resp.get_json()
        else:
            data = resp[0].get_json() if isinstance(resp, tuple) else None

    assert data is not None
    assert data.get('success') is True
    # Should have entries for two distinct hour buckets
    ts_list = [p['ts'] for p in data['data']]
    bytes_list = [p['bytes'] for p in data['data']]
    assert '2026-02-20 12:00' in ts_list
    assert '2026-02-20 13:00' in ts_list
    assert sum(bytes_list) == 123 + 77 + 200
