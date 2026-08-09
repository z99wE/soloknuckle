#!/usr/bin/env bash
# setup-github.sh — create the protected branch structure on GitHub.
#
# After this:
#   - `main` is protected: NO direct pushes, requires PR + 1 review
#   - `develop` is the staging branch
#   - All work happens on feature/* branches
#
# Prerequisites:
#   - gh CLI installed (brew install gh)
#   - gh auth login (one-time)
#
# Usage:
#   ./scripts/setup-github.sh

set -e

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ gh CLI not found. Install with: brew install gh"
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
if [ -z "$REPO" ]; then
  echo "❌ Not inside a GitHub repo. Run from your project root."
  exit 1
fi

echo "🔒 Protecting 'main' branch on $REPO..."

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/$REPO/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": [] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismissal_restrictions": {},
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

echo "✅ main is now protected."
echo ""
echo "Creating develop branch..."
git checkout -b develop 2>/dev/null || git checkout develop
git push -u origin develop

echo "✅ develop branch created."
echo ""
echo "🎉 Done. From now on, NEVER push to main. Always use a PR."
