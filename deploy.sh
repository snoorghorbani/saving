#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
#  deploy.sh — Deploy WealthWise to Firebase Hosting
#  Domain: saving.soushians.com
# ──────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

# ── Pre-flight checks ────────────────────────────────────────

command -v node  >/dev/null 2>&1 || err "Node.js is required. Install from https://nodejs.org"
command -v npm   >/dev/null 2>&1 || err "npm is required."

if [ ! -f ".env.local" ]; then
  err ".env.local not found. Copy .env.local.example to .env.local and fill in your keys."
fi

# ── Install Firebase CLI if missing ──────────────────────────

if ! command -v firebase >/dev/null 2>&1; then
  log "Installing Firebase CLI..."
  npm install -g firebase-tools
fi

# ── Static export — no Cloud Functions needed ────────────────

# ── Authenticate (interactive — opens browser) ───────────────

if ! firebase projects:list >/dev/null 2>&1; then
  log "Logging in to Firebase..."
  firebase login
fi

# ── Ensure Firebase project is set ────────────────────────────

PROJECT_ID="soushians-4d02a"
firebase use "$PROJECT_ID" --non-interactive 2>/dev/null || firebase use --add "$PROJECT_ID"
log "Using Firebase project: $PROJECT_ID"

# ── Install dependencies ─────────────────────────────────────

log "Installing dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install

log "Installing Cloud Functions dependencies..."
(cd functions && npm install)

# ── Deploy Firestore rules ───────────────────────────────────

log "Deploying Firestore security rules..."
firebase deploy --only firestore:rules

# ── Build & deploy the Next.js app ───────────────────────────

log "Building Next.js static export..."
npm run build

log "Deploying to Firebase Hosting..."
firebase deploy --only hosting

log "Deploying Cloud Functions..."
firebase deploy --only functions

echo ""
log "Deployment complete!"
echo ""
echo "──────────────────────────────────────────────────────────"
echo ""
echo "  Custom domain setup (saving.soushians.com):"
echo ""
echo "    1. Open https://console.firebase.google.com"
echo "       → Your project → Hosting → Add custom domain"
echo ""
echo "    2. Enter:  saving.soushians.com"
echo ""
echo "    3. Firebase will give you DNS records (A / TXT)."
echo "       Add them in your domain registrar's DNS settings."
echo ""
echo "    4. Wait for DNS propagation (up to 24 h) and SSL"
echo "       provisioning (automatic via Firebase)."
echo ""
echo "──────────────────────────────────────────────────────────"
echo ""
echo "  Firebase Auth setup:"
echo ""
echo "    • Go to Firebase Console → Authentication → Sign-in method"
echo "    • Enable Google as a sign-in provider"
echo "    • Firestore rules already enforce per-user access"
echo ""
echo "──────────────────────────────────────────────────────────"
