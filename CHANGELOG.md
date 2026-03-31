# Changelog

All notable changes to ContextForge are documented here.

Format: [Semantic Versioning](https://semver.org/)

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
- **`docs/REPOMIX_CACHE.md`** — full prompt cache strategy: two-layer design (Repomix as stable cached prefix + ContextForge as dynamic segment), cost calculations (~60% reduction), API call examples, CI integration, cache warm-up strategy
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
- `create_checkpoint` MCP tool returns JSON with `# ContextForge Checkpoint` header
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
- `examples/github-action.yml` — ready-to-use 4-job CI workflow: ContextForge, gen-project-map, Repomix, test suite (Node 18/20/22 matrix)
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
- `examples/claude-code-settings.json` — pre-configured entry for both ContextForge and Repomix MCP servers
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
