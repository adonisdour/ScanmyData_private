import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import app

with app.test_client() as c:
    # attempt API login for testuser1
    payload = {'username': 'testuser1', 'password': 'test123'}
    r = c.post('/api/login', json=payload)
    print('POST /api/login status=', r.status_code)
    try:
        print('json=', r.get_json())
    except Exception:
        print('data=', r.data[:200])
    # try web login form too
    r2 = c.post('/login', data={'username': 'testuser1', 'password': 'test123'}, follow_redirects=True)
    print('/login web form status:', r2.status)
    # check sync_progress
    r3 = c.get('/api/sync_progress')
    print('/api/sync_progress status=', r3.status_code)
    try:
        print('sync json=', r3.get_json())
    except Exception:
        print('sync data=', r3.data[:200])
