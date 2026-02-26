#!/usr/bin/env python3
import json
from pathlib import Path
import re

# Load settings
settings = json.loads(Path('data/tony/credentials_settings.json').read_text(encoding='utf-8'))

# Simulate what _category_vat_constraints does
settings_accounts = {}
for key, val in settings.items():
    if not key.startswith('account_'):
        continue
    k = key[len('account_'):]
    if k.startswith('g_'):
        k = k[2:]
    m = re.match(r'(?P<tag>.+?)_fpa_kat_(?P<rate>\d+)%$', k)
    if not m:
        continue
    tag = m.group('tag')
    rate = m.group('rate')
    code = str(val).strip()
    if not code:
        continue
    settings_accounts.setdefault(rate, {})[tag] = code

# Check what rates have δαπανες_χωρις_φπα
print("For 'δαπανες_χωρις_φπα':")
allowed_rates = []
for rate in ['0', '6', '13', '17', '24']:
    if rate in settings_accounts and 'δαπανες_χωρις_φπα' in settings_accounts[rate]:
        allowed_rates.append(f"{rate}%")
        print(f"  {rate}%: YES (allowed)")
    else:
        print(f"  {rate}%: NO (not allowed)")

print(f"\nSo VAT_CONSTRAINTS should have:")
print(f"  'δαπανες_χωρις_φπα': {allowed_rates}")
