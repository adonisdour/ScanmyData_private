#!/usr/bin/env python3
"""Add session/presence columns to the `user` table if missing.

Usage:
  python scripts\add_user_session_columns.py

It reads the `DATABASE_URL` env var if present; otherwise it uses the
default sqlite DB at the project root (`firebed.db`). The script will
inspect the `user` table and run `ALTER TABLE` statements only for
columns that are not already present.
"""
import os
import sys
from sqlalchemy import create_engine, inspect, text


def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    default_sqlite = 'sqlite:///' + os.path.join(base_dir, 'firebed.db')
    db_url = os.getenv('DATABASE_URL') or default_sqlite

    print('Using DB URL:', db_url)
    engine = create_engine(db_url)
    insp = inspect(engine)

    if 'user' not in insp.get_table_names():
        print('ERROR: table `user` not present in database. Aborting.')
        sys.exit(1)

    cols = [c['name'] for c in insp.get_columns('user')]
    needed = []
    if 'current_session_id' not in cols:
        needed.append("ALTER TABLE user ADD COLUMN current_session_id VARCHAR(128)")
    if 'session_started_at' not in cols:
        needed.append("ALTER TABLE user ADD COLUMN session_started_at TIMESTAMP")
    if 'last_active_at' not in cols:
        needed.append("ALTER TABLE user ADD COLUMN last_active_at TIMESTAMP")
    if 'total_active_seconds' not in cols:
        needed.append("ALTER TABLE user ADD COLUMN total_active_seconds INTEGER DEFAULT 0")

    if not needed:
        print('No schema changes required. All columns present.')
        return 0

    with engine.begin() as conn:
        for sql in needed:
            print('Executing:', sql)
            conn.execute(text(sql))

    print('Schema update complete.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
