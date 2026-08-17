#!/usr/bin/env bash
# setup.sh — ONE COMMAND to add production hygiene to any existing project.
#
# What it does:
#   1. Copies AGENTS.md, scripts/, templates/, and workflow/ into ./ in the current project
#   2. Creates feature/ branch discipline: switches you to `develop` if it exists, else creates it
#   3. Sets up the local branch-protection git hook so `git push origin main` is refused
#   4. Initializes flags.json
#
# Usage (from inside your project folder):
#   curl -fsSL https://raw.githubusercontent.com/<your-user>/production-hygiene/main/setup.sh | bash
#
# Or, if you cloned this folder locally:
#   ~/Desktop/production-hygiene/setup.sh

set -e

HYGIENE_SRC="${HYGIENE_SRC:-$(dirname "$0")}"
TARGET="$(pwd)"

echo "🚀 Installing production hygiene into: $TARGET"
echo ""

# 1. Copy the kit
echo "📦 Copying AGENTS.md, scripts/, templates/, workflow/..."
mkdir -p "$TARGET/.hygiene"
cp "$HYGIENE_SRC/AGENTS.md" "$TARGET/AGENTS.md"
cp "$HYGIENE_SRC/templates/feature-flag.tsx" "$TARGET/.hygiene/"
cp "$HYGIENE_SRC/templates/feature-flag.api.ts" "$TARGET/.hygiene/"
cp "$HYGIENE_SRC/templates/feature-flag.backend.ts" "$TARGET/.hygiene/"
cp "$HYGIENE_SRC/templates/flags.json" "$TARGET/flags.json"
cp -r "$HYGIENE_SRC/scripts" "$TARGET/scripts"
cp -r "$HYGIENE_SRC/workflow" "$TARGET/workflow"
chmod +x "$TARGET/scripts/"*.sh

# 2. Install the git hooks
echo "🛡️  Installing safety hooks..."
mkdir -p "$TARGET/.git/hooks"

# pre-push: block direct pushes to main/develop
cat > "$TARGET/.git/hooks/pre-push" <<'HOOK'
#!/usr/bin/env bash
# Block direct pushes to main / develop — force PR workflow.
while read local_ref local_sha remote_ref remote_sha; do
  if [[ "$remote_ref" == "refs/heads/main" || "$remote_ref" == "refs/heads/develop" ]]; then
    echo "🚫 BLOCKED: direct push to $remote_ref is not allowed."
    echo "   Create a feature branch and open a Pull Request instead."
    echo "   Example:"
    echo "     git checkout -b feature/my-change"
    echo "     git push -u origin feature/my-change"
    echo "     gh pr create --base develop"
    exit 1
  fi
done
HOOK
chmod +x "$TARGET/.git/hooks/pre-push"

# pre-commit: run the full quality gate suite
cp "$HYGIENE_SRC/git-hooks/pre-commit" "$TARGET/.git/hooks/pre-commit"
chmod +x "$TARGET/.git/hooks/pre-commit"

# commit-msg: enforce conventional commits format
cp "$HYGIENE_SRC/git-hooks/commit-msg" "$TARGET/.git/hooks/commit-msg"
chmod +x "$TARGET/.git/hooks/commit-msg"

echo "  Installed: pre-push, pre-commit, commit-msg hooks"

# 3. Ensure git + branches
if [ ! -d "$TARGET/.git" ]; then
  echo "📁 Initializing git repo..."
  git init
fi

git checkout -b develop 2>/dev/null || git checkout develop

# 4. Initial commit of the hygiene files
git add AGENTS.md flags.json .hygiene/ scripts/ workflow/
git diff --cached --quiet || git commit -m "chore: install production hygiene kit (AGENTS.md, scripts, flags)"

echo ""
echo "✅ Hygiene kit installed. Next steps:"
echo ""
echo "  1. Run: ./scripts/setup-github.sh   (protect main branch on GitHub)"
echo "  2. Run: ./scripts/setup-vercel.sh   (or setup-railway.sh for backends)"
echo "  3. Edit flags.json → set your founder email in the 'allowlist' arrays"
echo "  4. From now on: every new feature goes on a feature/* branch + behind a flag"
echo ""
echo "🎯 Tell any AI coding tool to 'read AGENTS.md first' before it touches code."
