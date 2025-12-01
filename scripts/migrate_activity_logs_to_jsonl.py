#!/usr/bin/env python3
"""Migration helper: convert legacy/malformed activity.log lines into normalized JSON Lines.

Usage:
  python scripts/migrate_activity_logs_to_jsonl.py [--group tony]

Will create `activity.log.jsonl` next to each `activity.log` processed (non-destructive).
"""
import os
import json
import re
import argparse
from pathlib import Path


def normalize_line(line: str, folder: str):
    line = line.strip()
    if not line:
        return None
    # Try JSON first
    try:
        obj = json.loads(line)
        if isinstance(obj, dict):
            if 'group' not in obj:
                obj['group'] = folder
            return obj
    except Exception:
        pass

    # Try TIMESTAMP - message pattern
    if ' - ' in line:
        parts = line.split(' - ', 1)
        ts = parts[0].strip()
        msg = parts[1].strip()
        # Bulk fetch pattern
        m = re.search(r'Bulk fetch performed:\s*(?P<d1>\d{2}/\d{2}/\d{4}) to (?P<d2>\d{2}/\d{2}/\d{4}), VAT (?P<vat>[^,]+), (?P<docs>\d+) docs \+ (?P<summaries>\d+) summaries by (?P<by>.+)$', msg)
        if m:
            return {
                'timestamp': ts,
                'group': folder,
                'action': 'ληψη παραστατικων',
                'details': {
                    'date_from': m.group('d1'),
                    'date_to': m.group('d2'),
                    'client_vat': m.group('vat'),
                    'added_docs': int(m.group('docs') or 0),
                    'added_summaries': int(m.group('summaries') or 0),
                    'by': m.group('by').strip()
                }
            }
        # Generic message
        return {'timestamp': ts, 'group': folder, 'action': 'log_message', 'details': {'message': msg}}

    # Try simple assign_user message like 'actor assigned target as role'
    m2 = re.search(r'(?P<actor>[^\s]+@[^\s]+) assigned (?P<target>[^\s]+@[^\s]+) as (?P<role>\w+)', line)
    if m2:
        return {
            'timestamp': '',
            'group': folder,
            'action': 'assign_user',
            'details': {
                'actor': m2.group('actor'),
                'target_user': m2.group('target'),
                'role': m2.group('role')
            }
        }

    # Last resort: raw message entry
    return {'timestamp': '', 'group': folder, 'action': 'log_message', 'details': {'message': line}}


def migrate_group_activity(group_folder: Path) -> int:
    src = group_folder / 'activity.log'
    dst = group_folder / 'activity.log.jsonl'
    if not src.exists():
        return 0
    count = 0
    with src.open('r', encoding='utf-8') as fh_in, dst.open('w', encoding='utf-8') as fh_out:
        for raw in fh_in:
            try:
                normalized = normalize_line(raw, group_folder.name)
                if not normalized:
                    continue
                # Ensure timestamp field exists
                if 'timestamp' not in normalized:
                    normalized['timestamp'] = normalized.get('details', {}).get('timestamp', '')
                # Dump compact JSON
                fh_out.write(json.dumps(normalized, ensure_ascii=False) + '\n')
                count += 1
            except Exception as e:
                # On failure, write raw fallback
                try:
                    fallback = {'timestamp': '', 'group': group_folder.name, 'action': 'log_message', 'details': {'message': raw.strip()}}
                    fh_out.write(json.dumps(fallback, ensure_ascii=False) + '\n')
                    count += 1
                except Exception:
                    continue
    return count


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--group', help='Process only this group folder (name)')
    args = p.parse_args()

    data_dir = Path(os.getcwd()) / 'data'
    if not data_dir.exists():
        print('No data directory found; run from project root')
        return

    groups = []
    for child in data_dir.iterdir():
        if not child.is_dir():
            continue
        if child.name.startswith('_'):
            continue
        if args.group and child.name != args.group:
            continue
        groups.append(child)

    total = 0
    for g in groups:
        c = migrate_group_activity(g)
        print(f'Processed {g.name}: {c} lines -> {g / "activity.log.jsonl"}')
        total += c

    print(f'Total lines processed: {total}')


if __name__ == '__main__':
    main()
