import sqlite3
import os

base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
db_path = os.getenv('DATABASE_URL') or ('sqlite:///' + os.path.join(base, 'firebed.db'))
if db_path.startswith('sqlite:///'):
    db_path = db_path.replace('sqlite:///', '')

print('DB path:', db_path)
if not os.path.exists(db_path):
    print('Database not found:', db_path)
    raise SystemExit(1)

con = sqlite3.connect(db_path)
cur = con.cursor()
# show how many rows had non-null session
cur.execute("SELECT COUNT(*) FROM user WHERE current_session_id IS NOT NULL")
before = cur.fetchone()[0]
print('Users with session before clear:', before)
cur.execute("UPDATE user SET current_session_id=NULL, session_started_at=NULL, last_active_at=NULL WHERE current_session_id IS NOT NULL")
con.commit()
cur.execute("SELECT COUNT(*) FROM user WHERE current_session_id IS NOT NULL")
after = cur.fetchone()[0]
print('Users with session after clear:', after)
con.close()
print('Done.')
