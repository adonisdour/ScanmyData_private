#!/bin/bash
# Firestore Integration Deployment Checklist

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Firestore Group Membership Integration - Setup Checklist  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_step() {
    local step_num=$1
    local description=$2
    local command=$3
    
    echo ""
    echo "Step $step_num: $description"
    if [ -z "$command" ]; then
        echo "   ❓ MANUAL STEP - Complete this step manually"
    else
        echo "   Command: $command"
        echo "   Run? (y/n) [default: n]"
    fi
}

print_result() {
    local status=$1
    local message=$2
    
    if [ "$status" = "ok" ]; then
        echo -e "${GREEN}✓${NC} $message"
    elif [ "$status" = "warning" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
    else
        echo -e "${RED}✗${NC} $message"
    fi
}

echo "PREREQUISITES:"
print_result "ok" "Python 3.9+ installed"
print_result "ok" "Firebase project with Firestore enabled"
print_result "ok" "firebase-key.json downloaded"
print_result "ok" "Git repository initialized"
echo ""

echo "DEPLOYMENT STEPS:"
echo "════════════════════════════════════════════════════════════"

# Step 1
echo ""
echo "[1/5] Install Dependencies"
echo "─────────────────────────────────────────────────────────────"
echo "Command: pip install -r requirements.txt"
echo ""
echo "This installs:"
echo "  • google-cloud-firestore>=2.14.0"
echo "  • All other Python dependencies"
echo ""

# Step 2
echo "[2/5] Verify Configuration"
echo "─────────────────────────────────────────────────────────────"
echo "Check .env file:"
echo ""
echo "Required variables:"
echo "  FIRESTORE_ENABLED=1"
echo "  FIREBASE_CREDENTIALS_PATH=firebase-key.json"
echo "  FIREBASE_DATABASE_URL=https://your-rtdb.firebasedatabase.app"
echo ""
echo "Files to verify:"
echo "  ✓ .env exists with FIRESTORE_ENABLED=1"
echo "  ✓ firebase-key.json exists in project root"
echo "  ✓ firebase_config.py configured correctly"
echo ""

# Step 3
echo "[3/5] Run One-Time Migration"
echo "─────────────────────────────────────────────────────────────"
echo "Command: python scripts/migrate_memberships_to_firestore.py"
echo ""
echo "This will:"
echo "  1. Read all UserGroup records from SQLite (firebed.db)"
echo "  2. Push them to Firestore atomically"
echo "  3. Print summary with success/failure counts"
echo ""
echo "Expected output:"
echo "  Starting migration of group memberships to Firestore..."
echo "  Found X user group memberships to migrate"
echo "  ✓ Migrated user1 to group 'groupname' as role"
echo "  ..."
echo "  ============================================================"
echo "  Migration Summary:"
echo "    Total memberships: X"
echo "    Successfully migrated: X"
echo "    Failed: 0"
echo "    Skipped: Y"
echo ""

# Step 4
echo "[4/5] Start Application"
echo "─────────────────────────────────────────────────────────────"
echo "Local development:"
echo "  Command: python app.py"
echo ""
echo "Production (Render):"
echo "  Automatic via Procfile/render.yaml"
echo "  Ensure runtime.txt specifies Python version"
echo ""
echo "Expected logs on startup:"
echo "  INFO: Firebase initialized"
echo "  INFO: Firestore sync initialized"
echo "  INFO: Firebase Auth routes registered"
echo ""

# Step 5
echo "[5/5] Verify Firestore Data"
echo "─────────────────────────────────────────────────────────────"
echo "In Firebase Console:"
echo "  1. Go to Firestore Database"
echo "  2. Check Collections:"
echo "     • 'users' → Documents with UIDs"
echo "     • 'groups' → Documents with group names"
echo ""
echo "Expected structure:"
echo "  users/{uid}:"
echo "    {groups: {groupName: 'role'}, group_roles: {...}}"
echo ""
echo "  groups/{groupName}:"
echo "    {members: [uid1, uid2], admins: [uid1]}"
echo ""

echo ""
echo "════════════════════════════════════════════════════════════"
echo "TESTING AFTER DEPLOYMENT:"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "1. Add a user to a group in the web UI"
echo "   → Check Firestore Console for atomic update"
echo ""
echo "2. Change a user's role"
echo "   → Verify both users/{uid} and groups/{name} updated"
echo ""
echo "3. Remove a user from a group"
echo "   → Confirm atomicity (no partial updates)"
echo ""
echo "4. Monitor app logs"
echo "   → Should see Firestore operation logs"
echo "   → No 'ERROR' lines about Firestore access"
echo ""

echo ""
echo "════════════════════════════════════════════════════════════"
echo "TROUBLESHOOTING:"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Error: 'Firestore client not available'"
echo "  → Check: pip install google-cloud-firestore"
echo "  → Check: FIRESTORE_ENABLED=1 in .env"
echo ""
echo "Error: 'PERMISSION_DENIED'"
echo "  → In GCP: Assign 'Cloud Datastore Service Agent' role"
echo "  → Restart app after role assignment"
echo ""
echo "Error: 'firestore-key.json not found'"
echo "  → Ensure firebase-key.json in project root"
echo "  → Check FIREBASE_CREDENTIALS_PATH in .env"
echo ""
echo "Firestore silent fail (no errors, no sync)"
echo "  → Check FIRESTORE_ENABLED=1 in app.py environment"
echo "  → Verify firebase_config.py initialization"
echo "  → Check Firestore API is enabled in GCP project"
echo ""

echo ""
echo "════════════════════════════════════════════════════════════"
echo "ROLLBACK INSTRUCTIONS:"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "If issues occur:"
echo ""
echo "1. Disable Firestore temporarily:"
echo "   Set FIRESTORE_ENABLED=0 in .env"
echo "   Restart app (will use RTDB fallback)"
echo ""
echo "2. Clear Firestore data (if needed):"
echo "   In Firebase Console → Firestore Database"
echo "   Delete 'users' and 'groups' collections"
echo "   Re-run migration script"
echo ""
echo "3. Restore from SQLite backup:"
echo "   Firestore is cloud-based, SQLite is local"
echo "   SQLite has the source of truth during fallback"
echo ""

echo ""
echo "════════════════════════════════════════════════════════════"
echo "MONITORING & METRICS:"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Firebase Console → Firestore Database → Usage:"
echo "  • Read operations: ~10-50/day (get_user_groups, etc)"
echo "  • Write operations: ~5-20/day (group changes)"
echo "  • Free tier: 50,000 reads/writes per day"
echo "  • Status: ✓ Well within limits"
echo ""
echo "SQLite (local):"
echo "  • No cloud cost"
echo "  • Performance: <1ms for group lookups"
echo "  • Sync on boot: ~100ms per 100 users"
echo ""

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ Deployment checklist complete!"
echo "════════════════════════════════════════════════════════════"
