import sqlite3, os
from datetime import datetime
base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
db_path = os.getenv('DATABASE_URL') or ('sqlite:///' + os.path.join(base, 'firebed.db'))
if db_path.startswith('sqlite:///'):
    db_path = db_path.replace('sqlite:///', '')
con = sqlite3.connect(db_path)
con.row_factory = sqlite3.Row
cur = con.cursor()
cur.execute("SELECT id, username, email, current_session_id, session_started_at, last_active_at, total_active_seconds FROM user ORDER BY id")
rows = cur.fetchall()
print('DB:', db_path)
for r in rows:
    print('id=', r['id'], 'username=', r['username'], 'current_session_id=', r['current_session_id'], 'session_started_at=', r['session_started_at'], 'last_active_at=', r['last_active_at'], 'total_active_seconds=', r['total_active_seconds'])
con.close()
