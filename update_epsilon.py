#!/usr/bin/env python3
"""
Script: Update existing epsilon entries with book_category and is_receipt
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, '/workspaces/ScanmyData_private')

from app import app

def update_epsilon_entries():
    """Update epsilon entries to include book_category and is_receipt"""
    
    with app.app_context():
        from app import get_cred_by_vat
        
        print("\n" + "="*70)
        print("UPDATE: Epsilon Entries with book_category and is_receipt")
        print("="*70 + "\n")
        
        vat = "802576637"
        epsilon_file = Path(f"data/tony/epsilon/{vat}_epsilon_invoices.json")
        
        if not epsilon_file.exists():
            print(f"ERROR: File not found: {epsilon_file}")
            return False
        
        # Load current entries
        with open(epsilon_file) as f:
            entries = json.load(f)
        
        print(f"Found {len(entries)} entries\n")
        
        # Get credential to determine book_category
        cred = get_cred_by_vat(vat)
        book_category = cred.get("book_category", "").upper() if cred else ""
        
        # Update entries
        updated_count = 0
        for entry in entries:
            # Add book_category if missing or empty
            if not entry.get("book_category"):
                entry["book_category"] = "G" if book_category == "G" else ""
                updated_count += 1
            
            # Determine if receipt (simplified: αποδειξακια in characteristic or category)
            if "is_receipt" not in entry:
                category = str(entry.get("category", "")).lower()
                characteristic = str(entry.get("characteristic", "")).lower()
                is_receipt = "αποδειξακια" in category or "αποδειξακια" in characteristic
                entry["is_receipt"] = is_receipt
        
        # Save updated entries
        with open(epsilon_file, 'w') as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
        
        print(f"Updated {updated_count} entries")
        
        # Check updated entries
        print(f"\nUpdated entries:")
        for i, entry in enumerate(entries[-3:], start=max(1, len(entries)-2)):
            mark = entry.get('mark')
            mtype = entry.get('mtype')
            mtype_label = entry.get('mtype_label', '')
            book_cat = entry.get('book_category', '')
            
            print(f"\n  Entry {i}: MARK={mark}")
            print(f"    mtype: {mtype} ({mtype_label})")
            print(f"    book_category: '{book_cat}'")
            print(f"    is_receipt: {entry.get('is_receipt', '?')}")
            
            # Check if mirror should be created
            if book_cat == "G" and "αγορών" in mtype_label.lower() and "ταμει" in mtype_label.lower():
                print(f"    ✓ This SHOULD trigger mirror entry creation")
        
        print("\n" + "="*70)
        print("UPDATE COMPLETE")
        print("="*70 + "\n")
        
        return True

if __name__ == "__main__":
    update_epsilon_entries()
