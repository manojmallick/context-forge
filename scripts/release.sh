#!/usr/bin/env bash
# Usage: ./scripts/release.sh 1.6.0
#
# Bumps version in all 3 places, commits, tags, and pushes.
# The GitHub Actions pipeline handles the rest:
#   → npm publish  (NPM_TOKEN secret)
#   → GitHub Packages publish  (GITHUB_TOKEN — automatic)
#   → VS Code Marketplace publish  (VSCE_PAT secret)
#   → GitHub Release (auto-generated notes)

set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version>   e.g. ./scripts/release.sh 1.6.0"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "ERROR: version must be semver without a leading 'v', e.g. 1.6.0"
  exit 1
fi

# Make sure the working tree is clean
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: working tree has uncommitted changes — commit or stash first"
  git status --short
  exit 1
fi

echo "→ Releasing v$VERSION"

# 1. Bump package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  ✓ package.json"

# 2. Bump VERSION constant in gen-context.js
sed -i.bak "s/const VERSION = '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'/const VERSION = '$VERSION'/" gen-context.js
rm -f gen-context.js.bak
echo "  ✓ gen-context.js"

# 3. Bump MCP server version in src/mcp/server.js
sed -i.bak "s/version: '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'/version: '$VERSION'/" src/mcp/server.js
rm -f src/mcp/server.js.bak
echo "  ✓ src/mcp/server.js"

# 4. Rebuild bundle so gen-context.standalone.js stays in sync
if [ -f scripts/bundle.js ]; then
  node scripts/bundle.js > /dev/null 2>&1 || true
  echo "  ✓ bundle rebuilt"
fi

# 5. Bump VS Code extension version
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('vscode-extension/package.json', 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('vscode-extension/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  ✓ vscode-extension/package.json"

# 6. Stage and commit
git add package.json gen-context.js src/mcp/server.js vscode-extension/package.json
# Include standalone bundle only if it is tracked (not in .gitignore)
if git ls-files --error-unmatch gen-context.standalone.js > /dev/null 2>&1; then
  git add gen-context.standalone.js
fi

git commit -m "chore: release v$VERSION"

# 7. Tag and push
git tag "v$VERSION"
git push
git push origin "v$VERSION"

echo ""
echo "✓ Tag v$VERSION pushed — pipeline is running:"
echo "  https://github.com/manojmallick/sigmap/actions"
echo ""
echo "Required GitHub Secrets (must be set before pipeline publishes):"
echo "  NPM_TOKEN  — Automation token from npmjs.com/settings/tokens"
echo "  VSCE_PAT   — PAT from dev.azure.com with Marketplace (Publish) scope"
echo "  GITHUB_TOKEN is automatic — no action needed"
