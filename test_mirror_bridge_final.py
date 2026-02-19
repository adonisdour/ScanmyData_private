#!/usr/bin/env python3
"""
Test: Verify mirror entries process through bridge with correct accounts
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, '/workspaces/ScanmyData_private')

from app import app

def test_mirror_preview():
    """Test that mirror entries appear correctly in bridge preview"""
    
    with app.app_context():
        from epsilon_bridge_g_category import build_preview_rows_for_ui_g
        
        print("\n" + "="*70)
        print("TEST: Mirror Entries in Bridge Preview")
        print("="*70 + "\n")
        
        vat = "802576637"
        epsilon_file = Path(f"data/tony/epsilon/{vat}_epsilon_invoices.json")
        settings_file = Path("data/tony/credentials_settings.json")
        cred_file = Path("data/tony/credentials.json")
        
        if not epsilon_file.exists():
            print(f"ERROR: {epsilon_file} not found")
            return False
        
        # Check for mirror entries in epsilon file
        with open(epsilon_file) as f:
            entries = json.load(f)
        
        print(f"Epsilon file has {len(entries)} entries")
        
        mirror_entries = [e for e in entries if e.get("_auto_cash_payment")]
        print(f"Found {len(mirror_entries)} mirror entries\n")
        
        if len(mirror_entries) == 0:
            print("WARNING: No mirror entries found in epsilon file")
            return False
        
        # Process through bridge
        print("Processing through bridge...")
        rows, issues, ok = build_preview_rows_for_ui_g(
            vat=vat,
            credentials_json=str(cred_file),
            cred_settings_json=str(settings_file),
            invoices_json=None,
            client_db=None,
            base_invoices_dir=str(Path("data/tony/epsilon").parent),
        )
        
        print(f"\nBridge results:")
        print(f"  Rows: {len(rows)}")
        print(f"  Issues: {len(issues)}")
        
        # Check for issues with missing accounts
        account_issues = [i for i in issues if "missing_account_g" in i.get("code", "")]
        if account_issues:
            print(f"\n⚠️  {len(account_issues)} missing account issues:\n")
            for issue in account_issues[:3]:  # Show first 3
                print(f"  - {issue['message']}")
        else:
            print("\n✓ No missing account issues")
        
        # Show rows with mirror entries
        print(f"\nRows (showing entries with mtype=14 - Ταμειακή):")
        for i, row in enumerate(rows, 1):
            mtype = row.get("mtype")
            if mtype == "14":  # Ταμειακή
                mark = row.get("MARK")
                lines = len(row.get("LINES", []))
                print(f"  Row {i}: MARK={mark}, mtype={mtype}, lines={lines}")
                
                # Show line categories
                for j, line in enumerate(row.get("LINES", []), 1):
                    cat = line.get("category", "?")
                    lcode = line.get("lcode", "?")
                    print(f"    Line {j}: {cat} → {lcode}")
        
        print("\n" + "="*70)
        if account_issues:
            print("RESULT: ✗ Still missing accounts")
        else:
            print("RESULT: ✓ All accounts resolved correctly")
        print("="*70 + "\n")
        
        return len(account_issues) == 0

if __name__ == "__main__":
    test_mirror_preview()
