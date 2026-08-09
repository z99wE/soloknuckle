#!/usr/bin/env bash
# setup-vercel.sh — connect a project to Vercel for auto-staging-deploys.
#
# Run this ONCE per project. After it runs:
#   - Every push to `develop` → auto-deploys to <app>-staging.vercel.app
#   - Every push to `main`    → auto-deploys to <app>.vercel.app (production)
#   - Every PR                → gets its own preview URL in the PR comments
#
# Prerequisites:
#   - npm install -g vercel
#   - vercel login (one-time, opens browser)
#
# Usage:
#   ./scripts/setup-vercel.sh

set -e

if ! command -v vercel >/dev/null 2>&1; then
  echo "❌ Vercel CLI not found. Install with: npm i -g vercel"
  exit 1
fi

echo "🔗 Linking this project to Vercel..."
vercel link --yes

echo "📦 Setting up GitHub auto-deploy..."
echo ""
echo "Next steps (manual, 2 minutes):"
echo ""
echo " 1. Go to https://vercel.com/dashboard"
echo " 2. Select your project → Settings → Git"
echo " 3. Confirm the repo is connected"
echo " 4. Settings → Git → Production Branch → set to 'main'"
echo " 5. Settings → Git → Deploy Hooks → create one called 'staging'"
echo "    pointing at branch 'develop'. Copy the URL."
echo " 6. Add this to your GitHub repo → Settings → Webhooks:"
echo "    - Payload URL: <that deploy hook URL>"
echo "    - Content type: application/json"
echo "    - Trigger on: 'push to develop'"
echo ""
echo "✅ Vercel setup complete. Now run ./scripts/setup-github.sh"
