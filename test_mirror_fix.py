#!/usr/bin/env python3
"""
Test: Simulates save_summary with an invoice of mtype=16
to verify mirror entry is created with proper fields
"""
import sys
import json
from pathlib import Path
from copy import deepcopy

sys.path.insert(0, '/workspaces/ScanmyData_private')

from app import app

def test_mirror_in_save_summary():
    with app.app_context():
        from app import load_settings
        
        print("\n" + "="*70)
        print("TEST: Mirror Entry Creation (save_summary simulation)")
        print("="*70 + "\n")
        
        # Load settings
        settings = load_settings() or {}
        agoron_exodon_tameiaki_mtype = settings.get('article_movement_type_agoron_exodon_tameiaki')
        tameiaki_mtype = settings.get('article_movement_type_tameiaki')
        cash_account = settings.get('account_g_cash', "").strip()
        supplier_account = settings.get('account_g_supplier_wholesale', "").strip()
        
        print("Settings Summary:")
        print(f"  article_movement_type_agoron_exodon_tameiaki: {agoron_exodon_tameiaki_mtype}")
        print(f"  article_movement_type_tameiaki: {tameiaki_mtype}")
        print(f"  account_g_cash: {cash_account}")
        print(f"  account_g_supplier_wholesale: {supplier_account}")
        
        # Create mtype_code_to_label_map (exactly as in app.py save_summary)
        mtype_code_to_label_map = {
            settings.get("article_movement_type_agoron_exodon_tameiaki", ""): "Αγορών - Εξόδων Ταμειακή",
            settings.get("article_movement_type_tameiaki", ""): "Ταμειακή",
            settings.get("article_movement_type_agoron_exodon", ""): "Αγορών - Εξόδων",
            settings.get("article_movement_type_symsifistiki", ""): "Συμψήφιστική",
            settings.get("article_movement_type_agoron_exodon_opseos", ""): "Αγορών - Εξόδων Όψεως",
        }
        mtype_code_to_label_map = {k: v for k, v in mtype_code_to_label_map.items() if k}
        
        # Simulate incoming summary from form/POST
        summary = {
            "mark": "999999999999999",
            "mtype": agoron_exodon_tameiaki_mtype,  # This is "16"
            "issueDate": "2024-01-20",
            "series": "A",
            "type": "1.2",
            "AFM": "802576637",
            "totalNetValue": 1000.0,
            "totalVatAmount": 240.0,
            "totalValue": 1240.0,
            "lines": [
                {
                    "id": "line1",
                    "description": "Test Item",
                    "amount": 1000.0,
                    "vat": 240.0,
                    "category": "merchandise",
                    "vatCategory": "24%"
                }
            ]
        }
        
        print(f"\nIncoming Summary:")
        print(f"  mark: {summary['mark']}")
        print(f"  mtype: {summary['mtype']}")
        print(f"  totalValue: {summary['totalValue']}")
        
        # Simulate the epsilon_entry building
        mtype_code = summary.get("mtype", "") or ""
        mtype_label = mtype_code_to_label_map.get(str(mtype_code).strip(), "")
        
        print(f"\nResolved Label:")
        print(f"  mtype_code: {mtype_code}")
        print(f"  mtype_label: {mtype_label}")
        
        # Build epsilon entry
        epsilon_entry = {
            "mark": summary['mark'],
            "mtype": mtype_code,
            "mtype_label": mtype_label,
            "book_category": "G",
            "totalValue": summary['totalValue'],
            "lines": [
                {
                    "id": "line1",
                    "description": "Test Item",
                    "amount": 1000.0,
                    "vat": 240.0,
                    "category": "merchandise",
                    "vat_category": "24%"
                }
            ]
        }
        
        # Check mirror creation logic
        book_category = str(epsilon_entry.get("book_category") or "").upper()
        mtype_label_lower = str(epsilon_entry.get("mtype_label") or "").lower()
        
        is_agoron_exodon_tameiaki = "αγορών" in mtype_label_lower and "ταμει" in mtype_label_lower
        
        print(f"\nMirror Detection:")
        print(f"  book_category: {book_category}")
        print(f"  is_agoron_exodon_tameiaki: {is_agoron_exodon_tameiaki}")
        
        epsilon_cache = [epsilon_entry]
        
        if book_category == "G" and is_agoron_exodon_tameiaki and tameiaki_mtype and cash_account and supplier_account:
            print(f"  ✓ Creating mirror entry...")
            
            mirror_entry = deepcopy(epsilon_entry)
            mirror_entry["mtype"] = tameiaki_mtype
            mirror_entry["mtype_label"] = "Ταμειακή"
            mirror_entry["_auto_cash_payment"] = True
            mirror_entry["lines"] = [
                {
                    "id": "mirror_debit",
                    "description": "Χρέωση - Προμηθευτής χονδρικής (auto)",
                    "amount": str(epsilon_entry.get("totalValue") or "0"),
                    "vat": "0",
                    "category": "προμηθευτής_χονδρικής",
                    "vat_category": ""
                },
                {
                    "id": "mirror_credit",
                    "description": "Πίστωση - Ταμείο (auto)",
                    "amount": str(epsilon_entry.get("totalValue") or "0"),
                    "vat": "0",
                    "category": "ταμείο",
                    "vat_category": ""
                }
            ]
            
            epsilon_cache.append(mirror_entry)
        
        print(f"\nFinal Epsilon Cache ({len(epsilon_cache)} entries):")
        for i, entry in enumerate(epsilon_cache, 1):
            mark = entry.get("mark")
            mtype = entry.get("mtype")
            label = entry.get("mtype_label", "")
            auto_cash = entry.get("_auto_cash_payment", False)
            num_lines = len(entry.get("lines", []))
            marker = " [MIRROR]" if auto_cash else ""
            print(f"  Entry {i}: MARK={mark}, mtype={mtype} ({label}), lines={num_lines}{marker}")
        
        print("\n" + "="*70)
        print("RESULT: ✓ Mirror entry CREATED successfully" if len(epsilon_cache) == 2 else "RESULT: ✗ Mirror entry NOT created")
        print("="*70 + "\n")

if __name__ == "__main__":
    test_mirror_in_save_summary()
