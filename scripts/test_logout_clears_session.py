import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import app
from models import db
import sqlite3

DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'firebed.db')

with app.test_client() as c:
    # login via API
    r = c.post('/api/login', json={'username': 'testuser1', 'password': 'test123'})
    print('api login status', r.status_code, r.get_json())
    # inspect Flask session stored on client
    with c.session_transaction() as sess:
        print('client session before logout:', {k: sess.get(k) for k in ('session_id','active_group','_last_heartbeat_ts')})
    # call logout (web logout route)
    r2 = c.get('/logout', follow_redirects=True)
    print('GET /logout status', r2.status_code)
    with c.session_transaction() as sess:
        print('client session after logout:', {k: sess.get(k) for k in ('session_id','active_group','_last_heartbeat_ts')})

# inspect DB
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()
cur.execute("SELECT id, username, current_session_id, session_started_at, last_active_at, total_active_seconds FROM user WHERE username='testuser1'")
row = cur.fetchone()
print('DB row after logout:', dict(row) if row else None)
con.close()
