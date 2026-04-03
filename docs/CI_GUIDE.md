# CI Integration Guide & Monorepo Setup

## Overview

SigMap integrates into CI to keep your AI context fresh automatically.
Run both tools on every push so Copilot and Claude always have an up-to-date
understanding of your codebase.

*"SigMap for daily always-on context; Repomix for deep one-off sessions — use both."*

---

## Quick start — single repo

Copy `examples/github-action.yml` into `.github/workflows/sigmap.yml`:

```bash
mkdir -p .github/workflows
cp examples/github-action.yml .github/workflows/sigmap.yml
git add .github/workflows/sigmap.yml
git commit -m "ci: add SigMap auto-update workflow"
```

The workflow runs on every push to `main`/`master` and nightly at 02:00 UTC.
It commits updated context files back to the branch with `[skip ci]` to avoid
infinite loops.

---

## What the CI workflow does

| Job | Tool | Output | When |
|-----|------|--------|------|
| `sigmap` | `gen-context.js` | `.github/copilot-instructions.md` | every push + nightly |
| `project-map`  | `gen-project-map.js` | `PROJECT_MAP.md` | every push + nightly |
| `repomix`      | `repomix --compress` | `.context/repomix-compressed.md` | every push + nightly |
| `test`         | `node test/run.js` | pass/fail on Node 18/20/22 | every push + PR |

---

## Monorepo setup

### Auto-detection

SigMap v0.5+ automatically detects packages in standard monorepo layouts:

```
packages/*/package.json    ← npm/yarn/pnpm workspaces
apps/*/package.json        ← Next.js / Turborepo style
services/*/package.json    ← microservices layout
libs/*/package.json
packages/*/Cargo.toml      ← Rust workspaces
packages/*/go.mod          ← Go modules
packages/*/pyproject.toml  ← Python
packages/*/pom.xml         ← Maven / Java
packages/*/build.gradle    ← Gradle / Android
```

### Running monorepo mode

```bash
# CLI flag
node gen-context.js --monorepo

# Or set in config
echo '{"monorepo": true}' > gen-context.config.json
node gen-context.js
```

Output: one `CLAUDE.md` per detected package:
```
packages/auth/CLAUDE.md
packages/core/CLAUDE.md
packages/ui/CLAUDE.md
apps/web/CLAUDE.md
...
```

### Monorepo CI workflow

Add a `--monorepo` step to your workflow:

```yaml
- name: Generate per-package context
  run: node gen-context.js --monorepo

- name: Commit updated package context files
  uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: "chore(context): auto-update per-package AI context [skip ci]"
    file_pattern: "packages/**/CLAUDE.md apps/**/CLAUDE.md services/**/CLAUDE.md"
```

---

## Excluding files from context

### `.contextignore` (SigMap-specific)

```gitignore
# Exclude legacy and generated code
src/legacy/**
src/generated/**
**/*.pb.ts
**/*.generated.ts

# Exclude large test fixtures
test/fixtures/large-*
```

### `.repomixignore` (shared with Repomix)

```gitignore
# Works for both SigMap and Repomix
node_modules/
dist/
build/
*.min.js
```

Both files are merged automatically — no separate configuration needed.

> **Tip:** Symlink one to the other so you maintain a single exclusion file:
> ```bash
> ln -s .contextignore .repomixignore
> ```

---

## Git-diff priority

When `diffPriority: true` (the default), recently git-committed files appear
**first** in the generated output and are protected from token-budget drops.

```json
{
  "diffPriority": true
}
```

This means fresh changes are always reflected prominently in AI context — an
agent opening the project after your latest commit will immediately see what
changed.

---

## Token report in CI

Use `--report --json` to capture token metrics as structured output:

```yaml
- name: Token report
  run: |
    node gen-context.js --report --json | tee /tmp/cf-report.json
    echo "Final tokens: $(cat /tmp/cf-report.json | node -e 'process.stdin.resume();let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).finalTokens))')"
```

JSON schema:
```json
{
  "version": "2.0.0",
  "timestamp": "2026-04-01T09:00:00.000Z",
  "rawTokens": 42000,
  "finalTokens": 2800,
  "fileCount": 120,
  "droppedCount": 8,
  "reductionPct": 93.3,
  "overBudget": false,
  "budgetLimit": 6000
}
```

### CI helper script (v1.0)

`scripts/ci-update.sh` wraps the common CI pattern:

```bash
# Regenerate, track, and fail the build if over budget
bash scripts/ci-update.sh --fail-over-budget --track

# Regenerate + cache sidecar + JSON report (no fail)
bash scripts/ci-update.sh --format cache --json
```

### Health gate (v1.0)

Add a health check step to catch degradation before it affects acceptance rate:

```yaml
- name: SigMap health check
  run: node gen-context.js --health --json
  # Prints score/grade/staleness; use --json to capture for dashboards
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Context file is stale | Re-run `node gen-context.js` or check the nightly schedule |
| Too many tokens (> 6K) | Lower `maxTokens` or add patterns to `.contextignore` |
| Package not detected in monorepo | Ensure directory has a manifest (`package.json`, `Cargo.toml`, etc.) |
| Secret appears in output | Add pattern to `src/security/patterns.js` or use `.contextignore` for that file |
| CI write permission denied | Add `permissions: contents: write` to the workflow job |

---

## Related docs

- [MCP_SETUP.md](MCP_SETUP.md) — real-time context via MCP protocol
- [REPOMIX_INTEGRATION.md](REPOMIX_INTEGRATION.md) — deep-session context with Repomix
- [ENTERPRISE_SETUP.md](ENTERPRISE_SETUP.md) — observability, health score, self-healing CI
- [MODEL_ROUTING.md](MODEL_ROUTING.md) — model tier routing + `--suggest-tool`
