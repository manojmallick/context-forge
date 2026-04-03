# SigMap — Complete Getting Started Guide

> **Goal of this guide:** Show you exactly how much token saving is happening, prove context is not lost, and walk through every command and the VS Code plugin end-to-end.

---

## Table of contents

1. [The problem SigMap solves](#1-the-problem-sigmap-solves)
2. [Install in 60 seconds](#2-install-in-60-seconds)
3. [Your first context generation](#3-your-first-context-generation)
4. [Measuring token savings](#4-measuring-token-savings)
5. [Proving context is not lost](#5-proving-context-is-not-lost)
6. [Every CLI command explained](#6-every-cli-command-explained)
7. [VS Code extension walkthrough](#7-vs-code-extension-walkthrough)
8. [Configuration reference](#8-configuration-reference)
9. [Advanced strategies](#9-advanced-strategies)
10. [MCP server setup](#10-mcp-server-setup)
11. [CI/CD integration](#11-cicd-integration)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. The problem SigMap solves

Every time you start a session with GitHub Copilot, Claude, Cursor, or Gemini, the AI starts with **zero knowledge** of your codebase:

```
You:  "Add rate limiting to the user authentication flow"
AI:   "Could you share some files so I can understand your project structure?"
```

This is the cold-start problem. You lose 5–15 minutes every session re-explaining architecture.

Without SigMap, an AI assistant trying to understand a 200-file TypeScript project would need:

| What you'd send | Tokens |
|---|---:|
| All source files (full content) | ~400,000 |
| Just the important files | ~50,000 |
| **SigMap signature map** | **~3,800** |

**SigMap's answer:** extract only function names, class hierarchies, and exported types — everything the AI needs to navigate your code, nothing it doesn't.

```
Before SigMap:  "I don't know your codebase — can you share some files?"
After SigMap:   "I can see your AuthService, UserRepository, 47 API routes,
                 and the middleware stack. Where should I add rate limiting?"
```

---

## 2. Install in 60 seconds

### Option A — Global install (recommended)

```bash
npm install -g sigmap
```

Verify:

```bash
sigmap --version
# → 2.0.0
```

### Option B — Per-project (no global install)

```bash
# Copy the single-file runner to your project
curl -O https://raw.githubusercontent.com/manojmallick/sigmap/main/gen-context.js

# Run without installing
node gen-context.js --version
# → 2.0.0
```

### Option C — npx (zero install)

```bash
npx sigmap
```

### VS Code extension

1. Open VS Code → Extensions (`Ctrl+Shift+X` / `⇧⌘X`)
2. Search **SigMap**
3. Click **Install**

Or install from terminal:

```bash
code --install-extension manojmallick.sigmap
```

---

## 3. Your first context generation

Navigate to your project root (must contain your source code) and run:

```bash
cd /your/project
sigmap
```

What happens in under 1 second:

```
[sigmap] scanning 47 files…
[sigmap] extractors: ts(12) js(8) py(6) go(4) …
[sigmap] secret scan: clean
[sigmap] wrote .github/copilot-instructions.md (1,842 tokens)
```

SigMap creates `.github/copilot-instructions.md`. Open it to see what was generated:

```bash
cat .github/copilot-instructions.md
```

You'll see compact sections like:

```markdown
## src/auth/service.ts
export class AuthService
  authenticate(credentials: Credentials): Promise<User>
  refreshToken(token: string): Promise<TokenPair>
  revokeSession(userId: string): void

## src/users/repository.ts
export class UserRepository
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  create(data: CreateUserDto): Promise<User>
  update(id: string, patch: Partial<User>): Promise<User>
```

**No function bodies. No comments. No imports. Just signatures.**

### Commit this file

```bash
git add .github/copilot-instructions.md
git commit -m "chore: add sigmap context file"
```

Every team member, CI run, and PR review will now have this context automatically.

---

## 4. Measuring token savings

### Run the report

```bash
sigmap --report
```

Real output on the SigMap repo itself (36 source files):

```
[sigmap] report:
  version         : 2.0.0
  files processed : 36
  files dropped   : 0
  input tokens    : ~24,082
  output tokens   : ~1,374
  budget limit    : 6000
  reduction       : 94.3%
```

**94.3% fewer tokens. The AI still sees every public function and class.**

### Get machine-readable JSON (for dashboards / CI)

```bash
sigmap --report --json
```

```json
{
  "version": "2.0.0",
  "rawTokens": 24082,
  "finalTokens": 1374,
  "fileCount": 36,
  "droppedCount": 0,
  "reductionPct": 94.3,
  "overBudget": false,
  "budgetLimit": 6000
}
```

### What the numbers mean

| Metric | What it tells you |
|---|---|
| `rawTokens` | What sending all source files would cost |
| `finalTokens` | What SigMap actually puts in the context file |
| `reductionPct` | Percentage saved — aim for > 80% |
| `overBudget` | `true` if output > `maxTokens` (default 6000) — means some files were dropped |
| `droppedCount` | Files excluded to stay under budget — check `.contextignore` if this is high |

### Reduction benchmarks

| Codebase size | Typical reduction |
|---|---:|
| Small (< 20 files) | 85–92% |
| Medium (20–100 files) | 90–96% |
| Large (100–500 files) | 95–99% |
| Monorepo (500+ files) | 97–99.5% |

---

## 5. Proving context is not lost

This is the key question: **does the AI actually know your code after seeing only signatures?**

### Test 1 — Navigation accuracy

Open a Copilot Chat (or Claude) and ask:

```
"What method do I call to refresh a user's auth token?"
```

**Without SigMap:** "I'd need to see your auth code to answer that."

**With SigMap:** "Call `AuthService.refreshToken(token)` — it returns a `Promise<TokenPair>`."

The AI navigates your codebase without you pasting a single file.

### Test 2 — Architectural questions

```
"What layers does this codebase have? What calls what?"
```

**With SigMap**, the AI can trace the call chain from exported functions because it has seen every class, every method signature, and every module.

### Test 3 — What IS lost (intentionally)

SigMap deliberately omits:

| Omitted | Why |
|---|---|
| Function bodies | The AI doesn't need them to navigate; you paste specific files when needed |
| Comments and docstrings | Already in the signatures if they matter |
| Private methods (`_foo`, `#bar`) | Internal implementation detail, not part of the public API |
| Import statements | Redundant — the module structure shows dependencies |
| Test files | Dropped first when over budget; add back in `.contextignore` exclusions |

**The rule:** SigMap gives AI the *map* of your city. When you need to work on a specific street, you paste that file. The map means you never have to explain the whole city again.

### Test 4 — Measure it yourself

Before SigMap: count the tokens you'd normally paste into a session start:

```bash
# Count tokens in your typical "context paste" files
wc -c src/auth/*.ts src/users/*.ts | tail -1
# Divide by 4 for approximate token count
```

After SigMap:

```bash
sigmap --report
# Compare finalTokens vs your manual count
```

---

## 6. Every CLI command explained

### `sigmap` (or `node gen-context.js`)
**One-shot generate and exit.**

```bash
sigmap
```

Scans `src/`, `app/`, `lib/`, `packages/` (configurable), extracts signatures from all 21 supported languages, secret-scans each signature, enforces the token budget, writes `.github/copilot-instructions.md`. Done in < 1 second for most projects.

---

### `sigmap --watch`
**Generate once, then watch for file changes.**

```bash
sigmap --watch
```

Keeps running. Every time you save a `.ts`, `.py`, `.go`, etc. file, SigMap regenerates the context file in the background. Use this during active development so Copilot always has fresh signatures.

Press `Ctrl+C` to stop.

---

### `sigmap --setup`
**Full installation: generate + git pre-commit hook + watch daemon.**

```bash
sigmap --setup
```

Does three things:
1. Generates context immediately
2. Installs a `.git/hooks/pre-commit` that regenerates context on every commit
3. Starts the watch process

After `--setup`, you never need to remember to regenerate. It happens automatically.

---

### `sigmap --report`
**Show token reduction stats.**

```bash
sigmap --report          # human-readable
sigmap --report --json   # machine-readable JSON (exits 1 if over budget)
```

Use `--report --json` in CI to gate PRs on context budget:

```yaml
- run: sigmap --report --json
  # exits 1 if over maxTokens → fails the CI check
```

---

### `sigmap --report --history`
**Show historical usage trends.**

```bash
sigmap --track    # run this to start recording history
sigmap --report --history
```

Shows how token counts have changed over time — useful for spotting when a codebase is growing too large for the budget.

---

### `sigmap --health`
**Composite health score for your context file.**

```bash
sigmap --health
```

```
[sigmap] health:
  score           : 80/100 (grade B)
  strategy        : full
  token reduction : 94.3%
  days since regen: 0.7
  total runs      : 1
  over-budget runs: 0
```

| Grade | Score | Meaning |
|:---:|:---:|---|
| A | 90–100 | Fresh, complete, under budget — AI has full context |
| B | 75–89 | Good — minor freshness or coverage gap |
| C | 60–74 | Stale or incomplete — regenerate soon |
| D | < 60 | Very stale or missing — regenerate now |

```bash
sigmap --health --json   # machine-readable for CI
```

---

### `sigmap --diff`
**Generate context only for git-changed files.**

```bash
sigmap --diff           # files changed vs last commit
sigmap --diff --staged  # only staged files
```

Useful in large repos: regenerates in milliseconds because it only processes changed files. Your PR review AI sees exactly what changed.

---

### `sigmap --init`
**Create a starter config and `.contextignore` in your project.**

```bash
sigmap --init
```

Creates:
- `gen-context.config.json` — annotated config with all options
- `.contextignore` — exclusion rules (gitignore syntax)

Run this first on a new project to customize what gets indexed.

---

### `sigmap --routing`
**Include HTTP route extraction in the output.**

```bash
sigmap --routing
```

Adds a `## Routes` section to your context file listing every `app.get()`, `router.post()`, Express/FastAPI/Flask route. Useful for API-heavy projects.

---

### `sigmap --monorepo`
**Generate one context file per package.**

```bash
sigmap --monorepo
```

Produces:
```
.github/context-packages-api.md
.github/context-packages-web.md
.github/context-packages-shared.md
```

Each AI session works with only the relevant package context.

---

### `sigmap --format cache`
**Write Anthropic prompt-cache JSON alongside the context file.**

```bash
sigmap --format cache
```

Outputs `.github/copilot-instructions-cache.json` — a pre-formatted payload for Claude's prompt caching API. Reduces cost by 90% on repeated Claude API calls.

---

### `sigmap --track`
**Append run metrics to `.context/usage.ndjson`.**

```bash
sigmap --track
```

Records timestamp, token counts, file counts, and grade after each run. Use `--report --history` to read it back. Useful for tracking context health over time in a team.

---

### `sigmap --suggest-tool "<task>"`
**Get a recommendation for which AI model tier to use.**

```bash
sigmap --suggest-tool "refactor the authentication module"
sigmap --suggest-tool "fix this typo in README" --json
```

```
[sigmap] suggestion:
  task    : refactor the authentication module
  tier    : tier-2 (mid-range — GPT-4o, Claude Sonnet)
  reason  : structural change requiring codebase awareness
```

Tier 1 = fast/cheap (typos, comments). Tier 2 = mid (feature work). Tier 3 = powerful (architecture, full rewrites).

---

### `sigmap --mcp`
**Start the MCP server on stdio.**

```bash
sigmap --mcp
```

Not usually run directly — your AI tool (Claude Code, Cursor) invokes it automatically. See [§10 MCP server setup](#10-mcp-server-setup).

---

### `sigmap --version`
```bash
sigmap --version
# → 2.0.0
```

### Installation

1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions)
3. Search **SigMap**
4. Click **Install**

Or from terminal: `code --install-extension manojmallick.sigmap`

---

### The status bar item

After installation, look at the **bottom-right** of VS Code. You'll see:

```
⎔ cf: ✔ A • 2h ago
```

This is the SigMap health indicator. It updates every 60 seconds automatically.

| Display | Meaning | Action |
|---|---|---|
| `✔ A • 2h ago` | Grade A, regenerated 2 hours ago | Nothing needed |
| `ℹ B • 8h ago` | Grade B, 8 hours old | Regenerate when convenient |
| `⚠ C • 1d ago` | Grade C, 1 day old | Regenerate soon |
| `✖ D • 3d ago` | Grade D, 3 days old | Regenerate now — AI is flying blind |
| `⎔ cf: no context` | No context file found | Run `SigMap: Regenerate Context` |

**Click the status bar item** → triggers an instant regeneration.

---

### Command Palette commands

Press `⇧⌘P` (Mac) / `Ctrl+Shift+P` (Windows/Linux) and type **SigMap**:

#### `SigMap: Regenerate Context`

Runs `node gen-context.js` in an integrated terminal at your workspace root. The terminal shows real-time output:

```
[sigmap] scanning 47 files…
[sigmap] wrote .github/copilot-instructions.md (1,842 tokens)
[SigMap] done
```

The status bar updates automatically once the file is written.

**When to use:** after a big refactor, after merging a PR, or when the status bar shows grade C or D.

#### `SigMap: Open Context File`

Opens `.github/copilot-instructions.md` directly in your editor. Use this to:
- Verify what the AI can see about your code
- Manually add project-level notes above the auto-generated signatures
- Debug cases where the AI doesn't seem to know about a function

---

### Stale context notification

If you haven't regenerated in **24 hours**, a notification appears:

```
SigMap: context file is 2 days old. Regenerate now?
[ Regenerate ]  [ Not now ]  [ Don't show again ]
```

- **Regenerate** — runs `gen-context.js` immediately
- **Not now** — dismisses for this session
- **Don't show again** — permanently suppresses for this workspace

---

### Extension settings

Go to `File → Preferences → Settings` and search **sigmap**, or add directly to `settings.json`:

```json
{
  "sigmap.scriptPath": ""
}
```

| Setting | Default | Description |
|---|---|---|
| `sigmap.scriptPath` | `""` | Set this to the absolute path of `gen-context.js` if VS Code can't find it automatically (e.g., if you installed globally at a non-standard path) |

**Example for a global install:**
```json
{
  "sigmap.scriptPath": "/usr/local/lib/node_modules/sigmap/gen-context.js"
}
```

**Example for per-project:**
```json
{
  "sigmap.scriptPath": "${workspaceFolder}/gen-context.js"
}
```

---

### Typical daily workflow with VS Code

```
Morning:
  1. Open VS Code → status bar shows grade & age
  2. If grade C/D or age > 24h → click status bar to regenerate (5 sec)
  3. Start coding — Copilot has full context

During development:
  4. Run  sigmap --watch  in terminal for live updates, OR
  5. Commit frequently — git hook (from --setup) auto-regenerates

End of day:
  6. Run SigMap: Regenerate Context one final time before closing
  7. Commit .github/copilot-instructions.md with your other changes
```

---

## 8. Configuration reference

Create `gen-context.config.json` in your project root (`sigmap --init` generates a starter):

```json
{
  "output": ".github/copilot-instructions.md",
  "outputs": ["copilot"],
  "srcDirs": ["src", "app", "lib"],
  "exclude": ["node_modules", ".git", "dist", "build", "__pycache__"],
  "maxDepth": 6,
  "maxSigsPerFile": 25,
  "maxTokens": 6000,
  "secretScan": true,
  "diffPriority": true,
  "strategy": "full"
}
```

### `outputs` — write to multiple AI tools at once

```json
{ "outputs": ["copilot", "claude", "cursor", "windsurf"] }
```

| Value | File written |
|---|---|
| `"copilot"` | `.github/copilot-instructions.md` |
| `"claude"` | `CLAUDE.md` (appends below `## Auto-generated signatures`) |
| `"cursor"` | `.cursorrules` |
| `"windsurf"` | `.windsurfrules` |

### `.contextignore` — exclude files from indexing

Same syntax as `.gitignore`:

```
# Exclude test files (saves ~30% tokens on test-heavy repos)
**/*.test.ts
**/*.spec.ts
test/

# Exclude generated code
src/generated/
*.pb.ts
*.pb.go

# Exclude vendor / lock files
vendor/
*.lock
```

### `maxTokens` — the budget

Default is `6000`. When output would exceed this, SigMap drops files in this order:
1. Test files first
2. Config files
3. Generated files
4. Least recently changed
5. Files with fewest signatures

Raise it if you have a large codebase and want more coverage. Lower it for models with smaller context windows.

---

## 9. Advanced strategies

SigMap has three output strategies. Set in `gen-context.config.json`:

### `full` (default)
Single file, all signatures, always injected. Works with every AI tool. Best starting point.

```json
{ "strategy": "full" }
```

Token reduction: **90–96%**

### `per-module`
One context file per source directory + a thin overview file. The AI loads only the module it needs.

```json
{ "strategy": "per-module" }
```

```
.github/copilot-instructions.md    ← thin overview (~200 tokens)
.github/context-src-auth.md        ← auth module only (~150 tokens)
.github/context-src-users.md       ← users module only (~180 tokens)
```

Token reduction: **97–99%** per question (AI reads only the relevant module).
Best for: large codebases with clear module boundaries.

### `hot-cold`
Hot (recently changed) files are always injected. Cold (stable) files stay in a separate file, readable via MCP.

```json
{ "strategy": "hot-cold", "hotCommits": 10 }
```

```
.github/copilot-instructions.md   ← only files changed in last 10 commits (~300 tokens)
.github/context-cold.md           ← everything else (read via MCP when needed)
```

Token reduction: **98–99.5%** on active sessions.
Best for: projects with MCP (Claude Code, Cursor) where you're focused on a specific area.

---

## 10. MCP server setup

The MCP server exposes three tools to Claude Code, Cursor, and Windsurf:

| Tool | What it does |
|---|---|
| `read_context` | Returns signatures for the whole project or a specific module path |
| `search_signatures` | Keyword search across all signatures — find where a function is defined |
| `get_map` | Returns import graph, class hierarchy, or route table |

### Enable in Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "sigmap": {
      "command": "node",
      "args": ["/path/to/your/project/gen-context.js", "--mcp"]
    }
  }
}
```

### Enable in Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sigmap": {
      "command": "node",
      "args": ["/path/to/your/project/gen-context.js", "--mcp"]
    }
  }
}
```

### Auto-register (easiest)

```bash
sigmap --setup
```

SigMap detects your AI tool config files and adds itself automatically.

### Test the MCP server

```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node gen-context.js --mcp
```

Should return JSON with `read_context`, `search_signatures`, and `get_map`.

---

## 11. CI/CD integration

### GitHub Actions — gate PRs on context budget

```yaml
# .github/workflows/sigmap.yml
name: SigMap Context Check
on: [push, pull_request]

jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Generate context
        run: node gen-context.js
      - name: Check token budget
        run: node gen-context.js --report --json
        # Exits 1 (fails CI) if output > maxTokens
      - name: Commit context file
        run: |
          git config user.email "ci@github.com"
          git config user.name "SigMap CI"
          git add .github/copilot-instructions.md
          git diff --staged --quiet || git commit -m "chore: update sigmap context [skip ci]"
          git push
```

### Pre-commit hook (via `--setup`)

```bash
sigmap --setup
```

Installs `.git/hooks/pre-commit` that regenerates context automatically before every commit.

---

## 12. Troubleshooting

### "no context file found" in status bar
→ Run `SigMap: Regenerate Context` from the command palette. If it fails, check Node.js is installed: `node --version` (needs 18+).

### Context file exists but grade is D
→ The file is stale (> 3 days). Click the status bar or run `sigmap` to regenerate.

### Copilot doesn't seem to use the context
→ The file must be at exactly `.github/copilot-instructions.md` in your **workspace root** (the folder you opened with `File → Open Folder`). Check by running `ls .github/copilot-instructions.md`.

### Token reduction is only 60%
→ You're likely indexing test files or generated code. Run `sigmap --init` to create a `.contextignore` and add:
```
**/*.test.*
**/*.spec.*
dist/
build/
src/generated/
```

### "gen-context.js not found" warning in VS Code
→ Either install globally (`npm install -g sigmap`) or set `sigmap.scriptPath` in VS Code settings to the absolute path of your local `gen-context.js`.

### Over-budget warning: some files were dropped
→ Either raise `maxTokens` in config, or add more exclusions to `.contextignore`. Check which files were dropped: `sigmap --report` shows `files dropped`.

### Secret scan is redacting a false positive
→ The pattern matched something that isn't a secret. Add a `.contextignore` rule to exclude that file, or check `src/security/patterns.js` to see which pattern triggered.

---

## Quick reference card

```bash
# First time
sigmap --init        # create config + .contextignore
sigmap               # generate context

# Daily use
sigmap               # one-shot regenerate
sigmap --watch       # live regeneration during development
sigmap --setup       # install git hook (run once per project)

# Measure
sigmap --report      # token savings
sigmap --health      # health grade (A–D)

# Focus
sigmap --diff        # only changed files
sigmap --diff --staged  # only staged files

# Check
sigmap --report --json  # CI-safe check (exits 1 if over budget)

# VS Code
⇧⌘P → "SigMap: Regenerate Context"   # regenerate
⇧⌘P → "SigMap: Open Context File"    # inspect context
# Status bar bottom-right: grade + age, click to regenerate
```

---

*SigMap for daily always-on context · Repomix for deep one-off sessions — [use both](https://github.com/yamadashy/repomix).*
