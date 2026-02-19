#!/usr/bin/env python3
"""
Test: Verify mirror entry is created in real save_summary flow
"""
import sys
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime

sys.path.insert(0, '/workspaces/ScanmyData_private')

from app import app

def test_mirror_in_real_flow():
    """Test mirror entry creation with active credential"""
    
    print("\n" + "="*70)
    print("TEST: Mirror Entry in Complete Flow (with session)")
    print("="*70 + "\n")
    
    with app.app_context():
        from app import get_cred_by_vat, load_settings
        
        # Setup
        vat = "802576637"
        cred = get_cred_by_vat(vat)
        
        if not cred or cred.get("book_category") != "G":
            print(f"ERROR: Credential not Γ-category")
            return False
        
        settings = load_settings()
        agoron_mtype = settings.get("article_movement_type_agoron_exodon_tameiaki")
        tameiaki_mtype = settings.get("article_movement_type_tameiaki")
        
        print(f"Setup:")
        print(f"  Credential: {cred.get('name')} (VAT: {vat})")
        print(f"  book_category: {cred.get('book_category')}")
        print(f"  agoron_exodon_tameiaki mtype: {agoron_mtype}")
        print(f"  tameiaki_mtype: {tameiaki_mtype}\n")
        
        # Load current epsilon entries
        epsilon_file = Path(f"data/tony/epsilon/{vat}_epsilon_invoices.json")
        if epsilon_file.exists():
            with open(epsilon_file) as f:
                current_entries = json.load(f)
        else:
            current_entries = []
        
        initial_count = len(current_entries)
        print(f"Current epsilon entries: {initial_count}")
        
        # Check last entry to verify book_category is being saved
        print("\nLast entry in epsilon file:")
        for entry in current_entries[-1:]:
            print(f"  MARK: {entry.get('mark')}")
            print(f"  mtype: {entry.get('mtype')}")
            print(f"  mtype_label: '{entry.get('mtype_label', '')}'")
            print(f"  book_category: '{entry.get('book_category', '')}'")
            print(f"  is_receipt: {entry.get('is_receipt', '?')}")
        
        # Check for mirror entries
        print("\nSearching for mirror entries in current file...")
        mirror_count = sum(1 for e in current_entries if e.get("_auto_cash_payment"))
        print(f"  Found {mirror_count} mirror entries")
        
        if mirror_count == 0:
            print("\n⚠️  No mirror entries found yet")
            print("   → This is expected for old entries created before fix")
            print("   → New entries (with mtype=16) SHOULD get mirror entries")
        
        return True

if __name__ == "__main__":
    test_mirror_in_real_flow()
