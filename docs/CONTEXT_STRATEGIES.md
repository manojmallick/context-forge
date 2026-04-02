# SigMap — Context Strategies

SigMap supports three output strategies controlled by the `"strategy"` key in
`gen-context.config.json`. Each trades off token cost, context completeness, and MCP
dependency differently. This guide explains when to use each one with concrete examples.

---

## Quick comparison

| Strategy | Always-injected tokens | Context lost? | Needs MCP? | Best for |
|---|---|---|---|---|
| `full` | ~4,000 (all files) | No | No | Default — all IDEs |
| `per-module` | ~100–300 (overview only) | No | No | Large codebases, module-focused work |
| `hot-cold` | ~200–800 (recent files only) | Cold files | Yes (for cold) | Claude Code / Cursor with MCP enabled |

---

## Strategy 1: `full` (default)

### What it does

One file. All signatures. Injected on every question.

```
.github/copilot-instructions.md   ← all 80 files, ~4,000 tokens, always injected
```

### When to use it

- **You are just getting started** — no configuration needed, works immediately.
- **Your codebase is under ~200 files** — the full signature set fits comfortably within
  the 6,000-token default budget.
- **You use GitHub Copilot Chat in VS Code** — Copilot reads `copilot-instructions.md`
  automatically; there is no mechanism to conditionally inject per-file.
- **You are not using MCP** — if your IDE does not support MCP tools, `full` ensures the
  model always has codebase context without any extra steps.
- **Cross-cutting questions are common** — "How does the web layer call the server auth
  API?" needs context from both modules at once; `full` always has it.

### Config

```json
{
  "strategy": "full",
  "maxTokens": 6000
}
```

No other keys are needed. This is the default — you can omit `"strategy"` entirely.

### Output files

```
.github/copilot-instructions.md   ← written on every run
```

### Token profile (arbi-platform example)

```
Input  (source files)  : ~77,551 tokens
Output (signatures)    :  ~3,980 tokens   ← 94.9% reduction
Injected every question:  ~3,980 tokens
```

### Reduce further without switching strategies

Lower the budget and SigMap will drop the lowest-priority files automatically:

```json
{
  "strategy": "full",
  "maxTokens": 2000,
  "diffPriority": true
}
```

With `diffPriority: true`, recently committed files are pinned and never dropped — only
old/untouched files are removed to meet the budget.

---

## Strategy 2: `per-module`

### What it does

One signature file per top-level `srcDir`, plus a tiny always-injected overview table.

```
.github/copilot-instructions.md     ← overview table only, ~100–300 tokens (always-on)
.github/context-server.md           ← all server/ signatures, ~2,000 tokens
.github/context-web.md              ← all web/ signatures,    ~600 tokens
.github/context-desktop.md          ← all desktop/ signatures, ~1,500 tokens
```

The IDE injects only the overview. The developer (or the model via MCP) loads the
relevant module file for detailed signatures.

### When to use it

- **Your codebase has 3–8 clearly separated modules** (e.g. `server/`, `web/`,
  `mobile/`, `infra/`) and most questions stay within one module.
- **You want zero context loss** — unlike `hot-cold`, every file always has a context
  file. Nothing is ever skipped.
- **MCP is not available** — `per-module` files are plain Markdown. You can reference
  them manually in your IDE context window without any tooling.
- **You work on one module per session** — open the module's `.md` file in your IDE
  context panel at the start of a session; you get full depth for ~600–2,000 tokens
  instead of 4,000.

### Config

```json
{
  "srcDirs": ["server", "web", "desktop"],
  "strategy": "per-module",
  "maxTokens": 6000
}
```

The per-module budget is `maxTokens ÷ number_of_modules`. With 3 modules and
`maxTokens: 6000`, each module gets up to 2,000 tokens — enough for a typical module.
Raise `maxTokens` to give each module more headroom:

```json
{
  "srcDirs": ["server", "web", "desktop", "infra", "shared"],
  "strategy": "per-module",
  "maxTokens": 12000
}
```

### Output files

```
.github/copilot-instructions.md     ← always written (overview)
.github/context-<module>.md         ← one per srcDir entry
```

### Token profile (arbi-platform example)

```
Always injected (overview)    :    ~117 tokens   ← every question
On-demand (server module)     :  ~2,140 tokens   ← when editing server/
On-demand (desktop module)    :  ~1,583 tokens   ← when editing desktop/
On-demand (web module)        :    ~335 tokens   ← when editing web/
Total coverage                :  ~4,058 tokens   ← vs ~3,980 full strategy
```

