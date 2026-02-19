#!/usr/bin/env python3
"""
Script: Create mirror entries for existing epsilon entries that need them
"""
import sys
import json
from pathlib import Path
from copy import deepcopy

sys.path.insert(0, '/workspaces/ScanmyData_private')

from app import app

def create_mirrors_for_existing():
    """Create mirror entries for existing epsilon entries that qualify"""
    
    with app.app_context():
        from app import load_settings
        
        print("\n" + "="*70)
        print("CREATE: Mirror Entries for Qualifying Existing Entries")
        print("="*70 + "\n")
        
        vat = "802576637"
        epsilon_file = Path(f"data/tony/epsilon/{vat}_epsilon_invoices.json")
        
        if not epsilon_file.exists():
            print(f"ERROR: File not found: {epsilon_file}")
            return False
        
        # Load entries
        with open(epsilon_file) as f:
            entries = json.load(f)
        
        print(f"Current entries: {len(entries)}\n")
        
        # Load settings
        settings = load_settings() or {}
        tameiaki_mtype = settings.get("article_movement_type_tameiaki", "14")
        cash_account = settings.get("account_g_cash", "").strip()
        supplier_account = settings.get("account_g_supplier_wholesale", "").strip()
        
        print(f"Settings:")
        print(f"  tameiaki_mtype: {tameiaki_mtype}")
        print(f"  cash_account: {cash_account}")
        print(f"  supplier_account: {supplier_account}\n")
        
        # Find qualifying entries and create mirrors
        mirrors_created = 0
        entries_to_add = []
        
        for entry in entries:
            book_category = str(entry.get("book_category", "")).upper()
            mtype_label = str(entry.get("mtype_label", "")).lower()
            
            # Check if this entry needs a mirror
            is_agoron_exodon_tameiaki = "αγορών" in mtype_label and "ταμει" in mtype_label
            
            if book_category == "G" and is_agoron_exodon_tameiaki:
                # Check if mirror already exists for this mark
                mark = entry.get("mark")
                has_mirror = any(
                    e.get("_auto_cash_payment") and e.get("mark") == mark 
                    for e in entries
                )
                
                if not has_mirror and tameiaki_mtype and cash_account and supplier_account:
                    print(f"Creating mirror for MARK={mark}...")
                    
                    # Create mirror entry
                    mirror_entry = deepcopy(entry)
                    mirror_entry["mtype"] = tameiaki_mtype
                    mirror_entry["mtype_label"] = "Ταμειακή"
                    mirror_entry["_auto_cash_payment"] = True
                    
                    # Two lines: supplier debit + cash credit
                    total_value = str(entry.get("totalValue", "0"))
                    mirror_entry["lines"] = [
                        {
                            "id": "mirror_debit",
                            "description": "Χρέωση - Προμηθευτής χονδρικής (auto)",
                            "amount": total_value,
                            "vat": "0",
                            "category": "προμηθευτής_χονδρικής",
                            "vat_category": ""
                        },
                        {
                            "id": "mirror_credit",
                            "description": "Πίστωση - Ταμείο (auto)",
                            "amount": total_value,
                            "vat": "0",
                            "category": "ταμείο",
                            "vat_category": ""
                        }
                    ]
                    
                    entries_to_add.append(mirror_entry)
                    mirrors_created += 1
                    print(f"  ✓ Mirror created (lines: {len(mirror_entry['lines'])})")
        
        # Add new mirrors to entries
        entries.extend(entries_to_add)
        
        # Save updated entries
        with open(epsilon_file, 'w') as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
        
        print(f"\n{mirrors_created} mirror entries created")
        print(f"Total entries now: {len(entries)}")
        
        # Show last entries
        print(f"\nLast 3 entries:")
        for i, entry in enumerate(entries[-3:], start=max(1, len(entries)-2)):
            mark = entry.get('mark')
            mtype = entry.get('mtype')
            auto_cash = entry.get('_auto_cash_payment', False)
            marker = " [MIRROR]" if auto_cash else ""
            print(f"  {i}. MARK={mark}, mtype={mtype}{marker}")
        
        print("\n" + "="*70)
        print("COMPLETE")
        print("="*70 + "\n")
        
        return mirrors_created > 0

if __name__ == "__main__":
    create_mirrors_for_existing()
