import os, time, tempfile
import firebase_config

def test_smart_sync_skips_non_epsilon_excel(tmp_path, monkeypatch):
    # create a fake group folder with files in root, epsilon/, excel/
    group = 'testgroup'
    data_root = tmp_path
    grp_dir = data_root / group
    grp_dir.mkdir()
    (grp_dir / 'foo.txt').write_text('hello')
    (grp_dir / 'epsilon').mkdir()
    (grp_dir / 'epsilon' / 'note.txt').write_text('x')
    (grp_dir / 'excel').mkdir()
    (grp_dir / 'excel' / 'sheet.xlsx').write_bytes(b'123')
    now = time.time()
    os.utime(grp_dir / 'foo.txt', (now, now))
    os.utime(grp_dir / 'epsilon' / 'note.txt', (now, now))
    os.utime(grp_dir / 'excel' / 'sheet.xlsx', (now, now))

    # patch firebase_read_data_compressed to return existing remote metadata
    def fake_read(path):
        return {
            'foo_txt': {'content': '', '_meta': {'mtime': now, 'size': 5}},
            'epsilon': {'note_txt': {'content': '', '_meta': {'mtime': now, 'size': 1}}},
            'excel': {'sheet_xlsx': {'content': '', '_meta': {'mtime': now, 'size': 3}}},
        }
    monkeypatch.setattr(firebase_config, 'firebase_read_data_compressed', fake_read)
    monkeypatch.setattr(firebase_config, 'firebase_write_data', lambda *args, **kwargs: True)
    monkeypatch.setattr(firebase_config, 'is_firebase_enabled', lambda: True)

    monkeypatch.setenv('FIREBASE_SMART_SYNC', '1')
    result = firebase_config.firebase_push_group_files(group, local_data_root=str(data_root), dry_run=True, verbose=False)
    assert isinstance(result, dict), "expected dict from dry_run"
    upload = result.get('upload_candidates', [])
    # only epsilon and excel keys should be uploaded since foo.txt is unchanged and smart sync enabled
    assert any(k.startswith('epsilon/') for k in upload), upload
    assert any(k.startswith('excel/') for k in upload), upload
    assert not any(k == 'foo_txt' for k in upload)


def test_pull_smart_excludes_epsilon_excel(tmp_path, monkeypatch):
    # prepare remote export data
    now = time.time()
    # minimal base64 for content
    import base64
    fake_blob = base64.urlsafe_b64encode(b'data').decode('utf-8')
    remote = {
        'foo_txt': {'content': fake_blob, '_meta': {'mtime': now, 'size': 4}},
        'epsilon': {'note_txt': {'content': fake_blob, '_meta': {'mtime': now, 'size': 1}}},
        'excel': {'sheet_xlsx': {'content': fake_blob, '_meta': {'mtime': now, 'size': 3}}},
    }
    monkeypatch.setattr(firebase_config, 'firebase_read_data_compressed', lambda path: remote)
    monkeypatch.setattr(firebase_config, 'is_firebase_enabled', lambda: True)
    monkeypatch.setattr(firebase_config, 'firebase_log_activity', lambda *args, **kwargs: True)

    group = 'testgroup'
    data_root = tmp_path
    grp_dir = data_root / group
    grp_dir.mkdir()
    # create existing files with same mtime
    foo = grp_dir / 'foo.txt'
    foo.write_text('old')
    eps_dir = grp_dir / 'epsilon'
    eps_dir.mkdir()
    eps_file = eps_dir / 'note.txt'
    eps_file.write_text('old')
    ex_dir = grp_dir / 'excel'
    ex_dir.mkdir()
    ex_file = ex_dir / 'sheet.xlsx'
    ex_file.write_text('old')
    # set mtimes
    os.utime(foo, (now, now))
    os.utime(eps_file, (now, now))
    os.utime(ex_file, (now, now))

    # capture log output to verify skipping
    import logging
    logger = logging.getLogger('firebase_config')
    logger.setLevel(logging.DEBUG)
    records = []
    class ListHandler(logging.Handler):
        def emit(self, record):
            records.append(record.getMessage())
    handler = ListHandler()
    handler.setLevel(logging.DEBUG)
    logger.addHandler(handler)

    monkeypatch.setenv('FIREBASE_SMART_SYNC', '1')
    # perform pull
    success = firebase_config.firebase_pull_group_to_local(group, local_data_root=str(data_root))
    assert success
    # foo should have been skipped (no log about pulling foo.txt)
    skip_msgs = [m for m in records if 'Skipping unchanged file' in m]
    assert any('foo.txt' in m for m in skip_msgs)
    # epsilon and excel should not be skipped
    assert not any('epsilon' in m for m in skip_msgs)
    assert not any('excel' in m for m in skip_msgs)
    logger.removeHandler(handler)
