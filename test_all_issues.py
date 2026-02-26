#!/usr/bin/env python3
"""
Test: Check all issues from bridge preview
"""
import sys
from pathlib import Path

sys.path.insert(0, '/workspaces/ScanmyData_private')

from app import app

def test_all_issues():
    """Check what all issues are reported"""
    
    with app.app_context():
        from epsilon_bridge_g_category import build_preview_rows_for_ui_g
        
        vat = "802576637"
        settings_file = Path("data/tony/credentials_settings.json")
        cred_file = Path("data/tony/credentials.json")
        
        rows, issues, ok = build_preview_rows_for_ui_g(
            vat=vat,
            credentials_json=str(cred_file),
            cred_settings_json=str(settings_file),
            invoices_json=None,
            client_db=None,
            base_invoices_dir=str(Path("data/tony/epsilon").parent),
        )
        
        print("\n" + "="*70)
        print("ALL ISSUES FROM BRIDGE")
        print("="*70 + "\n")
        
        print(f"Total issues: {len(issues)}\n")
        
        for issue in issues:
            code = issue.get('code', '?')
            msg = issue.get('message', '?')
            print(f"- {code}")
            print(f"  {msg}\n")
        
        print("\n" + "="*70)
        print(f"RESULT: {len(rows)} rows generated, {len(issues)} issues")
        print("="*70 + "\n")

if __name__ == "__main__":
    test_all_issues()
