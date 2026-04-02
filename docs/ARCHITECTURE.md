# ContextForge — Architecture

This document explains how ContextForge is structured internally: how modules
connect, how data flows from source files to the final context output, and how
the zero-dependency bundle is assembled.

---

## High-level overview

```
Source files (your project)
        │
        ▼
  ┌─────────────┐
  │  config/    │  Load + merge gen-context.config.json with defaults
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ extractors/ │  21 language extractors — signatures only, no bodies
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  security/  │  Secret scanner — redact API keys, credentials
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  routing/   │  File complexity classifier — fast / balanced / powerful
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Token budget│  Drop lowest-priority files until output ≤ maxTokens
  └──────┬──────┘
         │
         ▼
  ┌──────────────────────────────────────┐
  │  Output writers                      │
  │  .github/copilot-instructions.md     │  (strategy: full / per-module / hot-cold)
  │  .github/context-<module>.md         │
  │  .github/context-cold.md             │
  │  .github/copilot-instructions.cache.json  (format: cache)
  └──────────────────────────────────────┘
         │
         ├──▶  tracking/logger.js   .context/usage.ndjson
         └──▶  health/scorer.js     composite 0-100 score
```

The MCP server (`src/mcp/`) is a separate runtime path — it does not participate
in the generation pipeline. It reads the files written by the pipeline on demand.

---

## Module map

```
src/
├── config/
│   ├── defaults.js     All default config keys with documentation comments
│   └── loader.js       Reads gen-context.config.json, merges with DEFAULTS,
│                       validates unknown keys
│
├── extractors/         21 language extractors (one per language/format)
│   ├── javascript.js
│   ├── typescript.js
│   ├── python.js
│   ├── java.js
│   ├── go.js
│   ├── rust.js
│   ├── cpp.js
│   ├── csharp.js
│   ├── kotlin.js
│   ├── swift.js
│   ├── dart.js
│   ├── scala.js
│   ├── ruby.js
│   ├── php.js
│   ├── shell.js
│   ├── dockerfile.js
│   ├── html.js
│   ├── css.js
│   ├── yaml.js
│   ├── svelte.js
│   └── vue.js
│
├── format/
│   └── cache.js        Wraps the markdown context in an Anthropic
│                       prompt-cache JSON block (format: 'cache')
│
├── health/
│   └── scorer.js       Reads usage.ndjson + context file mtime,
│                       returns { score, grade, ... }
│
├── map/
│   ├── import-graph.js Parses import/require statements to build a
│   │                   dependency graph (used by gen-project-map.js)
│   ├── class-hierarchy.js  Parses class extends chains across files
│   └── route-table.js  Detects Express/Hono/FastAPI route handlers
│
├── mcp/
│   ├── server.js       JSON-RPC 2.0 stdio server; reads stdin line-by-line,
│   │                   dispatches to handlers.js, writes responses to stdout
│   ├── handlers.js     Implements each MCP tool: read_context, search_signatures,
│   │                   get_map, create_checkpoint, get_routing
│   └── tools.js        Tool definitions (name, description, inputSchema)
│
├── routing/
│   ├── classifier.js   Assigns a complexity tier to each file:
│   │                   fast | balanced | powerful
│   └── hints.js        Model recommendation data per tier and task keyword
│
├── security/
│   ├── scanner.js      Runs pattern list against each signature; redacts matches
│   └── patterns.js     Regex patterns for API keys, AWS credentials, SSH keys,
│                       connection strings, passwords, etc.
│
└── tracking/
    └── logger.js       Appends one NDJSON line per run to .context/usage.ndjson:
                        { timestamp, rawTokens, finalTokens, reductionPct, ... }
```

---

## Data flow — generation pipeline

### Step 1 — Config

`src/config/loader.js` reads `gen-context.config.json` (if it exists) and
merges it over `DEFAULTS` from `defaults.js`. All pipeline steps receive this
merged config object.

### Step 2 — File discovery

`gen-context.js` walks the directories listed in `config.srcDirs`, respecting:
- `config.exclude` (always-excluded directories)
- `.contextignore` patterns (gitignore syntax)
- `.repomixignore` patterns (merged automatically if present)
- `config.maxDepth` recursion limit

