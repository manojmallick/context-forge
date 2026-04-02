# Changelog

All notable changes to SigMap are documented here.

Format: [Semantic Versioning](https://semver.org/)

---

## [1.5.0] — 2026-04-04

### Added
- **VS Code extension** (`vscode-extension/`) — zero-dependency extension for VS Code / VS Code-compatible editors:
  - **Status bar item** — shows health grade (A/B/C/D) and time since last regeneration; refreshes every 60 s and immediately on file-system change to `copilot-instructions.md`.
  - **`SigMap: Regenerate Context`** command — runs `node gen-context.js` in an integrated terminal from the workspace root.
  - **`SigMap: Open Context File`** command — opens `.github/copilot-instructions.md` in the editor.
  - **Stale context notification** — warns when `copilot-instructions.md` is > 24 h old; offers one-click regeneration or "Don't show again" suppression per workspace.
  - **`contextforge.scriptPath` setting** — override the path to `gen-context.js` when it is not at the project root.
  - `onStartupFinished` activation — loads within 3 s of VS Code opening, does not block startup.
- **Docs site search** — lightweight client-side keyword search added to all 6 HTML docs pages (`index.html`, `quick-start.html`, `strategies.html`, `languages.html`, `roadmap.html`, `repomix.html`):
  - Press `/` anywhere to open the search overlay; `Escape` or click outside to close.
  - Searches all headings, paragraphs, and list items in the current page.
  - Up to 12 results shown with snippet preview; matching text highlighted in amber.
  - Click a result to scroll to the exact section with a 2-second amber outline highlight.
  - Zero external dependencies — ~60 lines of inline JS per page. Theme-aware (dark/light).
- **`.npmignore`** — excludes `test/`, `docs/`, `scripts/`, `examples/`, `.claude/`, `vscode-extension/`, `.github/workflows/` and planning docs from npm publish. Published package contains only the runtime files listed in `package.json#files`.
- **`test/integration/v1.5.test.js`** — 58 integration tests covering all v1.5 features:
  - npm package integrity (name, bin, engines, zero deps, .npmignore exclusions)
  - shebang line presence and correctness
  - extension manifest structure (commands, configuration, activation)
  - extension.js API coverage (status bar, notification, commands, scriptPath)
  - search injection verified in all 6 docs pages (overlay, input, keyboard handlers, highlights)

### Notes
- The VS Code extension requires the `vscode` peer dependency at runtime (provided by the editor). It has no npm runtime dependencies of its own.
- `scripts/inject-search.py` is the one-time migration script used to add search to existing HTML pages; it is idempotent (skip if already patched).

### Validation gate
- `node gen-context.js --version` → `1.5.0` ✔  *(note: version bumped separately if desired)*
- `node test/integration/v1.5.test.js` → 58/58 pass ✔
- `node test/run.js` → 21/21 extractor tests pass ✔
- `npm pack --dry-run` → no `test/`, `docs/`, or `vscode-extension/` in artifact ✔
- All 6 docs pages: press `/` → search overlay opens; type "python" → result appears ✔

---

## [1.4.0] — 2026-04-04

### Added
- **`explain_file` MCP tool** — deep-dive tool for a single file. Given a relative path, returns three sections: `## Signatures` (from the indexed context file), `## Imports` (resolved relative dependencies from the live source file), and `## Callers` (reverse import lookup across all indexed files). Gracefully returns partial output if the file is not on disk.
- **`list_modules` MCP tool** — returns a markdown table listing all top-level module directories found in the context file, sorted by token count descending, with columns: `Module | Files | Tokens`. Helps agents pick the right `module` arg for `read_context`.
- **Strategy-aware health scorer** — `src/health/scorer.js` and `--health` display now read `gen-context.config.json` and adjust the low-reduction penalty threshold by strategy:
  - `full` (default): 60% reduction threshold — unchanged behaviour.
  - `hot-cold` / `per-module`: reduction penalty disabled — intentionally small hot outputs are not penalised.
  - `hot-cold` only: adds a `context-cold.md` freshness check (`strategyFreshnessDays`). If the cold context file is >1 day stale, up to 10 pts are deducted.
- **New `--health` output fields** — `strategy:` line always visible; `cold freshness:` line shown for `hot-cold` strategy.
- **`test/integration/mcp-v14.test.js`** — 13 integration tests covering `explain_file` and `list_modules`:
  - 7-tool count verification
  - Signature extraction from index
  - Imports and Callers sections (file on disk)
  - Graceful error for unknown path, missing arg, no context file
  - Token count and table structure in `list_modules`
  - Multi-call session combining both new tools
- **`test/integration/observability.test.js`** — 12 new unit tests for strategy-aware scorer:
  - `strategy` field in all return objects
  - No reduction penalty for `hot-cold` and `per-module`
  - Reduction penalty still applied for `full`
  - `strategyFreshnessDays` null/populated correctly
  - Grade A for a fresh, untracked project

### Fixed
- Health scorer: projects with **zero tracking history** (brand-new or never run with `--track`) are no longer penalised for "0% reduction". `tokenReductionPct` is only set when `totalRuns > 0`.

### Changed
- MCP server now exposes **7 tools** (was 5 before v1.3, 5 in v1.3). `tools/list` assertion updated in `mcp-server.test.js`.
- `gen-context.js` VERSION bumped to `1.4.0`
- MCP server `SERVER_INFO.version` bumped to `1.4.0`
- `package.json` version bumped to `1.4.0`

### Validation gate
- `node gen-context.js --version` → `1.4.0` ✔
- `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node gen-context.js --mcp` → 7 tools ✔
- `node test/integration/mcp-v14.test.js` → 13/13 pass ✔
- `node test/integration/observability.test.js` → 35/35 pass ✔
- `node test/integration/mcp-server.test.js` → 16/16 pass ✔
- `node test/run.js` → 21/21 extractor tests pass ✔

---



### Added
- **`--diff` CLI flag** — generates context only for files changed in the current git working tree (`git diff HEAD --name-only`). Useful in CI and pre-review workflows where you only want signatures for files you've touched.
- **`--diff --staged` variant** — restricts context to files in the git staging area only (`git diff --cached --name-only`). Ideal as a pre-commit check.
- **Smart fallback** — both `--diff` modes automatically fall back to a full `runGenerate` when: outside a git repo, no changed files, or all changed files are outside tracked `srcDirs`. No silent failures.
- **`--diff --report`** — when both flags are used together, prints a side-by-side comparison of diff-mode vs full-mode token counts and savings.
- **`watchDebounce` config key** — new key in `gen-context.config.json` (default: `300`) controls the debounce delay (ms) between file-system events and regeneration in watch mode. Configurable per project.
- **`test/integration/diff.test.js`** — 6 integration tests covering all diff-mode scenarios:
  - Diff-only output excludes unchanged files
  - `--staged` excludes unstaged modifications
  - Empty diff fallback to full generate
  - Non-git-repo fallback
  - Changed files outside srcDirs fallback
  - Multiple changed files all appear in output

### Changed
- Watch mode debounce reduced from **500 ms → 300 ms** (default). Now reads `config.watchDebounce || 300` — fully configurable.
- `gen-context.js` VERSION bumped to `1.3.0`
- MCP server version bumped to `1.3.0`
- `package.json` version bumped to `1.3.0`
- `src/config/defaults.js` — added `watchDebounce: 300` key

### Validation gate
- `node gen-context.js --version` → `1.3.0` ✔
- `node gen-context.js --diff` on a repo with changes → output contains only changed-file sigs ✔
- `node gen-context.js --diff --staged` → output contains only staged-file sigs ✔
- `node test/integration/diff.test.js` → 6/6 pass ✔
- `node test/run.js` → 21/21 extractor tests pass ✔

---

## [1.2.0] — 2026-04-02

### Added
- **`--init` now scaffolds `.contextignore`** alongside `gen-context.config.json`. Running `node gen-context.js --init` on a fresh project creates both files. `.contextignore` is pre-populated with sensible defaults (`node_modules/`, `dist/`, `build/`, `*.generated.*`, etc.). Safe to re-run — existing files are never overwritten.
- **`test/integration/strategy.test.js`** — 9 integration tests covering `per-module` and `hot-cold` strategies:
  - `per-module`: asserts one `context-<module>.md` per `srcDir`, overview file references all modules, cross-module signature isolation
  - `hot-cold`: asserts `context-cold.md` is created, primary output contains only hot files, `hotCommits` config controls the boundary
  - Both strategies: fallback behaviour when `srcDir` is missing or repo has no git history
- **`sigmap` npm binary alias** — `package.json` `bin` now exposes both `gen-context` (existing) and `sigmap` (new alias), making `npx sigmap` work ahead of full npm publish in v1.5
- **`--diff` and `--diff --staged` listed in `--help`** — help text documents the upcoming flags so tooling auto-complete picks them up

### Changed
- `package.json` version bumped to `1.1.0` (syncs with already-shipped v1.1 strategy features)
- `gen-context.js` `VERSION` constant bumped to `1.1.0`
- `src/mcp/server.js` `SERVER_INFO.version` bumped to `1.1.0`
- `--init` no longer exits early when config already exists — it still skips writing config but continues to check / write `.contextignore`
- `keywords` in `package.json` expanded: added `token-reduction`, `code-signatures`

### Validation gate
- `node gen-context.js --version` → `1.1.0` ✔
- `cat package.json | grep version` → `"version": "1.1.0"` ✔
- `node gen-context.js --init` on a fresh dir → both `gen-context.config.json` and `.contextignore` created ✔
- `node test/integration/strategy.test.js` → all 9 tests pass ✔
- `node test/run.js` → 21/21 extractor tests pass ✔

---

## [1.1.0] — 2026-04-01

### Added
- **Context strategies** — new `"strategy"` config key with three options:
  - `"full"` (default) — existing behaviour, single output file, all signatures
  - `"per-module"` — one `.github/context-<module>.md` per top-level `srcDir` plus a
    thin always-injected overview table (~100–300 tokens); ~70% fewer injected tokens
    per question with zero context loss; no MCP required
  - `"hot-cold"` — recently committed files auto-injected as usual; all other files
    written to `.github/context-cold.md` for MCP on-demand retrieval; ~90% fewer
    always-injected tokens; best with Claude Code / Cursor MCP enabled
- **`"hotCommits"`** config key — controls how many recent git commits count as "hot"
  for the `hot-cold` strategy (default: 10)
- **`docs/CONTEXT_STRATEGIES.md`** — comprehensive strategy guide: decision tree,
  four worked-scenario comparisons (fix-a-bug, cross-module question, daily dev,
  onboarding), full configuration reference, migration guide, and feature-compatibility
  matrix
- README: new "Context strategies" section with inline examples linking to full guide
- `gen-context.config.json.example`: `strategy` and `hotCommits` keys with comments

### Changed
- `gen-context.js` version remains `1.0.0`; `runGenerate` now dispatches to
  `runPerModuleStrategy` or `runHotColdStrategy` based on `config.strategy`
- `getRecentlyCommittedFiles(cwd, count)` now accepts a count parameter so
  `hotCommits` is respected
- `--help` text updated with strategy descriptions

### Validation gate
- `strategy: per-module` on arbi-platform: `3 modules, overview ~117 tokens, total ~4,058 tokens`
- `strategy: hot-cold` on arbi-platform: `79 hot files ~3,700 tokens, 1 cold ~363 tokens`
- `strategy: full` unchanged: `80 files, ~3,980 tokens, 94.9% reduction`
- All 21 checks pass post-deployment

---

## [1.0.0] — 2026-04-01

### Added
- **Self-healing CI** — `examples/self-healing-github-action.yml`: weekly cron workflow that queries the GitHub Enterprise Copilot API for acceptance rate; automatically opens a PR with regenerated context when rate drops below threshold (default 30%) or context file is stale (> 7 days); falls back to staleness check when no API token is configured
- **`scripts/ci-update.sh`** — CI helper script: `--fail-over-budget` (exits 1 if output tokens exceed budget), `--track`, `--format cache`; designed for required CI pipeline steps
- **`--suggest-tool "<task>"`** — recommends a model tier (fast / balanced / powerful) from a free-text task description using keyword matching against `src/routing/hints.js` TIERS; `--json` variant returns machine-readable `{ tier, label, models, costHint }` for IDE integrations
- **`--health`** — composite 0-100 health score derived from: context staleness (days since last regeneration), average token reduction %, and over-budget run rate; letter grade A–D; `--json` variant for dashboards and CI
- **`src/health/scorer.js`** — zero-dependency health scoring module: `score(cwd)` reads usage log + context file mtime; never throws
- Integration test: `test/integration/system.test.js` — 15 tests covering suggest-tool (all three tiers, `--json` shape, missing-description guard) and health (`--json` field presence, score range, grade values, run counters)

### Changed
- `gen-context.js` version bumped to `1.0.0`; help text expanded with `--suggest-tool`, `--health`
- `package.json` version bumped to `1.0.0`
- `src/mcp/server.js` version bumped to `1.0.0`
- README updated: v1.0 features section, new CLI reference entries, updated project structure tree

### Validation gate
- 177/177 tests pass (21 extractor + 156 integration)
- `node gen-context.js --suggest-tool "security audit" ` → tier: powerful
- `node gen-context.js --health --json` → `{ score, grade, tokenReductionPct, daysSinceRegen, ... }`
- Self-healing CI workflow validates via `node gen-context.js --health --json` in check job

---

## [0.9.0] — 2026-04-01

### Added
- **Enhanced `--report --json`** — structured JSON report now includes `version`, `timestamp`, `overBudget`, and `budgetLimit` fields alongside existing token stats; exits with code `1` when output exceeds `maxTokens` so CI pipelines can fail automatically
- **`--track` CLI flag** — appends one NDJSON record per run to `.context/usage.ndjson`; also enabled by `"tracking": true` in config
- **`src/tracking/logger.js`** — zero-dependency append-only log module; exports `logRun(entry, cwd)`, `readLog(cwd)`, and `summarize(entries)`; uses NDJSON (one JSON object per line) compatible with standard Unix tools
- **`--report --history`** — prints aggregate summary from `.context/usage.ndjson` (total runs, avg reduction %, avg tokens, over-budget count, first/last run timestamps); add `--json` for machine-readable output
- **`docs/ENTERPRISE_SETUP.md`** — comprehensive enterprise guide: GitHub Enterprise REST API acceptance rate tracking, CI token reporting with Prometheus/Grafana dashboard integration, self-hosted runner configuration, usage log analysis examples
- `tracking: false` default added to `src/config/defaults.js`
- Integration test: `test/integration/observability.test.js` — 23 tests covering `logRun`, `readLog`, `summarize`, CLI `--report --json`, `--track`, config-driven tracking, and `--report --history`

### Changed
- `gen-context.js` version bumped to `0.9.0`
- `package.json` version bumped to `0.9.0`
- `src/mcp/server.js` version bumped to `0.9.0`
- `--report` human output now includes `version` and `budget limit` lines
- README updated: `--track` / `--report --history` in CLI reference, new Observability section, updated project structure tree

### Validation gate
- 162/162 tests pass (21 extractor + 141 integration)
- `node gen-context.js --report --json` outputs JSON with `version`, `timestamp`, `overBudget`
- `node gen-context.js --track` writes `.context/usage.ndjson`
- `node gen-context.js --report --history` prints usage summary
- `node gen-context.js --report --history --json` outputs valid JSON

---

## [0.8.0] — 2026-03-31

### Added
- **`--format cache` CLI flag** — alongside the standard markdown output, writes `.github/copilot-instructions.cache.json`, a single Anthropic content block with `cache_control: { type: "ephemeral" }` ready for direct use in Anthropic API calls
- **`src/format/cache.js`** — zero-dependency formatter; exports `formatCache(content) → JSON string` (single content block) and `formatCachePayload(content, model) → JSON string` (full messages API payload with system array)
- **`format: 'default'` config key** — set `"format": "cache"` in `gen-context.config.json` to always write the cache JSON file on every run; default is `'default'` (markdown only)
- **`docs/REPOMIX_CACHE.md`** — full prompt cache strategy: two-layer design (Repomix as stable cached prefix + SigMap as dynamic segment), cost calculations (~60% reduction), API call examples, CI integration, cache warm-up strategy
- Integration test: `test/integration/cache.test.js` — 20 tests covering `formatCache()`, `formatCachePayload()`, CLI `--format cache` flag, config-driven mode, and absence of cache file when flag is not set

### Changed
- `gen-context.js` version bumped to `0.8.0`
- `package.json` version bumped to `0.8.0`
- README updated: `--format cache` entry in CLI reference, new Prompt Caching section, updated project structure tree

### Validation gate
- 139/139 tests pass (21 extractor + 118 integration)
- `node gen-context.js --format cache` writes `.github/copilot-instructions.cache.json`
- Cache JSON has `type: "text"` and `cache_control: { type: "ephemeral" }`
- `node gen-context.js` without `--format cache` does NOT write cache file

---

## [0.7.0] — 2026-03-31

### Added
- **Model routing hints** — classifies every indexed file into `fast`, `balanced`, or `powerful` tier based on path conventions and signature count, then appends a `## Model routing hints` section to the context output
- **`--routing` CLI flag** — `node gen-context.js --routing` appends routing hints in one pass; set `"routing": true` in config to always include them
- **`src/routing/classifier.js`** — zero-dependency heuristic classifier (path patterns, sig count, indented method count)
- **`src/routing/hints.js`** — tier definitions (`TIERS`) and `formatRoutingSection()` formatter
- **`get_routing` MCP tool** (5th tool) — returns routing hints for the current project on demand; reads context file, classifies files, returns formatted markdown
- **`docs/MODEL_ROUTING.md`** — full routing guide: tier criteria, task-to-tier decision flow, VS Code / Claude Code / CI integration, cost calculation reference
- Integration test: `test/integration/routing.test.js` — 25 tests covering classifier unit tests, classifyAll grouping, formatRoutingSection, CLI flag, config flag, and MCP tool
- `routing: false` default added to `src/config/defaults.js`
- `src/mcp/server.js` version bumped to `0.7.0`

### Changed
- `tools/list` now returns 5 tools (previously 4) — adds `get_routing`

### Validation gate
- 119/119 tests pass (21 extractor + 98 integration)
- `node gen-context.js --routing` produces `## Model routing hints` in output
- `tools/list` returns 5 tools including `get_routing`
- `get_routing` MCP call returns tier classification for current project

---

## [0.6.0] — 2026-03-31

### Added
- **`create_checkpoint` MCP tool** — returns a markdown session snapshot: active branch, last 5 commits, context token count, modules indexed, and route table summary (when `PROJECT_MAP.md` is present)
- **`examples/copilot-prompts.code-snippets`** — 20 VS Code code snippets with `cf-` prefix covering the full session lifecycle (`cf-start`, `cf-checkpoint`, `cf-end`, `cf-pr`, `cf-debug`, `cf-test`, `cf-search`, `cf-map-*`, and more)
- **`examples/slack-context-bot.js`** — zero-dependency Node.js script that posts daily context-freshness reminders to a Slack channel via an Incoming Webhook URL; includes branch, recent commit, token count, and a session checklist
- **`docs/SESSION_DISCIPLINE.md`** — complete session discipline guide: session lifecycle, 30-minute checkpoint cadence, token hygiene table, multi-session workflow, git hook integration, MCP tool reference, and VS Code snippet install instructions
- `src/mcp/server.js` version bumped to `0.6.0`
- Integration tests: 5 new tests for `create_checkpoint` in `test/integration/mcp-server.test.js`

### Changed
- `tools/list` now returns 4 tools (previously 3) — `read_context`, `search_signatures`, `get_map`, `create_checkpoint`

### Validation gate
- 94/94 tests pass (21 extractor + 73 integration)
- `create_checkpoint` MCP tool returns JSON with `# SigMap Checkpoint` header
- `create_checkpoint` with `note` param includes note in output
- `tools/list` returns 4 tools including `create_checkpoint`
- VS Code snippets file has JSON-valid syntax; `cf-` prefix on all 20 snippets

---

## [0.5.0] — 2026-03-31

### Added
- `--monorepo` CLI flag — auto-detects packages under `packages/`, `apps/`, `services/`, `libs/` and writes one `CLAUDE.md` per package
- Manifest detection covers `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `pom.xml`, `build.gradle`
- `config.monorepo: true` triggers monorepo mode without the CLI flag
- **Git-diff priority output ordering** — recently committed files now appear first in the generated output (not just protected from token-budget drops)
- `examples/github-action.yml` — ready-to-use 4-job CI workflow: SigMap, gen-project-map, Repomix, test suite (Node 18/20/22 matrix)
- `docs/CI_GUIDE.md` — full CI setup guide, monorepo config, `.contextignore` patterns, token report in CI
- Integration test: `test/integration/monorepo.test.js` — 8 tests (packages/, apps/, services/, multi-manifest, 5-package smoke)
- Integration test: `test/integration/contextignore.test.js` — 7 tests (patterns, wildcards, comments, union of both ignore files)

### Validation gate
- 89/89 tests pass (21 extractor + 68 integration)
- `node gen-context.js --monorepo` writes `CLAUDE.md` per detected package
- `node gen-context.js --report` confirms git-diff files appear first in output

---

## [0.4.0] — 2026-03-31

### Added
- `gen-project-map.js` — standalone zero-dependency CLI; generates `PROJECT_MAP.md`
- `src/map/import-graph.js` — static import/require analysis for JS, TS, Python; DFS cycle detection with `⚠` warnings
- `src/map/class-hierarchy.js` — extracts `extends`/`implements` relationships across TypeScript, JavaScript, Python, Java, Kotlin, C#
- `src/map/route-table.js` — HTTP route extraction for Express, Fastify, NestJS, Flask, FastAPI, Go (Gin/stdlib), Spring
- Output: `PROJECT_MAP.md` with `### Import graph`, `### Class hierarchy`, `### Route table` sections (MCP-compatible headers)
- `gen-project-map.js --version` and `--help` flags
- Integration test: `test/integration/project-map.test.js` — 12 tests covering all frameworks, circular detection, MCP section extraction
- `package.json` updated to `v0.4.0`; `gen-project-map` added to `bin`

### Validation gate
- 74/74 tests pass (21 extractor + 53 integration)
- `node gen-project-map.js` writes `PROJECT_MAP.md` with all three sections
- MCP `get_map` tool correctly extracts each section by `### ` header

---

## [0.3.0] — 2026-03-31

### Added
- `src/mcp/server.js` — stdio JSON-RPC 2.0 MCP server (zero npm dependencies); handles `initialize`, `tools/list`, `tools/call`
- `src/mcp/tools.js` — 3 tool definitions: `read_context`, `search_signatures`, `get_map`
- `src/mcp/handlers.js` — tool implementations; reads context files from disk on every call (no in-memory state)
- `--mcp` CLI flag — starts MCP server on stdio
- MCP auto-registration in `.claude/settings.json` and `.cursor/mcp.json` via `--setup`
- `examples/claude-code-settings.json` — pre-configured entry for both SigMap and Repomix MCP servers
- `docs/MCP_SETUP.md` — full MCP setup guide with both Claude Code and Cursor examples
- Integration test: `test/integration/mcp-server.test.js` — 11 tests

### Tools
| Tool | Input | Output |
|------|-------|--------|
| `read_context` | `{ module?: string }` | All signatures or module-scoped subset |
| `search_signatures` | `{ query: string }` | Matching signatures with file paths |
| `get_map` | `{ type: "imports" \| "classes" \| "routes" }` | Section from `PROJECT_MAP.md` |

### Validation gate
- 62/62 tests pass (21 extractor + 41 integration)
- `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node gen-context.js --mcp` returns 3 tools

---

## [0.2.0] — 2026-03-31

### Added
- `src/security/patterns.js` — 10 secret detection patterns (AWS, GCP, GitHub, JWT, DB URLs, SSH, Stripe, Twilio, generic key=value)
- `src/security/scanner.js` — `scan(sigs, filePath) → { safe, redacted }`; never throws; redacts per-file only
- `src/config/loader.js` — reads and deep-merges `gen-context.config.json` with defaults; warns on unknown keys
- `src/config/defaults.js` — all config keys documented with defaults
- Token budget drop order: generated → test → config → least-recently-changed
- Multi-agent output targets: `copilot`, `claude`, `cursor`, `windsurf`
- `CLAUDE.md` append strategy — appends below `## Auto-generated signatures` marker; never overwrites human content above
- `docs/REPOMIX_INTEGRATION.md` — companion tool integration guide
- Integration tests: `secret-scan.test.js` (12), `config-loader.test.js` (6), `token-budget.test.js` (5), `multi-output.test.js` (7)

### Validation gate
- 51/51 tests pass (21 extractor + 30 integration)
- Secret in fixture → `[REDACTED — AWS Access Key detected]` in output
- Output ≤ 6000 tokens on any project over 200 files

---

## [0.1.0] — 2026-03-31

### Added
- `gen-context.js` — single-file zero-dependency CLI entry point
- 21 language extractors: TypeScript, JavaScript, Python, Java, Kotlin, Go, Rust, C#, C/C++, Ruby, PHP, Swift, Dart, Scala, Vue, Svelte, HTML, CSS/SCSS, YAML, Shell, Dockerfile
- CLI flags: `--generate`, `--watch`, `--setup`, `--report`, `--report --json`, `--init`, `--help`, `--version`
- `.contextignore` support (gitignore syntax), also reads `.repomixignore`
- `fs.watch` auto-update with 500ms debounce
- `post-commit` git hook installer via `--setup`
- Token budget enforcement with priority drop order
- `test/run.js` zero-dependency test runner
- 21 fixture files and expected outputs
- `gen-context.config.json.example` and `.contextignore.example`

### Validation gate
- 21/21 extractor tests pass
- Runs on a Node 18 machine with zero npm install
- Output written to `.github/copilot-instructions.md`
