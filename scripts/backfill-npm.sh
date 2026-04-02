#!/usr/bin/env bash
# backfill-npm.sh — Publish all historical git-tagged versions to npm
#
# This script checks out each tagged version and publishes it to npm.
# Versions prior to the current latest are published with --tag legacy
# so they don't overwrite the `latest` dist-tag.
#
# Prerequisites:
#   - npm logged in, or NPM_TOKEN exported:
#       export NPM_TOKEN=npm_xxxxxxxxxxxx
#   - All tags must exist locally:
#       git fetch --tags
#
# Usage:
#   ./scripts/backfill-npm.sh                 # dry run (no publish)
#   ./scripts/backfill-npm.sh --publish        # actually publish
#   ./scripts/backfill-npm.sh --publish --from v0.5.0  # start from a specific tag
#
# Safety:
#   - Always does a dry run first (npm publish --dry-run) before the real publish.
#   - Leaves your working tree on the original branch when done.
#   - Skips any tag whose package.json version doesn't match the tag name.

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

PACKAGE_NAME="context-forge"
LATEST_TAG="v1.5.0"    # The tag that should occupy the `latest` dist-tag

# Tags in ascending order — adjust if you add more historical tags.
ALL_TAGS=(
  v0.1.0 v0.2.0 v0.3.0 v0.4.0 v0.5.0
  v0.6.0 v0.7.0 v0.8.0 v0.9.0
  v1.0.0 v1.2.0 v1.3.0 v1.4.0
  v1.5.0
)
# Note: v1.1.0 was never tagged in git — intentionally omitted.

# ── Argument parsing ───────────────────────────────────────────────────────────

DRY_RUN=true
FROM_TAG=""

for arg in "$@"; do
  case "$arg" in
    --publish)    DRY_RUN=false ;;
    --from=*)     FROM_TAG="${arg#--from=}" ;;
    --from)       shift; FROM_TAG="${1:-}" ;;
    --help|-h)
      grep '^#' "$0" | head -20 | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

# ── Setup ─────────────────────────────────────────────────────────────────────

if [ -n "${NPM_TOKEN:-}" ]; then
  # Write .npmrc so npm picks up the token without an interactive login
  echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
  echo "[backfill] NPM_TOKEN applied to ~/.npmrc"
fi

ORIGINAL_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
ORIGINAL_REF=$(git rev-parse HEAD)

restore_state() {
  echo ""
  echo "[backfill] Restoring working tree to original state..."
  if [ -n "$ORIGINAL_BRANCH" ]; then
    git checkout "$ORIGINAL_BRANCH" --quiet 2>/dev/null || git checkout "$ORIGINAL_REF" --quiet
  else
    git checkout "$ORIGINAL_REF" --quiet
  fi
  echo "[backfill] Done."
}
trap restore_state EXIT

# ── Filtering by --from ────────────────────────────────────────────────────────

TAGS_TO_PUBLISH=()
SKIP=true

for tag in "${ALL_TAGS[@]}"; do
  if [ -z "$FROM_TAG" ]; then
    SKIP=false
  fi
  if [ "$tag" = "$FROM_TAG" ]; then
    SKIP=false
  fi
  if [ "$SKIP" = false ]; then
    TAGS_TO_PUBLISH+=("$tag")
  fi
done

if [ ${#TAGS_TO_PUBLISH[@]} -eq 0 ]; then
  echo "[backfill] No tags to publish (FROM_TAG '$FROM_TAG' not found or list is empty)"
  exit 1
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║        context-forge — npm backfill publisher            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Package  : $PACKAGE_NAME"
echo "  Latest   : $LATEST_TAG  (will use dist-tag: latest)"
echo "  Others   : all other tags  (will use dist-tag: legacy)"
echo "  Dry run  : $DRY_RUN"
echo ""
echo "  Tags to publish (${#TAGS_TO_PUBLISH[@]}):"
for tag in "${TAGS_TO_PUBLISH[@]}"; do
  marker=""
  [ "$tag" = "$LATEST_TAG" ] && marker=" ← latest"
  echo "    $tag$marker"
done
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "  ⚠  DRY RUN — pass --publish to actually publish."
  echo ""
fi

# ── Publish loop ──────────────────────────────────────────────────────────────

PASS=()
FAIL=()
SKIP_LIST=()

for tag in "${TAGS_TO_PUBLISH[@]}"; do
  echo "──────────────────────────────────────────────────────────"
  echo "[backfill] Processing $tag …"

  # Check the tag exists locally
  if ! git rev-parse "$tag" > /dev/null 2>&1; then
    echo "[backfill] SKIP — tag '$tag' not found locally (run: git fetch --tags)"
    SKIP_LIST+=("$tag")
    continue
  fi

  # Checkout the tag
  git checkout "$tag" --quiet

  # Verify package.json version matches the tag
  PKG_VERSION="v$(node -p "require('./package.json').version" 2>/dev/null || echo 'unknown')"
  if [ "$PKG_VERSION" != "$tag" ]; then
    echo "[backfill] SKIP — package.json version ($PKG_VERSION) doesn't match tag ($tag)"
    SKIP_LIST+=("$tag")
    continue
  fi

  echo "[backfill] package.json version OK: $PKG_VERSION"

  # Choose dist-tag
  if [ "$tag" = "$LATEST_TAG" ]; then
    DIST_TAG="latest"
  else
    DIST_TAG="legacy"
  fi

  # Check if this version is already published
  PUBLISHED=$(npm view "${PACKAGE_NAME}@${PKG_VERSION#v}" version 2>/dev/null || echo "")
  if [ -n "$PUBLISHED" ]; then
    echo "[backfill] SKIP — ${PACKAGE_NAME}@${PKG_VERSION#v} already published on npm"
    SKIP_LIST+=("$tag")
    continue
  fi

  # Always do a dry run first to catch packaging errors
  echo "[backfill] Running dry-run for $tag…"
  if ! npm publish --dry-run --access public 2>&1 | tail -5; then
    echo "[backfill] FAIL — dry run failed for $tag"
    FAIL+=("$tag")
    continue
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "[backfill] DRY RUN — would publish: npm publish --tag $DIST_TAG --access public"
    PASS+=("$tag (dry)")
  else
    echo "[backfill] Publishing $tag with dist-tag '$DIST_TAG'…"
    if npm publish --tag "$DIST_TAG" --access public; then
      echo "[backfill] ✓ Published $tag"
      PASS+=("$tag")
    else
      echo "[backfill] ✗ FAILED to publish $tag"
      FAIL+=("$tag")
    fi
  fi
done

# ── Result summary ────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Results"
echo "══════════════════════════════════════════════════════════"
echo ""

if [ ${#PASS[@]} -gt 0 ]; then
  echo "  ✓ Published (${#PASS[@]}):"
  for t in "${PASS[@]}"; do echo "      $t"; done
  echo ""
fi

if [ ${#SKIP_LIST[@]} -gt 0 ]; then
  echo "  ○ Skipped (${#SKIP_LIST[@]}):"
  for t in "${SKIP_LIST[@]}"; do echo "      $t"; done
  echo ""
fi

if [ ${#FAIL[@]} -gt 0 ]; then
  echo "  ✗ Failed (${#FAIL[@]}):"
  for t in "${FAIL[@]}"; do echo "      $t"; done
  echo ""
  exit 1
fi

if [ "$DRY_RUN" = true ] && [ ${#PASS[@]} -gt 0 ]; then
  echo "  Run with --publish to execute the above publishes."
  echo ""
fi