Only files with a recognised extension are kept.

### Step 3 — Git priority sort

When `config.diffPriority: true`, recently committed files are moved to the
front of the file list. The sort uses `git log --name-only` output. Files that
don't appear in git history are sorted last. This ensures fresh changes are
always prominent and are the last to be dropped by the token budget.

### Step 4 — Extraction

Each file is dispatched to the matching extractor by extension. The extractor
contract is:

```javascript
function extract(src) → string[]
// Returns an array of signature strings (functions, classes, methods).
// Never throws. Returns [] on any error or empty input.
// Maximum 25 signatures per file.
// No bodies — nothing after the opening {.
// No comments, no imports.
```

Signatures are grouped under a `### path/to/file.ext` heading.

### Step 5 — Secret scanning

When `config.secretScan: true`, `src/security/scanner.js` runs every signature
string through the regex patterns in `patterns.js`. Any match is replaced with
`[REDACTED]`.

### Step 6 — Token budget enforcement

Tokens are estimated as `Math.ceil(chars / 4)` (standard ~4 chars/token
approximation).

If the total exceeds `config.maxTokens`, files are dropped from the **end** of
the sorted list (lowest git-priority first) until the budget is met. Files with
the most recent commits are never dropped first.

### Step 7 — Strategy output

Depending on `config.strategy`:

| Strategy | Output files | Always-injected tokens |
|---|---|---|
| `full` (default) | `.github/copilot-instructions.md` | ~4,000 (all sigs) |
| `per-module` | One `context-<module>.md` per srcDir + overview table | ~100–300 |
| `hot-cold` | `.github/copilot-instructions.md` (hot) + `context-cold.md` (cold) | ~200–800 |

For `hot-cold`, files appear in the hot set if they were touched in the last
`config.hotCommits` commits (default 10). Everything else goes to cold.

### Step 8 — Format sidecar

When `config.format: 'cache'`, `src/format/cache.js` writes a second file
alongside the markdown — `.github/copilot-instructions.cache.json` — containing
the same content wrapped in an Anthropic prompt-cache block:

```json
{
  "type": "text",
  "text": "... signatures ...",
  "cache_control": { "type": "ephemeral" }
}
```

### Step 9 — Tracking

When `config.tracking: true` (or `--track` flag), `src/tracking/logger.js`
appends a single NDJSON line to `.context/usage.ndjson`:

```json
{"timestamp":"...","rawTokens":42000,"finalTokens":2800,"reductionPct":93.3,"fileCount":120,"droppedCount":8,"overBudget":false}
```

---

## Data flow — MCP server

The MCP server is a separate runtime started with `node gen-context.js --mcp`.
It does not run the generation pipeline. It reads the files already written to
disk.

```
AI tool (Claude Code / Cursor)
        │  JSON-RPC 2.0 over stdio
        ▼
  src/mcp/server.js
        │  dispatches by method name
        ▼
  src/mcp/handlers.js
        │
        ├── read_context      reads .github/copilot-instructions.md
        │                     (optionally filters to a module path)
        ├── search_signatures reads same file, does case-insensitive match
        ├── get_map           reads PROJECT_MAP.md (requires gen-project-map.js)
        ├── create_checkpoint reads git log + context file; returns snapshot
        └── get_routing       reads routing hints from src/routing/hints.js
```

**No in-memory state.** Every tool call reads fresh files from disk, so the
server always serves the latest generated context without restart.

---

## Data flow — gen-project-map.js

`gen-project-map.js` is a separate script (not bundled into the main entry).
It uses the `src/map/` modules to write `PROJECT_MAP.md` with three sections:

1. **Import graph** (`src/map/import-graph.js`) — which files import which
2. **Class hierarchy** (`src/map/class-hierarchy.js`) — inheritance chains
3. **Route table** (`src/map/route-table.js`) — HTTP endpoints and handlers

Run it once to generate `PROJECT_MAP.md`, then the `get_map` MCP tool can serve
its sections on demand.

---

## Bundle architecture

The repository ships both a **source tree** (`src/`) and a **pre-built
standalone bundle** (`gen-context.js`).

```
src/          ← modular source files (edit these)
     │
     └──▶  scripts/bundle.js  ──▶  gen-context.js  (the standalone bundle)
```

