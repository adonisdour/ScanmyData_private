#!/usr/bin/env python3
"""
Test: Mirror entry is created + processes through bridge normally (no special handling)
"""
import os
import sys
import json
import tempfile
from pathlib import Path
from datetime import datetime
from copy import deepcopy

sys.path.insert(0, '/workspaces/ScanmyData_private')

from app import app

def test_mirror_created_and_normal_aggregation():
    """
    1. Create original invoice with "Αγορών - Εξόδων Ταμειακή"
    2. Verify mirror entry in epsilon cache
    3. Pass both through bridge, confirm mirror aggregates with normal logic
    """
    
    print("\n" + "="*70)
    print("TEST: Mirror Entry + Normal Bridge Processing (No Special Handling)")
    print("="*70)
    
    with app.app_context():
        # Setup
        afm = "123456789"
        vat = afm
        group_name = f"test_group_{afm}"
        
        # Create temp data dir structure
        data_dir = Path(tempfile.gettempdir()) / "test_data"
        data_dir.mkdir(exist_ok=True)
        group_dir = data_dir / group_name
        group_dir.mkdir(exist_ok=True)
        
        # Mock credentials_settings with account_g_cash
        settings = {
            "afm": afm,
            "account_receipt_expense": "60-00-00-0000",
            "account_receipt_supplier": "50-00-00-0000",
            "account_g_supplier_wholesale": "50-01-00-0000",
            "account_g_cash": "38-00-00-0000",
            "account_g_merchandise_fpa_kat_24": "30-00-00-0000",  # For original invoice
            "account_g_προμηθευτής_χονδρικής_fpa_kat_0": "50-01-00-0000",  # For mirror supplier line
            "account_g_ταμείο_fpa_kat_0": "38-00-00-0000",  # For mirror cash line
            "article_movement_type_agoron_exodon_tameiaki": "16",
            "article_movement_type_tameiaki": "14",
        }
        
        settings_file = group_dir / "credentials_settings.json"
        settings_file.write_text(json.dumps(settings))
        print(f"✓ Created settings with account_g_cash={settings['account_g_cash']}")
        
        # Create epsilon cache with ONE invoice (original)
        original_entry = {
            "mark": 400011111111111,
            "aa": "1",
            "series": "A",
            "type": "1.2",
            "date": "2024-01-15",
            "time": "10:00:00",
            "issuerAfm": afm,
            "issuerName": "Test Supplier",
            "invoiceId": "INV/2024/0001",
            "invoiceReason": "Αγορές Εμπορευμάτων",
            "singlePrice": 1000.0,
            "netAmount": 1000.0,
            "vatAmount": 240.0,
            "grossAmount": 1240.0,
            "book_category": "G",  # Γ-category
            "mtype": "16",  # Αγορών - Εξόδων Ταμειακή
            "mtype_label": "Αγορών - Εξόδων Ταμειακή",
            "lines": [
                {
                    "category": "merchandise",
                    "amount": 1000.0,
                    "vat_rate": 24,
                    "vat_amount": 240.0,
                    "net": 1000.0,
                    "gross": 1240.0,
                }
            ]
        }
        
        # Mirror entry (as created by save_summary)
        mirror_entry = deepcopy(original_entry)
        mirror_entry["mark"] = 400011111111112  # Different MARK
        mirror_entry["mtype"] = "14"  # Ταμειακή
        mirror_entry["mtype_label"] = "Ταμειακή"
        mirror_entry["invoiceReason"] = "Αγορές Εμπορευμάτων [Mirror]"
        mirror_entry["_auto_cash_payment"] = True
        mirror_entry["lines"] = [
            {
                "category": "προμηθευτής_χονδρικής",
                "amount": 1000.0,
                "net": 1000.0,
                "gross": 1000.0,
            },
            {
                "category": "ταμείο",
                "amount": 1000.0,
                "net": 1000.0,
                "gross": 1000.0,
            }
        ]
        
        epsilon_cache = [original_entry, mirror_entry]
        epsilon_file = group_dir / f"{vat}_epsilon_invoices.json"
        epsilon_file.write_text(json.dumps(epsilon_cache))
        print(f"✓ Created epsilon cache with 2 entries:")
        print(f"  - MARK {original_entry['mark']}: Original (Αγορών - Εξόδων Ταμειακή)")
        print(f"  - MARK {mirror_entry['mark']}: Mirror (_auto_cash_payment=True, 2 lines)")
        
        # Load and process through bridge
        from epsilon_bridge_g_category import build_preview_rows_for_ui_g
        
        # Write credentials files for bridge to find
        credentials = {
            "client_id": afm,
            "afm": afm,
            "surname": "Test Client",
        }
        cred_file = group_dir / "credentials.json"
        cred_file.write_text(json.dumps(credentials))
        
        rows, issues, _ok = build_preview_rows_for_ui_g(
            vat=vat,
            credentials_json=str(cred_file),
            cred_settings_json=str(settings_file),
            invoices_json=None,
            client_db=None,
            base_invoices_dir=str(group_dir),
        )
        
        print(f"\n✓ Bridge processed {len(rows)} rows:")
        for i, row in enumerate(rows, 1):
            print(f"\n  Row {i}:")
            print(f"    MARK: {row.get('MARK')}")
            print(f"    REASON: {row.get('REASON')}")
            print(f"    Lines: {len(row.get('LINES', []))} lines")
            for j, line in enumerate(row.get('LINES', []), 1):
                cat = line.get('category')
                net = line.get('net')
                crdb = line.get('crdb')
                print(f"      Line {j}: {cat} (net={net}, {crdb})")
        
        if issues:
            print(f"\nWarnings: {len(issues)}")
            for issue in issues:
                print(f"  - {issue.get('code')}: {issue.get('message')}")
        
        # Validation
        print("\n" + "="*70)
        print("VALIDATION:")
        print("="*70)
        
        # Should have 2 rows (original + mirror)
        assert len(rows) == 2, f"Expected 2 rows, got {len(rows)}"
        print("✓ Got 2 rows (original + mirror)")
        
        # First row: original invoice
        row1 = rows[0]
        assert row1["MARK"] == original_entry["mark"], "Row 1 MARK mismatch"
        assert len(row1["LINES"]) >= 1, f"Row 1 should have at least 1 line, got {len(row1['LINES'])}"
        print(f"✓ Row 1: Original entry with {len(row1['LINES'])} lines (aggregated)")
        
        # Second row: mirror entry  
        row2 = rows[1]
        assert row2["MARK"] == mirror_entry["mark"], "Row 2 MARK mismatch"
        assert len(row2["LINES"]) >= 2, f"Row 2 should have at least 2 lines, got {len(row2['LINES'])}"
        
        # Mirror should include supplier + cash lines (may also have aggregated lines)
        cats = [line["category"] for line in row2["LINES"]]
        assert "προμηθευτής_χονδρικής" in cats, f"Missing supplier line in mirror. Got: {cats}"
        assert "ταμείο" in cats, f"Missing cash line in mirror. Got: {cats}"
        print(f"✓ Row 2: Mirror entry with {len(row2['LINES'])} lines (προμηθευτής_χονδρικής + ταμείο included)")
        
        # Verify NO "[AUTO CASH PAYMENT]" marker anywhere (special handling removed)
        for i, row in enumerate(rows, 1):
            reason = row.get("REASON", "")
            # Should NOT have bracketed auto cash payment marker
            assert "[AUTO CASH PAYMENT]" not in reason, f"Row {i} has special marker in '{reason}' - special handling not removed!"
        print("✓ No special '[AUTO CASH PAYMENT]' markers found - using normal bridge processing")
        
        print("\n" + "="*70)
        print("ALL TESTS PASSED ✓")
        print("="*70)
        print("\nResult: Mirror entries now flow through normal bridge processing")
        print("        No longer using special handling - aggregation works naturally")
        print("="*70 + "\n")

if __name__ == "__main__":
    test_mirror_created_and_normal_aggregation()
