<div align="center">

<h1>⚡ SigMap</h1>

<p><strong>Zero-dependency AI context engine — 97% token reduction</strong></p>

<p>
  Every coding agent session starts with full codebase context at under 4K tokens.<br>
  No <code>npm install</code>. No setup. Runs on any machine with Node.js 18+.
</p>

<!-- Status -->
[![npm version](https://img.shields.io/npm/v/sigmap?color=7c6af7&label=latest&logo=npm)](https://www.npmjs.com/package/sigmap)
[![Tests](https://img.shields.io/badge/tests-340%20passing-22c55e)](https://github.com/manojmallick/sigmap/tree/main/test)
[![Zero deps](https://img.shields.io/badge/dependencies-zero-22c55e)](package.json)
[![Last commit](https://img.shields.io/github/last-commit/manojmallick/sigmap?color=7c6af7)](https://github.com/manojmallick/sigmap/commits/main)

<!-- Meta -->
[![License: MIT](https://img.shields.io/badge/License-MIT-7c6af7.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![npm](https://img.shields.io/badge/npm-sigmap-cb3837?logo=npm)](https://www.npmjs.com/package/sigmap)
[![GitHub Stars](https://img.shields.io/github/stars/manojmallick/sigmap?style=flat&color=f59e0b&logo=github)](https://github.com/manojmallick/sigmap/stargazers)

<!-- Links -->
[![Docs](https://img.shields.io/badge/docs-live-7c6af7?logo=github-pages)](https://manojmallick.github.io/sigmap)
[![Changelog](https://img.shields.io/badge/changelog-CHANGELOG.md-blue)](CHANGELOG.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![VS Code](https://img.shields.io/badge/VS%20Code-extension-0078d4?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=manojmallick.sigmap)
[![Open VSX](https://img.shields.io/open-vsx/v/manojmallick/sigmap?color=a251e3&label=Open%20VSX&logo=vscodium)](https://open-vsx.org/extension/manojmallick/sigmap)

</div>

---

## Table of contents

| | |
|---|---|
| [What it does](#-what-it-does) | Token reduction table, pipeline overview |
| [Quick start](#-quick-start) | Get running in 60 seconds |
| [VS Code extension](#-vs-code-extension) | Status bar, stale alerts, commands |
| [Languages supported](#-languages-supported) | 21 languages |
| [Context strategies](#-context-strategies) | full / per-module / hot-cold |
| [MCP server](#-mcp-server) | 8 on-demand tools |
| [CLI reference](#-cli-reference) | All flags |
| [Configuration](#-configuration) | Config file + .contextignore |
| [Observability](#-observability) | Health score, reports, CI |
| [Testing](#-testing) | Run the test suite |
| [Project structure](#-project-structure) | File-by-file map |
| [Principles](#-principles) | Design decisions |

> 📖 **New to SigMap?** Read the **[Complete Getting Started Guide](docs/GETTING_STARTED.md)** — token savings walkthrough, every command, VS Code plugin, and CI setup.

---

## 🔍 What it does

SigMap scans your source files and extracts only the **function and class signatures** — no bodies, no imports, no comments — then writes a compact context file that Copilot, Claude, Cursor, and Windsurf read automatically. Every session starts with full codebase awareness at a fraction of the token cost.

```
Your codebase
    │
    ▼
gen-context.js ──► extracts signatures from 21 languages
    │
    ▼
.github/copilot-instructions.md   ◄── auto-read by Copilot / Claude / Cursor
    │
    ▼
AI agent session starts with full context
```

> **Dogfooding:** SigMap runs on itself — 40 JS files, 8,600 lines of code.
> View the generated context: [`.github/copilot-instructions.md`](.github/copilot-instructions.md)

### Token reduction at every stage

| Stage | Tokens | Reduction |
|---|---:|---:|
| Raw source files | ~80,000 | — |
| Repomix compressed | ~8,000 | 90% |
| **SigMap signatures** | **~4,000** | **95%** |
| SigMap + MCP (`hot-cold`) | ~200 | **99.75%** |

> **97% fewer tokens. The same codebase understanding.**

---

## 🆕 What's new in 2.4

| Feature | Description |
|---|---|
| **Programmatic API** | `require('sigmap')` — use `extract`, `rank`, `buildSigIndex`, `scan`, `score` directly, no CLI subprocess |
| **`packages/core/`** | New `sigmap-core` package with stable API surface for third-party integrations |
| **`packages/cli/`** | Thin `sigmap-cli` forward-compat shim for the v3.0 adapter architecture |
| **15 new tests** | `core-api.test.js` covers all exported functions, edge cases, and backward compat |

## 🆕 What's new in 2.3

| Feature | Description |
|---|---|
| **`--query "<text>"` CLI** | Rank all context files by relevance to a free-text query — scored table + top-3 signature blocks |
| **`--query --json`** | Machine-readable ranked results (`{ query, results[], totalResults }`) |
| **`--query --top <n>`** | Limit results (default 10, configurable via `retrieval.topK`) |
| **`query_context` MCP tool** | 8th MCP tool — `{ query, topK? }` returns ranked file list, usable live in any MCP session |
| **`--analyze` / `--diagnose-extractors`** | Per-file breakdown of sigs/tokens/extractor/coverage; self-tests all 21 extractors (v2.2) |
| **`--benchmark` / `--eval`** | Measure hit@5 and MRR retrieval quality against a JSONL task file (v2.1) |

> **Previous v2.0 additions:** enriched signatures, dependency map, TODO/FIXME section, test coverage markers, structural diff mode, impact radius hints. See [CHANGELOG.md](CHANGELOG.md) for the full history.

---

## 🔭 What's next — v2.5-v2.6 (in progress · [#14](https://github.com/manojmallick/sigmap/issues/14) · [#16](https://github.com/manojmallick/sigmap/issues/16))

### v2.6 — Research Mode

| Feature | Description |
|---|---|
| **`--benchmark --repo <path>`** | Run benchmarks against any external repository (express, flask, gin, spring-petclinic, rails) |
| **`--report --paper`** | Generate paper-ready metrics: markdown + LaTeX tables for academic publishing |
| **50 real eval tasks** | JSONL task file covering 5 real open-source repos — `benchmarks/tasks/retrieval-real.jsonl` |
| **`src/eval/paper.js`** | Zero-dependency LaTeX table formatter for token reduction, hit@5, MRR, latency (p50/p95/p99) |
| **8 new tests** | `paper.test.js` — report generation, LaTeX syntax validation, graceful failures |

### v2.5 — Impact Layer

| Feature | Description |
|---|---|
| **`--impact <file>`** | Show every file that transitively depends on a changed file — instant blast-radius awareness |
| **`--impact --json`** | Machine-readable output for CI pipelines |
| **`get_impact` MCP tool** | 9th MCP tool — `{ file, depth? }` → impacted files + signatures |
| **`src/map/dep-graph.js`** | Reverse-dependency graph built from the import analysis; circular deps handled safely |
| **15 new tests** | `impact.test.js` — direct deps, transitive deps, depth limit, JSON output |

---

## 🚀 Quick start

**No install required — just Node.js 18+.**

```bash
# 1. Copy gen-context.js into your project root
curl -O https://raw.githubusercontent.com/manojmallick/sigmap/main/gen-context.js

# 2. Generate your context file
node gen-context.js

# 3. Output: .github/copilot-instructions.md
# That file is auto-read by GitHub Copilot in VS Code
```

Or via npm (globally):

```bash
npx sigmap          # run once without installing
npm install -g sigmap   # install globally
sigmap              # then use anywhere
```

### Common workflows

```bash
node gen-context.js              # generate once and exit
node gen-context.js --watch      # regenerate on every file save
node gen-context.js --setup      # generate + install git hook + start watcher
node gen-context.js --diff       # context for git-changed files only (PR mode)
node gen-context.js --diff --staged  # staged files only (pre-commit check)
node gen-context.js --health     # show context health score (grade A–D)
node gen-context.js --mcp        # start MCP server on stdio
```

### Companion tool: Repomix

SigMap and [Repomix](https://github.com/yamadashy/repomix) are **complementary, not competing**:

| Tool | When to use |
|---|---|
| **SigMap** | Always-on, git hooks, daily signature index (~4K tokens) |
| **Repomix** | On-demand deep sessions, full file content, broader language support |

```bash
node gen-context.js --setup    # always-on context
npx repomix --compress         # deep dive sessions
```

*"SigMap for daily always-on context; Repomix for deep one-off sessions — use both."*

---

## 🧩 VS Code extension

> Introduced in v1.5 — zero runtime npm dependencies.

The `vscode-extension/` directory contains a first-party VS Code extension that keeps you informed without any manual commands.

| Feature | Detail |
|---|---|
| **Status bar item** | Shows health grade (`A`/`B`/`C`/`D`) + time since last regen; refreshes every 60 s |
| **Stale notification** | Warns when `copilot-instructions.md` is > 24 h old; one-click regeneration |
| **Regenerate command** | `SigMap: Regenerate Context` — runs `node gen-context.js` in the integrated terminal |
| **Open context command** | `SigMap: Open Context File` — opens `.github/copilot-instructions.md` |
| **Script path setting** | `sigmap.scriptPath` — override when `gen-context.js` is not at the project root |

Activate on startup (`onStartupFinished`) — loads within 3 s, never blocks editor startup.

---

## 🌐 Languages supported

> 21 languages. All implemented with zero external dependencies — pure regex + Node built-ins.

<details>
<summary><strong>Show all 21 languages</strong></summary>

| Language | Extensions | Extracts |
|---|---|---|
| TypeScript | `.ts` `.tsx` | interfaces, classes, functions, types, enums |
| JavaScript | `.js` `.jsx` `.mjs` `.cjs` | classes, functions, exports |
| Python | `.py` `.pyw` | classes, methods, functions |
| Java | `.java` | classes, interfaces, methods |
| Kotlin | `.kt` `.kts` | classes, data classes, functions |
| Go | `.go` | structs, interfaces, functions |
| Rust | `.rs` | structs, impls, traits, functions |
| C# | `.cs` | classes, interfaces, methods |
| C/C++ | `.cpp` `.c` `.h` `.hpp` `.cc` | classes, functions, templates |
| Ruby | `.rb` `.rake` | classes, modules, methods |
| PHP | `.php` | classes, interfaces, functions |
| Swift | `.swift` | classes, structs, protocols, functions |
| Dart | `.dart` | classes, mixins, functions |
| Scala | `.scala` `.sc` | objects, classes, traits, functions |
| Vue | `.vue` | `<script>` functions and components |
| Svelte | `.svelte` | `<script>` functions and exports |
| HTML | `.html` `.htm` | custom elements and script functions |
| CSS/SCSS | `.css` `.scss` `.sass` `.less` | custom properties and keyframes |
| YAML | `.yml` `.yaml` | top-level keys and pipeline jobs |
| Shell | `.sh` `.bash` `.zsh` `.fish` | function declarations |
| Dockerfile | `Dockerfile` `Dockerfile.*` | stages and key instructions |

</details>

---

## 🗂 Context strategies

> Introduced in v1.1. Reduce always-injected tokens by 70–90%.

Set `"strategy"` in `gen-context.config.json`:

| Strategy | Always-injected | Context lost? | Needs MCP? | Best for |
|---|---:|:---:|:---:|---|
| `full` | ~4,000 tokens | No | No | Starting out, cross-module work |
| `per-module` | ~100–300 tokens | No | No | Large codebases, module-focused sessions |
| `hot-cold` | ~200–800 tokens | Cold files only | Yes | Claude Code / Cursor with MCP enabled |

### `full` — default, works everywhere

```json
{ "strategy": "full" }
```

One file, all signatures, always injected on every question.

### `per-module` — 70% fewer injected tokens, zero context loss

```json
{ "strategy": "per-module" }
```

One `.github/context-<module>.md` per top-level source directory, plus a tiny overview table. Load the relevant module file for focused sessions. No MCP required.

```
.github/copilot-instructions.md   ← overview table, ~117 tokens (always-on)
.github/context-server.md         ← server/ signatures, ~2,140 tokens
.github/context-web.md            ← web/ signatures,    ~335 tokens
.github/context-desktop.md        ← desktop/ signatures, ~1,583 tokens
```

### `hot-cold` — 90% fewer injected tokens, requires MCP

```json
{ "strategy": "hot-cold", "hotCommits": 10 }
```

Recently committed files are **hot** (auto-injected). Everything else is **cold** (on-demand via MCP). Best reduction available — ~200 tokens always-on.

📖 Full guide: [docs/CONTEXT_STRATEGIES.md](docs/CONTEXT_STRATEGIES.md) — decision tree, scenario comparisons, migration steps.

---

## 🔌 MCP server

> Introduced in v0.3, expanded to 8 tools through v2.3.

Start the MCP server on stdio:

```bash
node gen-context.js --mcp
```

### Available tools

| Tool | Input | Output |
|---|---|---|
| `read_context` | `{ module?: string }` | Signatures for one module or entire codebase |
| `search_signatures` | `{ query: string }` | Matching signatures with file paths |
| `get_map` | `{ type: "imports"\|"classes"\|"routes" }` | Structural section from `PROJECT_MAP.md` |
| `explain_file` | `{ path: string }` | Signatures + imports + reverse callers for one file |
| `list_modules` | — | Token-count table of all top-level module directories |
| `create_checkpoint` | `{ summary: string }` | Write a session checkpoint to `.context/` |
| `get_routing` | — | Full model routing table |
| `query_context` | `{ query: string, topK?: number }` | Files ranked by relevance to the query (v2.3) |

Reads files on every call — no stale state, no restart needed.

📖 Setup guide: [docs/MCP_SETUP.md](docs/MCP_SETUP.md)

---

## ⚙️ CLI reference

> All flags live in v1.5. See [CHANGELOG.md](CHANGELOG.md) for when each shipped.

```
node gen-context.js                           Generate once and exit
node gen-context.js --watch                   Generate and watch for file changes
node gen-context.js --setup                   Generate + install git hook + start watcher
node gen-context.js --diff                    Generate context for git-changed files only
node gen-context.js --diff --staged           Staged files only (pre-commit check)
node gen-context.js --mcp                     Start MCP server on stdio

node gen-context.js --query "<text>"          Rank files by relevance to a query
node gen-context.js --query "<text>" --json   Ranked results as JSON
node gen-context.js --query "<text>" --top <n> Limit results to top N files (default 10)

node gen-context.js --analyze                 Per-file breakdown (sigs / tokens / extractor / coverage)
node gen-context.js --analyze --json          Analysis as JSON
node gen-context.js --analyze --slow          Include extraction timing per file
node gen-context.js --diagnose-extractors     Self-test all 21 extractors against fixtures

node gen-context.js --benchmark               Run retrieval quality benchmark (hit@5 / MRR)
node gen-context.js --benchmark --json        Benchmark results as JSON
node gen-context.js --eval                    Alias for --benchmark

node gen-context.js --report                  Token reduction stats
node gen-context.js --report --json           Structured JSON report (exits 1 if over budget)
node gen-context.js --report --history        Usage log summary
node gen-context.js --report --history --json Usage history as JSON

node gen-context.js --health                  Composite health score (0–100, grade A–D)
node gen-context.js --health --json           Machine-readable health JSON

node gen-context.js --suggest-tool "<task>"   Recommend model tier for a task
node gen-context.js --suggest-tool "<task>" --json  Machine-readable tier recommendation

node gen-context.js --monorepo                Per-package context for monorepos
node gen-context.js --routing                 Include model routing hints in output
node gen-context.js --format cache            Write Anthropic prompt-cache JSON
node gen-context.js --track                   Append run metrics to .context/usage.ndjson

node gen-context.js --init                    Write config + .contextignore scaffold
node gen-context.js --version                 Version string
node gen-context.js --help                    Usage information
```

### Task classification — `--suggest-tool`

```bash
node gen-context.js --suggest-tool "security audit of the auth module"
# tier   : powerful
# models : claude-opus-4-6, gpt-5-4, gemini-2-5-pro

node gen-context.js --suggest-tool "fix a typo in the yaml config" --json
# {"tier":"fast","label":"Fast (low-cost)","models":"claude-haiku-4-5, ...","costHint":"~$0.0008 / 1K tokens"}
```

Tiers: `fast` (config/markup/typos) · `balanced` (features/tests/debug) · `powerful` (architecture/security/multi-file)

---

## 🔒 Security scanning

SigMap automatically redacts secrets from all extracted signatures. Ten patterns are checked on every file:

| Pattern | Example match |
|---|---|
| AWS Access Key | `AKIA...` |
| AWS Secret Key | 40-char base64 |
| GCP API Key | `AIza...` |
| GitHub Token | `ghp_...` `gho_...` |
| JWT | `eyJ...` |
| DB Connection String | `postgres://user:pass@...` |
| SSH Private Key | `-----BEGIN ... PRIVATE KEY-----` |
| Stripe Key | `sk_live_...` `sk_test_...` |
| Twilio Key | `SK[32 hex chars]` |
| Generic secret | `password = "..."`, `api_key: "..."` |

If a match is found, the signature is replaced with `[REDACTED — {pattern} detected in {file}]`. The run continues — no silent failures.

---

## ⚙️ Configuration

Copy `gen-context.config.json.example` to `gen-context.config.json`:

```json
{
  "srcDirs": ["src", "app", "lib"],
  "maxTokens": 6000,
  "outputs": ["copilot"],
  "secretScan": true,
  "strategy": "full",
  "watchDebounce": 300,
  "tracking": false
}
```

Exclusions go in `.contextignore` (gitignore syntax). Also reads `.repomixignore` if present.

```
# .contextignore
node_modules/
dist/
build/
*.generated.*
test/fixtures/
```

Run `node gen-context.js --init` to scaffold both files in one step.

### Output targets

| Key | Output file | Read by |
|---|---|---|
| `"copilot"` | `.github/copilot-instructions.md` | GitHub Copilot |
| `"claude"` | `CLAUDE.md` (appends below marker) | Claude Code |
| `"cursor"` | `.cursorrules` | Cursor |
| `"windsurf"` | `.windsurfrules` | Windsurf |

---

## 📊 Observability

```bash
# Append run metrics to .context/usage.ndjson
node gen-context.js --track

# Structured JSON report for CI (exits 1 if over budget)
node gen-context.js --report --json
# { "version": "2.0.0", "finalTokens": 3200, "reductionPct": 92.4, "overBudget": false }

# Composite health score
node gen-context.js --health
# score: 95/100 (grade A) | reduction: 91.2% | 1 day since regen | 47 runs
```

### Self-healing CI

Copy `examples/self-healing-github-action.yml` to `.github/workflows/` to auto-regenerate context when:
- Context file is more than 7 days old (always active)
- Copilot acceptance rate drops below 30% (requires `COPILOT_API_TOKEN` — GitHub Enterprise)

```yaml
- name: SigMap health check
  run: node gen-context.js --health --json
- name: Regenerate context
  run: node gen-context.js
```

📖 Full guide: [docs/ENTERPRISE_SETUP.md](docs/ENTERPRISE_SETUP.md)

### Prompt caching — 60% API cost reduction

```bash
node gen-context.js --format cache
# Writes: .github/copilot-instructions.cache.json
# Format: { type: 'text', text: '...', cache_control: { type: 'ephemeral' } }
```

📖 Full guide: [docs/REPOMIX_CACHE.md](docs/REPOMIX_CACHE.md)

---

## 📦 Programmatic API (v2.4+)

Use SigMap as a library — no CLI subprocess needed:

```js
const { extract, rank, buildSigIndex, scan, score } = require('sigmap');

// Extract signatures from source code
const sigs = extract('function hello() {}', 'javascript');

// Build an index and rank files by query
const index = buildSigIndex('/path/to/project');
const results = rank('authentication middleware', index);

// Scan signatures for secrets before storing
const { safe, redacted } = scan(sigs, 'src/config.ts');

// Get a composite health score for a project
const health = score('/path/to/project');
```

📖 Full API reference: [packages/core/README.md](packages/core/README.md)

---

## 🧪 Testing

```bash
# All 21 language extractors
node test/run.js

# Single language
node test/run.js typescript

# Regenerate expected outputs after extractor changes
node test/run.js --update

# Full integration suite
node test/integration/all.js
```

### Validation gates

```bash
# Gate 1 — all tests pass
node test/run.js
# Expected: 21/21 PASS

# Gate 2 — zero external dependencies
grep "require(" gen-context.js | grep -v "^.*//.*require"
# Expected: only fs, path, assert, os, crypto, child_process, readline

# Gate 3 — MCP server responds correctly
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node gen-context.js --mcp
# Expected: valid JSON with 8 tools

# Gate 4 — npm artifact is clean
npm pack --dry-run
# Expected: no test/, docs/, vscode-extension/ in output
```

---

## 📁 Project structure

```
sigmap/
│
├── gen-context.js               ← PRIMARY ENTRY POINT — single file, zero deps
├── gen-project-map.js           ← import graph, class hierarchy, route table
│
├── packages/
│   ├── core/                    ← programmatic API — require('sigmap') (v2.4)
│   │   └── index.js             ← extract, rank, buildSigIndex, scan, score
│   └── cli/                     ← thin CLI wrapper / v3 compat shim (v2.4)
│
├── src/
│   ├── extractors/              ← 21 language extractors (one file per language)
│   ├── retrieval/               ← query-aware ranker + tokenizer (v2.3)
│   ├── eval/                    ← benchmark runner + scorer (v2.1), analyzer (v2.2)
│   ├── mcp/                     ← MCP stdio server — 8 tools
│   ├── security/                ← secret scanner — 10 patterns
│   ├── routing/                 ← model routing hints
│   ├── tracking/                ← NDJSON usage logger
│   ├── health/                  ← composite health scorer
│   ├── format/                  ← Anthropic prompt-cache formatter
│   └── config/                  ← config loader + defaults
│
├── vscode-extension/            ← VS Code extension (v1.5)
│   ├── package.json             ← manifest — commands, settings, activation
│   └── src/extension.js         ← status bar, stale notification, commands
│
├── test/
│   ├── fixtures/                ← one source file per language
│   ├── expected/                ← expected extractor output
│   ├── run.js                   ← zero-dep test runner
│   └── integration/             ← 20 integration test files (304 tests)
│
├── docs/                        ← documentation site (GitHub Pages)
│   ├── index.html               ← homepage
│   ├── quick-start.html
│   ├── strategies.html
│   ├── languages.html
│   ├── roadmap.html
│   └── repomix.html
│
├── scripts/
│   ├── ci-update.sh             ← CI pipeline helper
│   └── release.sh               ← version bump + npm publish helper
│
├── examples/
│   ├── self-healing-github-action.yml
│   ├── github-action.yml            ← ready-to-use CI workflow
│   └── claude-code-settings.json    ← MCP server config example
│
├── .npmignore                   ← excludes docs/, test/, vscode-extension/ from publish
├── .contextignore.example       ← exclusion template
└── gen-context.config.json.example ← annotated config reference
```

---

## 🏗 Principles

| Principle | Implementation |
|---|---|
| **Zero npm dependencies** | `node gen-context.js` on a blank machine with Node 18+ — nothing else required |
| **Never throw** | All extractors return `[]` on any error — the run always completes |
| **Deterministic** | No AI or LLM involved in extraction — only regex + Node built-ins |
| **Repomix is a companion** | Use both tools; SigMap never replaces Repomix |
| **No telemetry** | Never phones home; all state is files in your repo |
| **Local-first** | No cloud service, no database, no accounts |

---

## 📦 Publishing to npm

Releases are published automatically via GitHub Actions whenever a version tag is pushed.

### One-time setup

1. **Create an npm account** at [npmjs.com](https://www.npmjs.com) (if you haven't already).

2. **Generate an npm access token**:
   - npmjs.com → Account → Access Tokens → Generate New Token → **Granular Access Token** (or Classic Automation token)
   - Scope: `sigmap` package, permission: **Read and Write**

3. **Add the secret to GitHub**:
   ```
   GitHub repo → Settings → Secrets and variables → Actions → New repository secret
   Name:  NPM_TOKEN
   Value: <paste token>
   ```

### Releasing a new version

```bash
# 1. Bump version in package.json
npm version patch   # or minor / major

# 2. Push the commit AND the new tag
git push && git push --tags
```

The [npm-publish workflow](.github/workflows/npm-publish.yml) will:
1. Run the full test suite
2. Verify `package.json` version matches the pushed tag
3. Publish to npm with provenance attestation
4. Create a GitHub Release with auto-generated notes

### Backfilling historical versions

Tags that existed before the workflow was set up can be published retroactively:

```bash
# Dry run first — see what would be published
./scripts/backfill-npm.sh

# Actually publish all historical tags
export NPM_TOKEN=npm_xxxxxxxxxxxx
./scripts/backfill-npm.sh --publish

# Start from a specific tag
./scripts/backfill-npm.sh --publish --from v0.5.0
```

The script assigns `dist-tag: legacy` to all versions except `v1.5.0` (which gets `latest`), so `npm install sigmap` always resolves to the current release.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a language extractor or new feature.

Every extractor follows the same contract:

```javascript
module.exports = { extract };
function extract(src) {   // src: string → string[]
  if (!src || typeof src !== 'string') return [];
  // ... regex extraction only — no external dependencies ...
  return sigs.slice(0, 25);  // never more than 25 signatures per file
}
```

---

## ⭐ Support

If SigMap saves you context or API spend, a ⭐ on [GitHub](https://github.com/manojmallick/sigmap) helps others find it.

---

## 📄 License

MIT © 2026 [Manoj Mallick](https://github.com/manojmallick) · Made in Amsterdam 🇳🇱

---

<div align="center">

If SigMap saves you time — a ⭐ on [GitHub](https://github.com/manojmallick/sigmap) helps others find it.

**[Docs](https://manojmallick.github.io/sigmap) · [Changelog](CHANGELOG.md) · [Roadmap](docs/roadmap.html) · [Repomix](https://github.com/yamadashy/repomix)**

</div>
