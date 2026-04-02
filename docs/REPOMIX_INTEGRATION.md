# SigMap + Repomix Integration Guide

> **One sentence:** SigMap for daily always-on context; Repomix for deep one-off sessions — use both.

---

## Why both?

| Tool | Best for | Token cost | When to use |
|---|---|---|---|
| **SigMap** | Always-on signatures | ~500–4 K | Every open editor session |
| **[Repomix](https://github.com/yamadashy/repomix)** | Full file content dumps | 20 K–200 K | Deep refactors, onboarding, big-picture analysis |

SigMap never replaces Repomix. They solve different halves of the context problem:

- SigMap extracts *structure* — function signatures, class hierarchies, type definitions. It answers "what exists?" in under 4 K tokens.
- Repomix packs *full content* — every file, every line. It answers "what does it do, exactly?" at the cost of many more tokens.

For most agent sessions:
1. SigMap auto-generates on every commit → agent always has structure
2. When you need to deep-dive, run Repomix → paste or attach the bundle

---

## Installation

### SigMap

```bash
node gen-context.js --setup   # installs post-commit hook + watcher
```

### Repomix

```bash
npx repomix            # no install needed
# or
npm install -g repomix
```

---

## Shared ignore file

Both tools support gitignore-style exclusion files. To share a single config:

```bash
# Option A: symlink
ln -s .contextignore .repomixignore

# Option B: copy once and maintain in sync
cp .contextignore .repomixignore
```

SigMap reads `.contextignore` **and** `.repomixignore` automatically — you don't need to do anything if Repomix's ignore file already exists.

Example `.contextignore` / `.repomixignore`:

```
# Build outputs
dist/
build/
out/

# Dependencies
node_modules/
vendor/
.venv/

# Generated files
*.pb.go
*.generated.ts

# Test fixtures (large binary-like files)
test/fixtures/*.min.js

# Secrets / env files — never pack these
.env
.env.*
secrets/
```

---

## GitHub Actions — run both

Add this workflow to your repo for CI-verified context freshness:

```yaml
# .github/workflows/context.yml
name: Update context on push

on:
  push:
    branches: [main]

jobs:
  update-context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # SigMap — fast always-on signatures
      - name: Generate SigMap context
        run: node gen-context.js

      # Repomix — full content bundle (stored as artifact, not committed)
      - name: Generate Repomix bundle
        run: npx repomix --output repomix-output.xml

      - name: Upload Repomix bundle
        uses: actions/upload-artifact@v4
        with:
          name: repomix-bundle
          path: repomix-output.xml
          retention-days: 7

      # Commit updated SigMap signatures
      - name: Commit updated context
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .github/copilot-instructions.md CLAUDE.md .cursorrules .windsurfrules
          git diff --staged --quiet || git commit -m "chore(context): regenerate signatures [skip ci]"
          git push
```

---

## Typical workflow

### Daily work (SigMap auto-runs)

```
git commit -m "feat: add user auth"
# post-commit hook fires:
#   [sigmap] wrote .github/copilot-instructions.md (312 tokens)
# Copilot/Claude now has fresh signatures automatically
```

### Deep refactor session (add Repomix)

```bash
# 1. Get high-level structure (SigMap, already up-to-date)
cat .github/copilot-instructions.md   # ~300 tokens

# 2. Pack the relevant subsystem for deep analysis
npx repomix --include "src/auth/**" --output auth-bundle.txt
# Attach auth-bundle.txt to your agent session
# This adds full file content (~15 K tokens) for just that subsystem
```

### Onboarding a new engineer (both)

```bash
# Share the signatures for quick orientation
cat .github/copilot-instructions.md

# Share a full pack for deep reading
npx repomix --output full-codebase.xml
# Give full-codebase.xml to the AI onboarding assistant
```

---

## MCP servers — configure both

If using Claude Desktop or Cursor with MCP support, configure both servers:

```json
{
  "mcpServers": {
    "sigmap": {
      "command": "node",
      "args": ["/path/to/your/project/gen-context.js", "--mcp"]
    },
    "repomix": {
      "command": "npx",
      "args": ["-y", "repomix", "--mcp"]
    }
  }
}
```

With both active:
- `read_context` (SigMap) → fast structure lookup in any session
- `pack_files` (Repomix) → full content when you need to go deep

---

## When to choose each tool for context injection

| Scenario | Recommended | Reason |
|---|---|---|
| Routine coding session | SigMap | Low tokens, always fresh |
| Bug spanning 5+ files | Repomix (subset) | Need to see actual code |
| Architecture review | Both | Structure overview + full content |
| PR review assistant | SigMap + git diff | Signatures + changed lines |
| New team member pair session | Repomix | Full codebase for orientation |
| Token budget is tight (<8 K) | SigMap only | Signatures fit, bodies don't |
| Model needs to output exact code | Repomix for those files | Signatures not enough |

---

## Resources

- [Repomix on GitHub](https://github.com/yamadashy/repomix) — MIT, 15K+ stars
- [SigMap README](../README.md)
- [SigMap MCP setup](./MCP_SETUP.md)
- [SESSION_DISCIPLINE.md](./SESSION_DISCIPLINE.md) — how to structure agent sessions effectively
