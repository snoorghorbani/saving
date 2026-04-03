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

# ── Enable web-frameworks experiment (needed for Next.js SSR) ─

log "Enabling Firebase web-frameworks experiment..."
firebase experiments:enable webframeworks 2>/dev/null || true

# ── Authenticate (interactive — opens browser) ───────────────

if ! firebase projects:list >/dev/null 2>&1; then
  log "Logging in to Firebase..."
  firebase login
fi

# ── Ensure a Firebase project is linked ──────────────────────

if [ ! -f ".firebaserc" ]; then
  warn "No Firebase project linked yet."
  echo ""
  echo "  1. Go to https://console.firebase.google.com and create a project"
  echo "     (or reuse an existing one)."
  echo "  2. Enable Firestore (Native mode) in the console."
  echo ""
  read -rp "Enter your Firebase project ID: " PROJECT_ID
  if [ -z "$PROJECT_ID" ]; then
    err "Project ID cannot be empty."
  fi
  firebase use --add "$PROJECT_ID"
fi

# ── Install dependencies ─────────────────────────────────────

log "Installing dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install

# ── Deploy Firestore rules ───────────────────────────────────

log "Deploying Firestore security rules..."
firebase deploy --only firestore:rules

# ── Build & deploy the Next.js app ───────────────────────────

log "Building and deploying to Firebase Hosting..."
firebase deploy --only hosting

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