Effective per-question cost: **~117 + ~module tokens** instead of ~3,980.

### How to load a module file in your IDE

**VS Code / Copilot Chat** — drag `.github/context-server.md` into the chat context
panel, or use `#file:.github/context-server.md` in a prompt.

**Cursor** — add the module file to the context with `@file` or drag it into the
composer.

**Claude Code** — MCP `read_context({ module: "server" })` returns the signatures
automatically; or reference the file with `/file .github/context-server.md`.

### Cross-module questions

When a question spans two modules (e.g. "how does the web React component call the
server API?"), load both module files:

```
#file:.github/context-web.md
#file:.github/context-server.md
How does LoginForm submit its credentials?
```

The combined cost is `~335 + ~2,140 = ~2,475 tokens` — still cheaper than the `full`
strategy's flat ~3,980 tokens.

---

## Strategy 3: `hot-cold`

### What it does

Split output into two files based on git commit history:

- **Hot** → recently committed files → written to the primary output, auto-injected by
  the IDE on every question.
- **Cold** → everything else → written to `.github/context-cold.md`, retrieved on
  demand via MCP.

```
.github/copilot-instructions.md    ← HOT: files changed in last N commits (~400–800 tokens)
.github/context-cold.md            ← COLD: all other files (~2,000–3,500 tokens, MCP only)
```

### When to use it

- **You use Claude Code or Cursor with MCP enabled** — the model can call
  `read_context({ module: "..." })` to pull cold context exactly when it needs it.
  Without MCP the cold file is never seen by the model.
- **You are actively working in one area** — if you have touched 5 files in the last
  10 commits, those are hot. Everything else is cold. The model has full context for
  the area you are working in at almost zero token cost.
- **You want maximum token reduction on the always-injected context** — `hot-cold`
  injects the smallest possible slice (only what changed recently).
- **Your codebase has a stable core** — library code, generated files, migrations, old
  modules that are rarely touched. These naturally become cold and stay out of the
  injection stream.

### When NOT to use it

- **MCP is blocked or unavailable** — without MCP, cold files are completely invisible
  to the model. Use `full` or `per-module` instead.
- **You frequently jump between unrelated areas** — if today you edit `server/auth.py`
  but then need context from `web/checkout.tsx` which hasn't been touched in 3 weeks,
  the model will have no cold context unless it calls MCP.
- **You are debugging a regression in old code** — the buggy file may be cold.

### Config

```json
{
  "strategy": "hot-cold",
  "diffPriority": true,
  "hotCommits": 10
}
```

`hotCommits` controls how many recent git commits are considered "hot" (default: 10).
Raise it for longer-lived features; lower it to keep the hot set minimal:

```json
{
  "strategy": "hot-cold",
  "diffPriority": true,
  "hotCommits": 5
}
```

### Output files

```
.github/copilot-instructions.md    ← always written (hot files)
.github/context-cold.md            ← written alongside (cold files, MCP only)
```

### Token profile (arbi-platform example, 10 recent commits)

```
Hot  (auto-injected, 79 files) : ~3,700 tokens   ← active area of the project
Cold (MCP on-demand, 1 file)   :   ~363 tokens   ← stable/untouched
```

In a project where you work in a narrower active area (e.g. only `server/api/`):

```
Hot  (auto-injected, ~10 files) : ~400 tokens    ← just the files you changed
Cold (MCP on-demand, ~70 files) : ~3,500 tokens  ← rest of codebase via MCP
```

### MCP retrieval of cold context

When a question touches a cold file, the model (in Claude Code or Cursor) will call:

```json
{ "name": "read_context", "arguments": { "module": "server" } }
```

This returns signatures for the cold files in `server/`, adding ~200–800 tokens only
for that specific question. No cold files are injected on questions that don't need
them.

```bash
# Start MCP server (auto-started by Claude Code / Cursor after --setup)
node gen-context.js --mcp

# Manual retrieval test
echo '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"read_context","arguments":{"module":"server"}}}' \
  | node gen-context.js --mcp
```

---

## Choosing a strategy — decision tree

```
Do you use Claude Code or Cursor with MCP enabled?
├── Yes
│   ├── Do you frequently need context from recently-changed files only?
│   │   └── Yes → hot-cold  (smallest always-on footprint, MCP for the rest)
│   └── No, questions span many modules
│       └── per-module  (module files on demand, no context loss)
└── No (GitHub Copilot Chat, Windsurf, or MCP not available)
    ├── Does your codebase have clear module boundaries?
    │   └── Yes → per-module  (reference module files manually)
    └── No, or just getting started
        └── full  (default, works everywhere, zero config)
```

---

## Side-by-side scenario examples

### Scenario A: "Fix the login bug"

You recently edited `server/auth.py` and `server/routes.py`.

| Strategy | What the model sees | Tokens |
|---|---|---|
| `full` | All 80 files | ~3,980 |
| `per-module` | Overview + you load `context-server.md` | ~117 + ~2,140 = ~2,257 |
| `hot-cold` | Only recently changed files (includes auth.py) | ~400–800 |

**Winner for this scenario: `hot-cold`** — the exact files you need are already hot.

---

### Scenario B: "How does web checkout call the payment server?"

You haven't touched the payment module in 3 weeks. `web/Checkout.tsx` was edited yesterday.

| Strategy | What the model sees | Tokens |
|---|---|---|
| `full` | All 80 files including payment server | ~3,980 |
| `per-module` | Overview + load `context-web.md` + `context-server.md` | ~117 + ~335 + ~2,140 = ~2,592 |
| `hot-cold` (no MCP) | Only hot files — payment server is COLD, invisible | broken |
| `hot-cold` (with MCP) | Hot + model calls `read_context({ module: "server" })` | ~400 + ~2,140 = ~2,540 |

**Winner for this scenario: `per-module`** — no MCP needed, cross-module question handled gracefully.

---

### Scenario C: Daily active development, always using Claude Code with MCP

You make 5–10 commits per day, always in the same `server/api/` area.

| Strategy | Always-injected | Extra per question | Total |
|---|---|---|---|
| `full` | ~3,980 | — | ~3,980 every time |
| `per-module` | ~117 | +~2,140 (server) | ~2,257 when needed |
| `hot-cold` | ~400 (active files) | +~3,500 via MCP when needed | ~400 most of the time |

**Winner for this scenario: `hot-cold`** — ~90% fewer always-injected tokens. The model
retrieves the rest precisely when needed.

---

### Scenario D: New engineer onboarding — needs to understand the whole codebase

No recent commits. Needs context from every module.

| Strategy | Coverage | Tokens |
|---|---|---|
| `full` | Complete | ~3,980 |
| `per-module` | Complete (load all module files) | ~117 + ~4,058 = ~4,175 |
| `hot-cold` | Incomplete without MCP (cold files missing) | unpredictable |

**Winner for this scenario: `full`** — single file, complete picture, zero extra steps.

---

## Configuration reference

```json
{
  "_comment": "Context strategy — choose one",

  "strategy": "full",
  "_strategy_options": "'full' | 'per-module' | 'hot-cold'",

  "hotCommits": 10,
  "_hotCommits_note": "Only used by 'hot-cold'. Controls how many recent git commits count as hot.",

  "maxTokens": 6000,
  "_maxTokens_note": "Per-module: budget is divided equally across modules. hot-cold: applies to hot set."
}
```

All three strategies respect `secretScan`, `diffPriority`, `exclude`, and `.contextignore`.

---

## Mixing with other features

| Feature | `full` | `per-module` | `hot-cold` |
|---|---|---|---|
| `--routing` hints | ✅ appended to primary output | ✅ appended to overview | ✅ appended to hot |
| `--format cache` | ✅ writes cache JSON | ✅ for primary output | ✅ for hot output |
| `--track` / `--health` | ✅ | ✅ | ✅ |
| `--monorepo` | ✅ | ⚠️ per-module inside each package | ⚠️ hot-cold inside each package |
| MCP `read_context` | reads primary output | reads primary output | reads both hot + cold |
| MCP `search_signatures` | searches all files | searches all files | searches all files |

---

## Migration guide

### Switching from `full` to `per-module`

1. Add `"strategy": "per-module"` to `gen-context.config.json`
2. Run `node gen-context.js`
3. Note the new `.github/context-<module>.md` files created
4. Add the relevant module file to your IDE context window for focused sessions
5. Optional: add `.github/context-*.md` to `.gitignore` if you prefer not to commit them,
   or commit them so teammates can reference them too

### Switching from `full` to `hot-cold`

1. Ensure MCP is working: run `node gen-context.js --setup` to register the server
2. Add `"strategy": "hot-cold"` and optionally `"hotCommits": 10` to config
3. Run `node gen-context.js`
4. Verify output: `[sigmap] hot-cold: hot X files ... cold Y files`
5. Test MCP retrieval of cold context from your IDE

### Reverting to `full`

Set `"strategy": "full"` (or remove the `strategy` key entirely) and run
`node gen-context.js`. The module files and `context-cold.md` will remain on disk but
are no longer regenerated — delete them manually if desired.