`scripts/bundle.js` does the following:

1. Collects all `.js` files under `src/` and assigns each a canonical key
   (e.g. `./src/config/loader`).
2. Rewrites every `require('./...')` call inside those files to
   `__require('./src/...')`.
3. Wraps each module in a factory function registered in `__factories`.
4. Prepends a tiny module loader (`__require`) that evaluates factories on first
   call and caches exports.
5. Appends the main `gen-context.js` entry with its own requires patched to
   the same `__require` calls.

The result is a **single file with zero external dependencies** — copy
`gen-context.js` to any machine with Node.js 18+ and it works immediately.

**Important:** Edit files in `src/`, not in `gen-context.js` directly.
After editing, run `node scripts/bundle.js` to regenerate the standalone file.

---

## Health scoring

`src/health/scorer.js` produces a composite 0–100 score from three signals:

| Signal | Penalty |
|---|---|
| Days since last regeneration > 7 | −4 pts per extra day |
| Average token reduction < 60% | −20 pts |
| Over-budget run rate > 20% | −20 pts |

Grades: A (≥90), B (≥75), C (≥60), D (<60).

The scorer reads `.context/usage.ndjson` for run history and the mtime of
`.github/copilot-instructions.md` for staleness.

---

## Model routing classifier

`src/routing/classifier.js` assigns each file a complexity tier:

| Rule | Tier |
|---|---|
| Extension is config/markup/script (`.json`, `.yml`, `.html`, `.sh`, ...) | `fast` |
| Path contains `auth`, `crypto`, `security`, `core`, `payment` | `powerful` |
| File has ≥ 12 exported signatures | `powerful` |
| File has ≥ 8 class methods | `powerful` |
| Everything else | `balanced` |

`src/routing/hints.js` maps task keywords to tier recommendations, which
`--suggest-tool` uses at the CLI and `get_routing` exposes via MCP.

---

## Output targets

The `outputs` config key controls which files are written. Each target writes
to a conventional path that the corresponding AI tool reads automatically:

| Target | Output path | Read by |
|---|---|---|
| `copilot` (default) | `.github/copilot-instructions.md` | GitHub Copilot in VS Code |
| `claude` | `CLAUDE.md` | Claude Code (project root) |
| `cursor` | `.cursor/rules` | Cursor IDE |
| `windsurf` | `.windsurf/rules` | Windsurf IDE |

Configure multiple targets at once:

```json
{ "outputs": ["copilot", "claude", "cursor"] }
```

---

## Testing infrastructure

```
test/
├── run.js                Zero-dependency test runner (no Jest, no Mocha)
├── fixtures/             One representative source file per language
├── expected/             Expected extractor output per language
│                         (regenerate with: node test/run.js --update)
└── integration/          13 integration test suites, 156 tests total
    ├── config-loader.test.js
    ├── system.test.js        --suggest-tool, --health
    ├── cache.test.js         Anthropic cache JSON format
    ├── contextignore.test.js .contextignore + .repomixignore patterns
    ├── mcp-server.test.js    JSON-RPC protocol, tool dispatch, error handling
    ├── monorepo.test.js      Per-package detection and output
    ├── multi-output.test.js  Multiple output targets
    ├── observability.test.js Tracking, NDJSON log, --report --history
    ├── project-map.test.js   Import graph, class hierarchy, route table
    ├── routing.test.js       Classifier, tier assignment, model hints
    ├── secret-scan.test.js   Pattern detection and redaction
    └── token-budget.test.js  Budget enforcement and file dropping
```

**Run all tests:** `node test/run.js` → must be 177/177 PASS before any PR.

---

## Key invariants

- **Never throw.** Every extractor catches all errors and returns `[]`. The
  pipeline catches per-file failures and skips the file silently.
- **Zero npm dependencies.** The bundle uses only Node.js built-ins:
  `fs`, `path`, `os`, `crypto`, `child_process`, `readline`, `assert`.
- **No network calls.** ContextForge never phones home.
- **Deterministic output.** Given the same source files and config, the output
  is identical across runs (git priority sort aside).
- **Edit `src/`, not `gen-context.js`.** The bundle is generated; the source
  is authoritative.
