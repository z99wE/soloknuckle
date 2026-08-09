#!/usr/bin/env bash
# setup-railway.sh — connect a backend project to Railway for auto-staging.
#
# After it runs:
#   - PR branches  → auto-deploy to a unique preview URL
#   - develop push → staging service
#   - main push    → production service
#
# Prerequisites:
#   - npm install -g @railway/cli
#   - railway login (one-time)
#
# Usage:
#   ./scripts/setup-railway.sh

set -e

if ! command -v railway >/dev/null 2>&1; then
  echo "❌ Railway CLI not found. Install with: npm i -g @railway/cli"
  exit 1
fi

echo "🔗 Linking to Railway..."
railway link

echo "🚂 Creating staging environment..."
railway environment new staging --copy-variables-from production || true

echo ""
echo "Next steps (manual, 3 minutes):"
echo ""
echo " 1. Go to https://railway.app/dashboard"
echo " 2. Project → Settings → Service → connect your GitHub repo"
echo " 3. Settings → Environments:"
echo "    - 'production' environment → branch 'main'"
echo "    - 'staging' environment    → branch 'develop'"
echo " 4. Settings → GitHub → enable 'PR Deployments'"
echo ""
echo "✅ Railway setup complete."
