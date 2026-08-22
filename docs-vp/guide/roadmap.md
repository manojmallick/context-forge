---
title: Roadmap
description: SigMap version history and roadmap. From v0.0 to v7.22.0, with recent releases completing the grounded-codegen plan — a realistic §9 ablation (real-symbol corpus, exact-signature grounding, --verbose), a Gemini (AI Studio) provider for the §9 ablation, the init Creation-workflow CLAUDE.md block, scaffold persistence, the LLM A/B hallucination ablation harness, the sigmap create orchestrator and its four guard stages (scaffold, verify-plan, verify-ai-output, review-pr), the conventions command with its full flag set (--conflicts, --inject, --report, --ci, --fix, --update), the grounding benchmark, read-time self-heal, live-index MCP write hooks, the get_callee_signatures MCP tool (exact callee signatures), realistic per-query savings, release-pipeline robustness (bundle integrity + version.json gates, standalone-bundle smoke test), the sigmap gain token-savings dashboard, supply-chain hardening (zero system-shell access), Squeeze input minimization with symbol enrichment, source-of-truth llms.txt, the verify-ai-output Hallucination Guard, and Memory tools (note, status, read_memory MCP tool).
head:
  - - meta
    - property: og:title
      content: "SigMap Roadmap — version history and upcoming features"
  - - meta
    - property: og:description
      content: "101 versions shipped. See what changed in each release and what is coming next."
  - - meta
    - property: og:url
      content: "https://sigmap.io/guide/roadmap"
  - - meta
    - property: og:type
      content: article
  - - meta
    - name: keywords
      content: "sigmap roadmap, sigmap changelog, sigmap versions, sigmap release notes"
---
# Roadmap

One hundred one versions shipped. MIT open source from day one.

**Stats:** 96.8% overall token reduction · 82.2% retrieval hit@5 (1.59× measured lift vs single-shot grep) · 98.0% test-discovery F1 · installed-library grounding (JS/TS + Python) · method-level call-graph (JS/TS, Python, Java, Go, Rust) · 21 MCP tools · 33 languages · 17-language source resolver · 0 npm deps

## Token reduction by version

| Version | Tokens / session | Notes |
|---------|-----------------|-------|
| v0.0 | 80,000 | Repomix baseline — starting point |
| v0.1 | 4,000 | First 95% reduction |
| v0.2 | 3,000 | Smarter filtering |
| v0.3 | 200–2,000 | Pull only what the task needs (MCP) |
| v0.6 | −40% per conversation | Session discipline |
| v0.8 | −60% API cost | Prompt cache breakpoints |
| v1.0 | 97% total | Full system — 80,000 → under 4,000 |
| v1.1 | ~200 always-on | hot-cold + MCP: 99.75% reduction from baseline |
| v1.3 | 50 diff-mode | Active PR work: 95%+ reduction for diffs |
| v6.12 | symbol-index + delta | Demand-driven `--mode index`: headers only, bodies via `get_lines`; `--since` delta = near-zero per turn |

## Complete version timeline

### v0.0 — Repomix baseline

Measure the problem. Install Repomix, create `.repomixignore`, measure token consumption before any optimisation. This is the number we spend every version beating.

**Tags:** `repomix --compress` · `.repomixignore` · token baseline

**Starting point: ~80,000 tokens per session**

---

### v0.1 — Core extractor ✓

The first version that matters. A single file — `gen-context.js` — with all 21 language extractors inline. Zero npm dependencies. Runs on any machine with Node.js 18+. Writes `.github/copilot-instructions.md`. Installs a post-commit git hook via `--setup`.

**Tags:** `gen-context.js` · `21 extractors` · `--setup hook` · `--watch` · `zero deps`

**Impact: 80,000 → 4,000 tokens — first 95% reduction**

---

### v0.2 — Enterprise hardening ✓

Secret scanning blocks AWS keys, GitHub tokens, database connection strings, and 10 other credential patterns from ever appearing in the output. The `.contextignore` file (gitignore syntax) lets teams exclude generated code, test fixtures, and vendor directories. Token budget enforcement with a defined drop order.

**Tags:** `secret scan (10 patterns)` · `.contextignore` · `token budget` · `drop order` · `config file`

**Impact: 4,000 → 3,000 tokens — smarter filtering**

---

### v0.3 — MCP server ✓

A JSON-RPC stdio server implementing the Model Context Protocol. Three tools: `read_context`, `search_signatures`, `get_map`. The MCP server reads files on every call — no stale state, no restart needed.

**Tags:** `stdio JSON-RPC` · `read_context` · `search_signatures` · `get_map` · `--mcp flag`

**Impact: 200–2,000 tokens — pull only what the task needs**

---

### v0.4 — Project map ✓

`gen-project-map.js` produces `PROJECT_MAP.md` with three structural views: an import graph showing every file dependency, a class hierarchy showing extends/implements relationships, and a route table extracting HTTP routes from Express, FastAPI, Rails, and similar frameworks.

**Tags:** `import graph` · `class hierarchy` · `route table` · `cycle detection` · `gen-project-map.js`

---

### v0.5 — Monorepo + CI ✓

Monorepo mode generates a separate context file per package. The GitHub Action runs on every push and PR, fails CI if token budget is exceeded, and posts a reduction report as a PR comment.

**Tags:** `monorepo mode` · `GitHub Action` · `PR comments` · `CI budget gate` · `per-package output`

---

### v0.6 — Session discipline ✓

A session compression guide (`SESSION_DISCIPLINE.md`) codifies how agents should summarise conversations, checkpoint progress, and restart from a minimal state. The `--track` flag logs every run to `.sigmap/runs.jsonl`. Reduces per-conversation token cost by 40%.

**Tags:** `SESSION_DISCIPLINE.md` · `conversation checkpoints` · `--track flag` · `runs.jsonl`

**Impact: −40% tokens per conversation**

---

### v0.7 — Model routing ✓

A file complexity scorer classifies every file as `fast` (simple CRUD, 0.33× cost), `balanced` (business logic, 1× cost), or `powerful` (architecture decisions, 3× cost). The routing table is appended to the context file. Agents use the fast-tier model for 70% of tasks.

**Tags:** `complexity scorer` · `3-tier routing` · `haiku / sonnet / opus` · `MODEL_ROUTING.md` · `--routing flag`

**Impact: Up to 70% reduction in model API cost**

---

### v0.8 — Prompt cache ✓

The `--format cache` flag wraps context in Anthropic's `cache_control` breakpoints. The stable codebase signatures become a cached prefix — computed once and reused across every request in a session.

**Tags:** `cache_control breakpoints` · `--format cache` · `stable prefix` · `Anthropic API`

**Impact: −60% API cost on repeated context loads**

---

### v0.9 — Observability ✓

`--report --json` emits machine-readable token reduction JSON for CI dashboards. `ENTERPRISE_SETUP.md` consolidates all enterprise configuration. 23 new integration tests bring total coverage to 177 passing tests.

**Tags:** `--report --json` · `--track` · `ENTERPRISE_SETUP.md` · `23 new tests` · `CI dashboard`

---

### v1.0 — Full system ✓ (tagged v1.0.0)

The complete SigMap system. Self-healing CI auto-regenerates the context file when it drifts. The `--health` flag gives a composite 0–100 score. The `--suggest-tool` flag classifies any task description into fast / balanced / powerful model tiers. All 177 tests pass.

**Tags:** `self-healing CI` · `--health` · `--suggest-tool` · `177 tests` · `MIT v1.0.0`

**Impact: 97% total token reduction — 80,000 → under 4,000**

---

### v1.1 — Context strategies ✓ (tagged v1.1.0)

Three output strategies: **full** (one file, all signatures), **per-module** (~70% fewer injected tokens), **hot-cold** (~90% fewer always-on tokens when using Claude Code or Cursor with MCP).

**Tags:** `strategy: full` · `strategy: per-module` · `strategy: hot-cold` · `hotCommits config`

**Impact: hot-cold + MCP: ~200 tokens always-on — 99.75% reduction from baseline**

---

### v1.2 — npm alias + test hardening ✓ (tagged v1.2.0)

Added `sigmap` npm binary alias so `npx sigmap` works from any machine. Improved `--init` to scaffold both config files in one step. 9 new integration tests.

**Tags:** `npx sigmap` · `--init .contextignore` · `strategy tests`

---

### v1.3 — --diff flag + watch debounce ✓ (tagged v1.3.0)

`--diff` generates context only for files changed in the current git working tree. `--diff --staged` restricts to staged files only. `watchDebounce` is now configurable.

**Tags:** `--diff` · `--diff --staged` · `watchDebounce config`

**Impact: Active PR work: ~50–200 tokens instead of ~4,000**

---

### v1.4 — MCP tools + strategy health ✓ (tagged v1.4.0)

Two new MCP tools: `explain_file` and `list_modules`. MCP server now exposes 7 tools total. Strategy-aware health scorer no longer penalises hot-cold or per-module runs.

**Tags:** `explain_file` · `list_modules` · `7 MCP tools` · `strategy health` · `25 new tests`

---

### v1.5 — VS Code extension + npm publish ✓ (tagged v1.5.0)

VS Code extension shows a status bar item with health grade and time since last regeneration. Warns when context is stale (>24 h). Adds Regenerate Context and Open Context File commands.

**Tags:** `VS Code extension` · `status bar` · `stale notification` · `docs search` · `58 new tests`

---

### v2.0 — v2 pipeline ✓ (tagged v2.0.0)

Major pipeline overhaul adds four new context sections: **TODOs** (inline TODO/FIXME/HACK extraction), **Recent changes** (git log summary), **Coverage gaps** (files lacking tests), **PR diff context** (changed-file signatures). 262 tests passing.

**Tags:** `v2 pipeline` · `TODOs` · `coverage gaps` · `PR diff context` · `dependency extractors` · `262 tests`

---

### v2.1 — Benchmark & evaluation system ✓ (tagged v2.1.0)

Zero-dependency evaluation pipeline: hit@5, MRR, and precision@5 metrics against a JSONL task file. `--benchmark` CLI flag runs retrieval tasks and prints a scored results table.

**Tags:** `--benchmark` · `hit@5 / MRR` · `JSONL tasks` · `src/eval/`

---

### v2.2 — Diagnostics & per-file analysis ✓ (tagged v2.2.0)

`--analyze` prints a per-file breakdown of signatures, tokens, extractor language, and test coverage status. `--diagnose-extractors` self-tests all 21 extractors against their fixture files.

**Tags:** `--analyze` · `--diagnose-extractors` · `per-file breakdown` · `extractor self-test`

---

### v2.3 — Query-aware retrieval ✓ (tagged v2.3.0)

Zero-dependency TF-IDF retrieval ranks all files by relevance to a free-text query. `--query "<text>"` prints a scored file table. New 8th MCP tool `query_context`. 325 tests passing.

**Tags:** `--query` · `query_context MCP` · `TF-IDF` · `8 MCP tools` · `325 tests`

---

### v2.4 — packages/core — programmatic API ✓ (tagged v2.4.0)

`packages/core/index.js` (`sigmap-core`) exposes a stable programmatic API: `extract`, `rank`, `buildSigIndex`, `scan`, `score`. Third-party tools can now `require('sigmap')` without spawning a CLI process. 340 tests passing.

**Tags:** `packages/core` · `packages/cli` · `require('sigmap')` · `programmatic API` · `340 tests`

---

### v2.5 — Impact layer ✓

`--impact <file>` traces every file that transitively imports the given file — giving agents instant blast-radius awareness. `src/map/dep-graph.js` builds the reverse index. New `get_impact` MCP tool (9th tool).

**Tags:** `dep-graph` · `--impact` · `get_impact MCP` · `blast radius` · `BFS traversal`

---

### v2.6 — Research Mode ✓

Generate publishable evaluation results. Run against real open-source repos (express, flask, gin, spring-petclinic, rails). `--report --paper` generates markdown + LaTeX tables ready for academic papers.

**Tags:** `benchmarks` · `--benchmark --repo` · `--report --paper` · `LaTeX export` · `50 eval tasks`

---

### v2.7 — Ranking Optimization ✓

Fine-tuned ranking algorithm weights. Configurable weight presets (`precision`, `balanced`, `recall`). `--query` completes in <100ms on 1000-file repos.

**Tags:** `ranking weights` · `weight presets` · `precision` · `recall`

---

### v3.x — Multi-adapter platform ✓ (v3.0 – v3.6)

The multi-adapter architecture (Copilot, Claude, Cursor, Windsurf, OpenAI, Gemini), reporting charts, advanced health metrics, VS Code + JetBrains plugins with real-time status bars, Phase C/D intelligence extractors (TypeScript React, Vue SFC, Python dataclasses), and the LLM-full write mode.

**Tags:** `adapters` · `VS Code extension` · `JetBrains plugin` · `Phase C/D extractors` · `llm-full mode`

---

### v4.0 — Intelligence Layer ✓ (tagged v4.0.0 — 2026-04-15)

Every run now tells you _how good_ your context is, not just that it ran.

- **Coverage score**: fraction of source files that survived the token budget. Grade A–D per srcDir with per-module ASCII heatmap in `--report`.
- **Confidence indicators**: every generated file carries metadata such as `version`, `confidence`, `coverage`, and `commit` so you can inspect freshness at a glance.
- **`--diff` risk score**: LOW / MEDIUM / HIGH per changed file based on reverse-dependency BFS, public exports, route status, and config-file status.
- **Coverage in `--health` and `--health --json`**: coverage grade and source-file counts included in both text and JSON output.
- **Extractor quality scoring**: token-budget drop order now uses `signalQuality = sigs / linesOfCode` — least-informative files are dropped first.

**Benchmark:** 97.6% token reduction average across 18 repos.

---

### v4.1 — Smart budget + output flag ✓ (tagged v4.1.2 — 2026-04-16)

Auto-scaled token budget: SigMap now picks an appropriate `maxTokens` ceiling based on detected context window size, eliminating the need for manual tuning on most projects. The `--output <file>` flag writes context to any custom path and persists it to config so subsequent `--query` runs find it automatically.

**Tags:** `auto-budget` · `--output flag` · `customOutput config` · `--query auto-discovery`

---

### v4.2 — Unified ask pipeline ✓ (tagged v4.2.0 — 2026-04-16)

A single `sigmap ask "<query>"` command replaces the manual intent→rank→generate flow. Intent detection (`detectIntent`) classifies queries as `debug`, `explain`, `refactor`, `review`, or `search` and tunes ranking weights for each. New commands: `suggest-profile` (reads git state), `compare` (benchmark CLI), `share` (shareable stats), `--cost` (per-model cost table).

**Tags:** `sigmap ask` · `detectIntent` · `suggest-profile` · `compare` · `share` · `--cost flag`

---

### v4.3 — CI gate + validate ✓ (tagged v4.3.0 — 2026-04-16)

`sigmap validate` checks config and measures coverage (sig-index size / source file count), warns below 70%, and optionally verifies that query symbols appear in ranked context. `sigmap --ci [--min-coverage N]` is a GitHub Actions exit gate ready for `npx sigmap --ci`. `sigmap ask` now warns on stderr when coverage drops below 70%.

**Tags:** `sigmap validate` · `--ci gate` · `extractQuerySymbols` · `coverage warning`

---

### v5.0 — Judge engine + config extends + history ✓ (tagged v5.0.0 — 2026-04-16)

Three new capabilities that close the feedback loop between context generation and LLM output quality.

- **`sigmap judge`**: rule-based groundedness scorer (`src/judge/judge-engine.js`). Computes a 0–1 token-overlap score between any LLM response and its source context. Exits 0 on `pass`, 1 on `fail`. Works with `--json` and `--threshold` overrides. Zero dependencies, no LLM API key required.
- **Config `extends`**: `gen-context.config.json` now supports an `"extends"` key pointing to a local JSON file or HTTPS URL. Base configs are deep-merged (DEFAULTS → base → local). HTTPS responses are cached for 1 hour in `.context/config-cache/` — teams can share a common base and override locally.
- **`sigmap history`**: reads `.context/usage.ndjson` and renders the last N runs as a table with a Unicode sparkline (▁▂▃▄▅▆▇█) for token trend. `--json` returns the raw array for dashboards.

**Tags:** `sigmap judge` · `groundedness scoring` · `config extends` · `HTTPS base config` · `sigmap history` · `sparkline`

**Impact:** 199 tests passing · 12 new tests for v5.0 features

---

### v5.1 — Benchmark history + sparkline trends ✓ (tagged v5.1.0 — 2026-04-16)

Benchmark runs now leave a permanent record that feeds back into the UI. All three benchmark scripts append a structured NDJSON entry to `.context/benchmark-history.ndjson` on every run. `sigmap history` reads that file and prints a `hit@5` sparkline row and a token-reduction sparkline row below the usage table — visible even when the usage log is empty. The dashboard `readBenchmarkTrend` function now prefers the local history file over the CI-only `benchmarks/results/` directory, so the hit@5 trend chart works for every developer after running any benchmark locally.

**Tags:** `benchmark-history.ndjson` · `sigmap history trends` · `hit@5 sparkline` · `dashboard readBenchmarkTrend` · `run-retrieval-benchmark` · `run-benchmark` · `run-task-benchmark`

**Impact:** benchmark trends now persist locally and feed both CLI and dashboard views

---

### v5.3 — MCP ecosystem completeness ✓ (tagged v5.3.0 — 2026-04-17)

`sigmap --setup` previously only auto-wired MCP for Claude Code and Cursor. v5.3 closes that gap so all four major AI editors are covered with a single command.

- **Windsurf** — writes `mcpServers.sigmap` to `.windsurf/mcp.json` (project-level) and `~/.codeium/windsurf/mcp_config.json` (global).
- **Zed** — writes `context_servers.sigmap` to `~/.config/zed/settings.json` using Zed's distinct `command.path`/`command.args` shape.
- **Idempotent** — each target is skipped when the file does not exist; existing `sigmap` entries are never overwritten.
- **Updated snippets** — `--setup` now prints manual config blocks for all four tools so other editors can be wired by hand.

**Tags:** `--setup` · Windsurf MCP · Zed context_servers · `registerMcp()`

**Impact:** MCP auto-wire coverage: 2 editors → 4 editors

---

### v5.4 — Neovim plugin (sigmap.nvim) ✓ (tagged v5.4.0 — 2026-04-17)

First-class Neovim integration for the #1 most-admired editor (Stack Overflow 2025, 83% admiration). The plugin lives in `neovim-plugin/` and ships as a self-contained Lua package requiring zero configuration for most setups.

- **`:SigMap [args]`** — regenerate the AI context file asynchronously via `vim.fn.jobstart`; notifies with `vim.notify` on completion.
- **`:SigMapQuery <text>`** — runs `sigmap query` and displays ranked results in a centered floating window with rounded borders; close with `q` or `<Esc>`.
- **Auto-run on save** — `setup({ auto_run = true })` creates a `BufWritePost` autocmd for `.js`, `.ts`, `.py`, `.go`, `.rs`, `.java`, `.rb`, and `.lua`.
- **Statusline widget** — `require('sigmap').statusline()` returns `sm:✓` when the context file is < 24 h old and `sm:⚠ Nh` otherwise; integrates with lualine and any custom statusline.
- **`:checkhealth sigmap`** — validates Node 18+, binary presence (global → `npx` → local `gen-context.js`), and context file freshness.
- **`release-neovim.yml`** — new GitHub Actions workflow; tag `neovim-v*` to validate Lua, run the full integration suite across Node 18/20/22, package a `.tar.gz`, and publish a GitHub Release.

**Tags:** `sigmap.nvim` · `:SigMap` · `:SigMapQuery` · `auto_run` · `M.statusline()` · `:checkhealth sigmap` · `release-neovim.yml`

**Impact:** 30 new integration tests · Neovim joins VS Code, JetBrains, Claude Code, Cursor, Windsurf, and Zed as a fully supported editor

---

### v5.5 — Coverage clarity + report UX ✓ (tagged v5.5.0 — 2026-04-17)

Coverage metrics now tell the truth. Before v5.5, `--report` could show a D grade (39%) on a project whose code was 100% covered — because json, md, and config files were counted in the denominator. `--health` always showed A (100%) using a different measurement. Both outputs shared the label `source files`, making the divergence impossible to diagnose.

- **Bug fix (denominator)**: `coverageScore()` now counts only code files (`.ts`, `.js`, `.py`, `.go`, and 25 other extensions) in the denominator. Non-code files are counted separately as `nonCodeSkipped` and shown in `--report` as `(N non-code files skipped — json, md, config)`.
- **`--report` label**: changed from `source files included` → `code files included` to match what is actually measured.
- **`--health` label**: changed from `coverage … source files` → `file access … files accessible in srcDirs` to make clear that health always checks filesystem access, not budget coverage.
- **Actionable tip**: when any module scores below 50%, `--report` now prints the three most common causes (token budget too low, srcDir misconfiguration, wrong strategy) with the exact config keys to fix.
- **`autoMaxTokens` transparency**: `--report` now emits a warning on stderr when the auto-budget override silently replaced a user-configured `maxTokens` value, with the exact config key to opt out.

**Tags:** `coverageScore` · `CODE_EXTS` · `nonCodeSkipped` · `--report` · `--health` · `autoMaxTokens warning`

**Impact:** 10 new tests · coverage grade now reflects only code files — eliminates false D grades on documentation-heavy projects

---

### v5.2 — Learning engine + workflow-first docs ✓ (tagged v5.2.0 — 2026-04-16)

This release turns SigMap into a stronger daily workflow product, not just a signature generator.

- **`sigmap learn`** adds safe local-only ranking feedback for good and bad files.
- **`sigmap weights`** makes the learned multipliers visible and resettable.
- **`sigmap judge --learn`** can apply opt-in confidence-gated updates based on groundedness.
- **HTML benchmark report** consolidates token, retrieval, quality, and task metrics into one self-contained page.
- **Workflow-first docs** elevate `ask`, `validate`, `judge`, and learning as first-class product surfaces.

**Tags:** `sigmap learn` · `sigmap weights` · `judge --learn` · `.context/weights.json` · `benchmark-report.html`

---

### v5.6 — Website & docs sync ✓ (tagged v5.6.0 — 2026-04-17)

All public surfaces now reflect v5.5 reality. Before this release, several guide pages still referenced `v5.2`/`v5.3`/`v5.4` workflow labels, benchmark sub-pages showed outdated "latest saved run" versions, and the homepage language count said `21` while the extractors covered 29.

- **Version labels**: `ask.md`, `compare.md`, `learning.md`, `quick-start.md`, `validate.md` — all `v5.2 workflow` references updated to `v5.5`.
- **Benchmark sub-pages**: `retrieval-benchmark.md`, `task-benchmark.md`, `quality-benchmark.md` — "latest saved run" updated to `v5.5.0` (was `v5.3.0`/`v5.4.0`).
- **Canonical metrics**: `generalization.md`, `cli.md` — `78.9%` → `80.0%` hit@5, `1.69` → `1.68` prompts per task.
- **Judge vocabulary**: `judge.md`, `cli.md` — removed `pass/fail`/`"verdict"`; standardised to `Groundedness` / `Support level` / `Unsupported symbols`.
- **Language count**: `docs/index.html` heading, list item, and structured-data description — `21 languages` → `29 languages and formats`; `softwareVersion` `2.8.0` → `5.5.0`.
- **MCP tool count**: `mcp.md` — `8 tools` → `9 tools` throughout.
- **Troubleshooting Issue 16**: new entry explaining the `--report` vs `--health` coverage-grade inconsistency and the v5.5 fix with a before/after comparison table.

**Tags:** `docs-sync` · `canonical-metrics` · `judge-vocabulary` · `29-languages` · `9-mcp-tools`

**Impact:** 17 new doc-sync tests — every acceptance criterion machine-verified on each CI run

---

### v5.7 — Growth & positioning ✓ (tagged v5.7.0 — 2026-04-17)

v5.7 adds `version.json` as the single canonical source of truth for version, benchmark date, language count, MCP tool count, test count, and official benchmark metrics — eliminating the manual, error-prone sync that caused version drift across public surfaces in every prior release. All user-facing "21 languages" references across `docs/languages.html`, `docs/quick-start.html`, and `docs/repomix.html` were corrected to `29 languages and formats`. README benchmark numbers were updated to the official v5.7 snapshot (`80.0%` hit@5, `1.68` prompts per task). `docs/index.html` structured-data `softwareVersion` was bumped from `5.5.0` to `5.7.0`.

- **`version.json`** (new): machine-readable record of version, benchmark_date, languages, mcp_tools, tests, and metrics snapshot — referenced by docs and CI.
- **README benchmark table**: `78.9%` → `80.0%` hit@5; `1.69` → `1.68` prompts per task.
- **Language count**: corrected to `29 languages and formats` across all affected HTML pages (8 occurrences in `languages.html`, plus `quick-start.html` and `repomix.html`).
- **`docs/index.html`**: `softwareVersion` `5.5.0` → `5.7.0` in structured data.
- **All sub-packages**: `package.json`, `packages/core`, `packages/cli`, `vscode-extension`, `jetbrains-plugin`, `gen-context.js`, `src/mcp/server.js` — all bumped to `5.7.0` via `scripts/sync-versions.mjs`.

**Tags:** `version.json` · `canonical-metrics` · `29-languages` · `growth` · `positioning`

**Impact:** single `version.json` eliminates per-release manual sync of 7+ files; 44 integration tests pass

---

### v5.8 — Trust completion & conversion ✓ (tagged v5.8.0 — 2026-04-18)

v5.8 closes the gap between accurate internal metrics and what a new user sees when they land on the docs for the first time. The release adds five trust-building surfaces and audits every user-facing metric for staleness.

- **Canonical benchmark headers** — all five benchmark pages (`benchmark`, `retrieval-benchmark`, `task-benchmark`, `quality-benchmark`, `generalization`) now open with a `:::info` snapshot block containing the official `sigmap-v5.8-main` ID, run date (2026-04-17), and key metrics. A new user immediately sees verifiable numbers, not a wall of methodology text.
- **30-second demo strip** — `docs/index.html` homepage now includes a terminal mockup directly below the stats bar showing `ask → validate → judge` in sequence, giving new visitors an instant "what does this do?" answer.
- **User-type routing table** — `docs-vp/index.md` opens with a "Who is this for?" table that routes six user archetypes (new users, daily users, teams, MCP users, monorepo evaluators, AI evaluators) to the page that matters most for them.
- **`compare-alternatives.md`** — new guide page with side-by-side tables comparing SigMap vs embeddings/RAG, RepoMix, Copilot context, and manual curation. Uses the canonical 80.0% hit@5 figure and clearly states what SigMap does *not* replace.
- **`walkthrough.md`** — end-to-end walkthrough on the real `gin` repo (Go web framework, 107 files): generate context → ask → validate → AI answer → judge → learn, with a before/after token cost table (142 000 → 1 240 tokens; $0.71 → $0.006 per query).
- **Micro trust-leak audit** — `docs/impact-banner.svg` updated from stale `78.9%`/`1.69`/`40.6%` to canonical `80.0%`/`1.68`/`40.8%`; "hallucinates" replaced with "unsupported answers"; `docs/comparison-chart.svg` bar recalculated for 80.0%; stats bar corrected from `>21<` to `>29<` languages; `softwareVersion` in structured data updated to `5.8.0`.
- **`version.json` — `retrieval_lift` field** — `metrics.retrieval_lift: 5.9` added; `benchmark_id` updated to `sigmap-v5.8-main`.

**Tags:** `compare-alternatives` · `walkthrough` · `benchmark-headers` · `demo-strip` · `routing-table` · `retrieval_lift` · `sigmap-v5.8-main`

**Impact:** 33 new integration tests · all 5 benchmark pages machine-verified · homepage demo strip · two new guide pages in "Guides" sidebar section

---

### v5.9 — Binary polish + community benchmark submissions ✓ (tagged v5.9.0 — 2026-04-18)

v5.9 closes two practical gaps: binary distribution integrity and benchmark visibility. Every binary build now ships a paired SHA-256 checksum file, and a new `sigmap bench --submit` command makes it easy for users to share their own benchmark results with the community.

- **SHA-256 checksum generation** — `scripts/build-binary.mjs` now writes a `dist/<artifact>.sha256` file alongside every binary it produces, so users can verify a download hasn't been tampered with.
- **`scripts/verify-checksums.mjs`** — new standalone verification script. Pass a binary path (or use auto-detection for the current platform); exits `0` on match, `1` on mismatch. Safe to run in CI or post-download.
- **`sigmap bench --submit`** — new CLI command. Reads `version.json` for the canonical release metrics (`hit@5`, token reduction) and `.context/benchmark-history.ndjson` for any local run history, then formats a copyable community submission block. `--json` emits machine-readable output for scripting. Designed to feed a GitHub Discussions thread for community benchmarks.
- **Extended `verify-binary.mjs` smoke tests** — tests 6–10 now cover the full v5.x workflow: `ask`, `weights`, `history`, `bench --submit`, and `bench --submit --json`. Previously only generate, health, and report were covered.

**Tags:** `sha256` · `verify-checksums` · `bench --submit` · `community-benchmarks` · `binary-distribution` · `sigmap-v5.9-main`

**Impact:** 22 new integration tests · 517 total tests · binary artifacts now verifiable via checksum

---

### v6.0 — Graph-boosted retrieval + incremental sig cache ✓ (tagged v6.0.0 — 2026-04-19)

v6.0 ships two performance improvements: graph-boosted retrieval that propagates relevance scores across import edges, and an incremental signature cache that skips re-extraction for unchanged files.

- **Graph-boosted retrieval** (`src/retrieval/ranker.js`) — after TF-IDF scoring, any file scoring > 0 donates a `graphBoost: 0.4` bonus to its 1-hop forward-import neighbours. The dependency graph is built via `src/graph/builder.js` and passed as `opts.graph` to `rank()`. Result: **83.3% graph-boosted hit@5** (+3.3pp over the 80.0% baseline).
- **Incremental signature cache** (`src/cache/sig-cache.js`) — persists `Map<absPath, {mtime, sigs}>` to `.sigmap-cache.json`. `getChangedFiles()` compares `mtime` for O(1) change detection; `loadCache()` is version-keyed so upgrades automatically bust stale entries. Eliminates redundant AST extraction on subsequent runs.
- **MCP `query_context` upgrade** (`src/mcp/handlers.js`) — `queryContext` now builds the dependency graph internally and passes it to `rank()`, giving MCP callers graph-boosted results transparently.
- **Corrected canonical benchmark numbers** — `version.json` and all docs updated with live-verified values: 96.9% token reduction (was 98.1%), 52.2% task success (was 53.3%), 1.68 prompts/task (was 1.67), 40.8% prompt reduction (was 41.2%), 5.8× retrieval lift (was 5.9×). Prior numbers were rounding artefacts from an earlier benchmark configuration.

**Tags:** `graph-boost` · `incremental-cache` · `sig-cache` · `query_context` · `benchmark-correction` · `sigmap-v6.0-main`

**Impact:** 545 integration tests · 83.3% graph-boosted hit@5 · sub-second re-runs on large repos via cache

---

### v6.0.1–v6.0.3 — Bug fixes + weights sharing ✓ (tagged v6.0.3 — 2026-04-21)

Three patch releases closing user-reported regressions and adding two team-collaboration features.

- **v6.0.1 — TypeScript extractor guard clauses (#97)** — `extractClassMembers` now filters `if`, `for`, `while`, `switch`, `do`, `try`, `catch`, `finally`, `else` so control-flow keywords are no longer emitted as method signatures inside class bodies.
- **v6.0.1 — Codex adapter preamble (#96)** — `packages/adapters/codex.js` and its bundled `__factories` copy no longer delegate to the OpenAI adapter; output is clean `# Code signatures\n\n<context>` with no LLM system-prompt preamble.
- **v6.0.2 — Duplicate adapter headers (#104)** — `writeOutputs()` now strips the `formatOutput()` preamble via a new `stripFormatHeader()` helper before passing content to adapters, preventing double `# Code signatures` headers on every run across copilot, claude, and codex adapters.
- **v6.0.3 — `--coverage` flag** — enables test coverage annotation (✓/✗ per function) at runtime without editing config. Equivalent to `testCoverage: true` in config, applied only for the current run.
- **v6.0.3 — `sigmap weights --export [file]`** — writes learned weights JSON to a file path or stdout, making it pipe-friendly for CI seed workflows.
- **v6.0.3 — `sigmap weights --import <file> [--replace]`** — merges or fully replaces local `.context/weights.json` from a portable JSON file. Incoming values are sanitized and clamped. Enables teams to share accumulated ranking knowledge across machines.

**Tags:** `guard-clauses` · `codex-adapter` · `strip-header` · `--coverage` · `weights-export` · `weights-import` · `team-sharing`

**Impact:** 683 total tests (+138 since v6.0.0) · weights sharing unlocked for multi-developer repos

---

### v6.1.0 — Native tool instructions in every adapter ✓ (tagged v6.1.0 — 2026-04-22)

Every adapter's `format()` now embeds native-format SigMap command guidance so agents automatically receive tool instructions in each generated context file — no manual configuration required. Instructions are styled to match each host tool: a markdown table (copilot, codex), a bullet list (claude), `#` comment lines (cursor, windsurf), and an instruction sentence (openai, gemini). This is Level 1 of the adapter-tool-wiring roadmap; Level 2 will auto-wire the four missing MCP tools.

**Tags:** `tool-instructions` · `adapter-level-1` · `copilot` · `claude` · `cursor` · `windsurf` · `openai` · `gemini` · `codex`

**Impact:** 691 total tests (+8 since v6.0.3) · all 7 adapters now surface `sigmap ask`, `sigmap validate`, and `sigmap judge` to every AI agent automatically

---

### v6.2.0 — MCP auto-wire for 4 new targets ✓ (tagged v6.2.0 — 2026-04-22)

`sigmap --setup` now registers the MCP server in 5 new config targets, bringing total `--setup` coverage from 5 to 10 editors and AI CLI tools. New targets: `.vscode/mcp.json` (GitHub Copilot in VS Code 1.99+), `opencode.json` and `~/.config/opencode/config.json` (OpenCode), `~/.gemini/settings.json` (Gemini CLI), and `~/.codex/config.yaml` (Codex CLI — YAML format with no external parser). All targets are idempotent and only written when the file already exists. This is Level 2 of the adapter tool-wiring roadmap.

**Tags:** `mcp-setup` · `vscode-copilot` · `opencode` · `gemini-cli` · `codex-cli` · `adapter-level-2`

**Impact:** 707 total tests (+16 since v6.1.0) · `--setup` now covers 10 AI tools out of the box

---

### v6.3.0 — Native tool registration ✓ (tagged v6.3.0 — 2026-04-22)

v6.3.0 closes the adapter-tool-wiring roadmap at Level 3: the two adapters with persistent config files now inject structured tool registrations directly into those files on every write, so agents gain one-click access to SigMap commands without manual configuration.

- **Codex adapter (`packages/adapters/codex.js`)** — `write()` injects a `## Tools` JSON block into `AGENTS.md` above the auto-generated signatures section. The block registers five named tools (`sigmap_ask`, `sigmap_validate`, `sigmap_judge`, `sigmap_weights`, `sigmap_history`) in the format expected by the Codex CLI and OpenCode tool picker. Injection is idempotent via `<!-- sigmap-tools -->` marker.
- **Claude adapter (`packages/adapters/claude.js`)** — `write()` injects a `## Bash allowlist` section into `CLAUDE.md` containing a `permissions.allow` JSON array with 10 `Bash(sigmap*)` patterns. Claude Code reads this block to skip confirmation prompts for all SigMap commands. Injection is idempotent via `<!-- sigmap-bash-allowlist -->` marker.
- **Bundled factory sync** — both adapter changes are mirrored into the corresponding `__factories` closures in `gen-context.js` so the zero-dependency single-file distribution stays in sync.

**Tags:** `native-tool-registration` · `agents-md` · `tools-json` · `bash-allowlist` · `claude-md` · `codex-adapter` · `adapter-level-3`

**Impact:** 722 total tests (+15 since v6.2.0) · Codex CLI and Claude Code agents gain full SigMap tool access on first `sigmap --setup`

---

### v6.4.0 — Trust sync ✓ (tagged v6.4.0 — 2026-04-23)

v6.4.0 is a docs-only release that eliminates the visible mismatch between the live site and GitHub Releases.

- **Homepage badge split** — hero pill now shows `Release: v6.4.0` and `Benchmark: sigmap-v6.4-main` as separate labels; the old conflated "Latest: v6.0" wording is gone
- **Benchmark upgrade** — all docs upgraded from v5.9-main / v6.0-main snapshots to the canonical v6.4-main snapshot (2026-04-23): 78.9% hit@5, 80.0% graph-boosted, 5.8× lift, 40.6% prompt reduction, 1.69 prompts/task
- **README overclaim fix** — "correct file selection every time" changed to "right file in context — 79% of the time"; top demo trimmed from 4 commands to 2
- **MCP native tool callout** — `docs-vp/guide/mcp.md` now documents the v6.3 native tool registration behaviour
- **Content-consistency test** — `test/content/v640-trust-sync.sh` (12 checks) guards against version/copy regressions in CI

**Tags:** `trust-sync` · `docs` · `version-labels` · `overclaim-fix` · `generalization-upgrade` · `benchmark-upgrade`

**Impact:** All benchmark docs now point to a single canonical v6.4-main snapshot; homepage no longer conflates release version with benchmark ID

---

### v6.5.0 — Source Root Resolver ✓ (tagged v6.5.0 — 2026-04-25)

Intelligent auto-detection of source directories for 17 languages and 50+ frameworks. A 6-module `src/discovery/` subsystem that combines language/framework detection, file density analysis, git activity, and manifest scanning to find the right root directories without manual config.

- **Source Root Resolver** — multi-signal scoring engine detecting Next.js, Django, Rails, Spring Boot, Flutter, Go, Rust, and 44+ other frameworks
- **`.sigmapignore` support** — exclude directories with patterns (fallback to `.contextignore`); supports simple globs like `src/**`
- **`sigmap roots` CLI** — three modes: `--explain` (show detection details), `--json` (programmatic output), `--fix` (interactive correction)
- **Monorepo detection** — auto-detects npm/yarn/pnpm/lerna/nx/turbo workspaces and enumerates all sub-packages
- **Confidence levels** — high/medium/low confidence with detailed scoring explanation for each root directory
- **Graceful fallback** — integrates into `loadConfig()` with fallback to legacy heuristics when needed

**Tags:** `source-root-resolver` · `17 languages` · `50+ frameworks` · `monorepo` · `.sigmapignore` · `confidence scoring`

**Impact:** Removes manual `srcDirs` config for most projects; monorepo setup now fully automatic. New `sigmap roots --fix` enables one-command root detection and correction.

---

### v6.5.1 — Retrieval explain ✓ (tagged v6.5.1 — 2026-04-25)

Extended retrieval ranking with transparent signal breakdown and intent-aware scoring. All `rank()` results now include a signals object showing which factors (exactToken, symbolMatch, prefixMatch, pathMatch, penalty) contributed to each file's score. Expanded intent detection from 4 to 7 patterns (debug, explain, refactor, review, test, integrate, navigate) with tuned weights per intent. Formalized negative-signal penalties to deprioritize test files (0.4x), generated code (0.3x), and documentation (0.2x).

- **Retrieval explain** — rank() and scoreFile() return detailed signal breakdown for ranking transparency
- **7-intent ranking** — expanded intent patterns with intent-specific weight adjustments
- **Negative-signal penalty layer** — formalized penalties for test files, generated code, documentation, and node_modules
- **Signals in output** — formatRankTable and formatRankJSON now include intent and signals for API consumers

**Tags:** `retrieval explain` · `signal breakdown` · `7-intent ranking` · `negative penalties` · `intent-aware scoring`

**Impact:** Ranking decisions are now fully transparent with signal breakdown. Intent-aware ranking improves relevance for different query types (debugging vs navigation vs exploration). Penalties reduce noise from test/generated code.

---

### v6.5.2 — 2-hop graph boost + hub suppression ✓ (tagged v6.5.2 — 2026-04-27)

Extended dependency-aware retrieval with 2-hop graph traversal and hub suppression. Direct imports now receive +0.40 score boost, with second-order imports receiving +0.15 boost (decay applied) for improved multi-layer dependency context. Shared utility files (detected via >20% fanout threshold or static patterns like `util/`, `helper/`, `common/`) are suppressed from graph boosts to prevent over-prioritizing generic utilities. Added incremental signature cache with mtime-based validation and version-controlled cache busting. Cache health statistics now available in `--health` output (entry count and disk size).

- **2-hop graph boost with decay** — traverses 2 hops in dependency graph (hop1: +0.40, hop2: +0.15) for better multi-layer context
- **Hub suppression** — shared utilities excluded from boosts based on >20% fanout threshold and static patterns
- **Incremental signature cache** — opt-in `sigCache` config key caches extracted signatures with mtime validation and version-based busting
- **Cache health stats** — `--health` output includes cache entry count and disk size when cache exists

**Tags:** `2-hop graph boost` · `hub suppression` · `sigCache` · `incremental cache` · `cache health stats`

**Impact:** Multi-layer dependency context improves ranking for complex dependency trees. Hub suppression reduces noise from generic utilities. Incremental cache accelerates subsequent runs by skipping unchanged files. Cache health stats enable monitoring and debugging of cache effectiveness.

---

### v6.6.0 — Session memory + plan command ✓ (tagged v6.6.0 — 2026-04-27)

Cross-session context carry-forward with topic-switch guard and change-impact analysis. New `sigmap ask --followup` flag reuses previous session context (up to 4 hours old) with +0.2 boost to top-5 files; boost reduced to +0.1 when intent differs (topic switch). New `sigmap plan "<goal>"` command analyzes change impact and returns files grouped by confidence level (inspect-first vs likely-to-change). Session state saved to `.context/session.json` with automatic 4-hour TTL expiry.

- **Session memory** — 4-hour TTL session persistence with loadSession, saveSession, mergeSessionContext, clearSession
- **ask --followup flag** — Reuse previous session's context for iterative exploration with topic-switch guard
- **plan command** — Analyze change impact and plan modifications with confidence-based file grouping and `--json` output for agent integration

**Tags:** `session memory` · `ask --followup` · `plan command` · `4-hour TTL` · `topic-switch guard` · `change impact analysis`

**Impact:** Session memory enables faster iterative exploration without re-ranking the entire codebase. Plan command helps developers understand change scope before editing.

---

### v6.6.1 — JVM project structure detection ✓ (tagged v6.6.1 — 2026-04-27)

Added out-of-the-box support for Java, Kotlin, and Scala projects through intelligent detection of JVM convention directories. `srcDirs` configuration now includes Maven/Gradle standard paths (`src/main/java`, `src/main/kotlin`, `src/main/scala`, `app/src/main/java`, `app/src/main/kotlin`) and common test locations (`src/test/java`, `src/test/kotlin`). Patch release with no benchmark changes.

**Tags:** `JVM support` · `Java detection` · `Kotlin detection` · `Scala detection` · `srcDirs` · `auto-detection`

**Impact:** Eliminates manual configuration for JVM-based projects. Developers can now run `sigmap` immediately on Spring Boot, Micronaut, Quarkus, and Kotlin codebases.

---

### v6.6.2–v6.6.5 — srcDirs validation, JVM pattern refactor & monorepo support ✓ (latest: v6.6.5 — 2026-05-03)

Comprehensive validation of srcDirs configuration with comprehensive JVM project support. v6.6.2 added 10 integration tests ensuring all source directory paths (including JVM structures) are correctly defined. v6.6.3 fixed Scala detection in app/src/main/ pattern. v6.6.4 extracted JVM path pattern as a reusable constant for improved testability. v6.6.5 enhanced monorepo support to detect `src/main/{java,kotlin,scala}` and `app/src/main/{java,kotlin,scala}` in workspace packages (packages/*, apps/*, services/*, modules/*), ensuring JVM projects in monorepo structures are properly discovered.

**Tags:** `srcDirs validation` · `JVM path detection` · `monorepo support` · `integration tests` · `configuration consistency`

**Impact:** All 58 integration tests passing. srcDirs configuration machine-verified on every CI run. JVM project detection now works seamlessly across monorepo and non-monorepo structures. Catch misconfiguration of source directories before runtime.

---

### v6.7.0 — 2-hop graph boost + hub suppression ✓ (tagged v6.7.0 — 2026-05-03)

Formalized retrieval and caching improvements into a stable release milestone. Extended dependency-aware retrieval with 2-hop graph traversal (hop1: +0.40, hop2: +0.15 with decay) for improved multi-layer dependency context. Hub suppression prevents over-boosting shared utility files (detected via >20% fanout threshold or static patterns like `util/`, `helper/`, `common/`). Incremental signature cache with mtime-based validation accelerates subsequent runs by caching extracted signatures. Cache health statistics (entry count, disk size) now visible in `--health` output for visibility into cache efficiency.

- **2-hop graph boost with decay** — traverses 2 hops in dependency graph for improved multi-layer context (vs 1-hop in v6.0)
- **Hub suppression** — shared utilities excluded from graph boosts to reduce noise from generic files
- **Incremental signature cache** — opt-in `sigCache: true` config key caches extracted signatures with mtime-based change detection
- **Cache health statistics** — `--health` output includes cache entry count and disk size for monitoring cache effectiveness

**Tags:** `2-hop graph boost` · `hub suppression` · `sigCache` · `incremental cache` · `cache health stats`

**Benchmark:** 96.8% overall token reduction · 80.0% hit@5 · 52.2% task success · 41.0% prompt reduction

**Impact:** 722 tests passing · multi-layer dependency context improves ranking for complex architectures · incremental cache reduces latency on large repos by skipping unchanged files

---

### v6.8.0 — Session memory + safe change planning ✓ (tagged v6.8.0 — 2026-05-03)

Introduced session-aware context carry-forward and impact analysis tools. Session memory stores intent, top-ranked files, and last query in `.context/session.json` with 4-hour TTL, enabling follow-up queries to boost relevant files (+0.2 same intent, +0.1 topic switch). New `sigmap plan "<goal>"` command analyzes change impact by ranking files by confidence level (inspect first vs. likely to change), computing 2-hop impact radius, and identifying affected tests. Topic-switch guard prevents fixation on outdated context.

- **Session memory (4-hour TTL)** — store intent, top files, and last query for context carry-forward
- **`sigmap ask --followup` flag** — load previous session and apply intent-aware boosting (+0.2 same, +0.1 topic-switch)
- **`sigmap plan "<goal>"` command** — analyze change impact: file ranking, impact radius, affected tests
- **Topic-switch guard** — reduce boost from +0.2 to +0.1 when intent differs, prevent fixation

**Tags:** `session memory` · `followup context` · `safe change planning` · `impact analysis` · `intent-aware retrieval`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (same as v6.7.0, features unchanged retrieval)

**Impact:** Developers carry context across queries and analyze change impact before editing. Reduces need to re-provide context on follow-up questions.

---

### v6.10.0 — Monorepo workspace-scoped retrieval ✓ (tagged v6.10.0 — 2026-05-05)

Added first-class support for monorepo architectures. New workspace detector identifies packages from `package.json` workspaces field (npm array and Yarn v2 `packages` format). Automatically infers target package from query tokens enabling context scoping to specific workspace packages. Flags `--package <name>` (explicit scope) and `--global` (disable scoping) control retrieval boundaries. Files inside inferred package receive +0.30 score boost for tighter, more focused context in large codebases with multiple semi-independent modules.

- **Workspace package detection** — Reads `package.json` workspaces field with support for npm and Yarn v2 formats
- **Automatic package inference** — Infers target package from query tokens (e.g., "rate limiting payments" → `packages/payments/`)
- **Scoped retrieval** — `--package <name>` flag for explicit scope, `--global` to disable scoping
- **In-package score boost** — +0.30 boost for files inside inferred package improves ranking relevance

**Tags:** `workspace detection` · `package inference` · `scoped retrieval` · `monorepo support` · `--package flag` · `--global flag`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction (baseline unchanged, workspace scoping improves signal-to-noise for monorepo queries)

**Impact:** Enterprise developers working in monorepos get more focused context, reducing noise from unrelated workspace packages and improving answer relevance.

---

### v6.10.1 — R language support + Python AST extractor ✓ (tagged v6.10.1 — 2026-05-10)

Expanded language coverage and improved Python extraction accuracy. Added Phase 1 R language support with function definition extraction, S4 pattern recognition, multi-line argument handling, and Shiny framework detection. Introduced native Python AST fallback using `ast.parse()` for accurate extraction of complex signatures (multiline parameters, stacked decorators, complex generics) while preserving regex fallback for environments without Python 3. Included critical bug fixes for --query ReferenceError, Windows path handling, .contextignore patterns, and Claude adapter output in specialized context strategies.

- **R language extractor** — Extract function signatures from `.r` and `.R` files with S4 patterns (setGeneric, setMethod, setClass), Shiny framework detection via `app.R`/`ui.R`/`server.R` triplet
- **Python AST fallback** — Native fallback to `python_ast.py` using `ast.parse()` for accurate complex signature extraction, zero breaking changes to output format
- **Bug fixes** — ReferenceError in `--query`, Windows path normalization, bracket character classes in `.contextignore`, Claude adapter output in per-module and hot-cold strategies

**Tags:** `R extractor` · `S4 patterns` · `Shiny support` · `Python AST` · `bug fixes` · `Windows support` · `pattern fixes`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (metrics unchanged, new language coverage and improved extraction accuracy)

**Impact:** Data scientists and R developers can now use SigMap on R projects. Python developers get more accurate signature extraction for complex code patterns.

---

### v6.10.2 — Open-source agents and local LLM documentation ✓ (tagged v6.10.2 — 2026-05-11)

Comprehensive integration guides for open-source AI tools and self-hosted LLM workflows. Added two new documentation guides highlighting SigMap's model-agnostic nature: detailed integrations for open-source coding agents (OpenCode, Aider, OpenHands, Cline) and complete setup guides for local LLM inference backends (Ollama, llama.cpp, vLLM, LM Studio). Updated README to emphasize no vendor lock-in, cost-free inference with local models, and full privacy for proprietary codebases. Added "Integrations" navigation section in documentation.

- **Open-source agents guide** — Setup and integration patterns for OpenCode, Aider, OpenHands, Cline with local and cloud LLM backends
- **Local LLMs guide** — Complete self-hosted workflows for Ollama, llama.cpp, vLLM with per-backend instructions, model recommendations, performance tuning
- **Updated README** — Clarified model-agnostic support for cloud APIs, open-source agents, and fully local setups with zero token costs
- **Enhanced navigation** — New "Integrations" section in docs linking all agent/backend options

**Tags:** `open-source agents` · `local LLMs` · `Ollama support` · `llama.cpp` · `vLLM` · `documentation` · `model-agnostic`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (unchanged metrics, documentation-only release)

**Impact:** LocalLLM community can now easily use SigMap with self-hosted models. Reduces perceived vendor lock-in and clarifies cost-free inference path.

---

### v6.10.3 — Contributor attribution fixes ✓ (tagged v6.10.3 — 2026-05-11)

Fixed MCP tools import graph analysis and restored contributor attribution in GitHub contributors graph. All 6 core contributors now visible as direct authors of their respective commits via cherry-pick to main.

**Tags:** `contributor attribution` · `github graph fix` · `cherry-pick strategy`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (same metrics)

---

### v6.10.4 — MCP tools extractImports export fix ✓ (tagged v6.10.4 — 2026-05-11)

Fixed critical bug in bundled gen-context.js where `extractImports` function was not exported from the import-graph factory, causing `explain_file` (imports/callers) and `get_impact` MCP tools to fail with "extractImports is not a function" error. Added comprehensive regression tests to prevent future occurrence.

**Tags:** `MCP tools` · `bundled exports` · `regression tests` · `import graph analysis`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (same metrics)

---

### v6.10.6 — Import graph improvements + branching strategy ✓ (tagged v6.10.6 — 2026-05-11)

Fixed import graph analysis for Python monorepos (issues #181, #182): added detection of absolute Python imports (`from package.module import X`), improved edge case handling, and added `sigmap-diagnostics.js` for debugging import detection. Also established branching strategy with develop as integration branch and main as release-only. Includes 8 regression tests for MCP tools and comprehensive testing guide.

**Tags:** `import graph` · `Python absolute imports` · `diagnostics tool` · `issue #181` · `issue #182` · `develop-first branching` · `MCP tools` · `regression tests`

**Impact:** Fixes empty import graph for Python files with cross-package dependencies; enables explain_file and get_impact on large monorepos.

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (same metrics)

---

### v6.10.8 — Python imports in builder.js for get_impact ✓ (tagged v6.10.8 — 2026-05-12)

Added Python absolute import detection to `src/graph/builder.js`, fixing the `get_impact` MCP tool which returns empty blast radius for Python monorepos. The fix ensures both `import-graph.js` and `builder.js` correctly detect `from package.module import X` patterns.

**Tags:** `MCP tools` · `Python imports` · `builder.js` · `get_impact` · `issue #187`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (same metrics)

---

### v6.10.7 — Bundled Python import support ✓ (tagged v6.10.7 — 2026-05-12)

Fixed Python absolute import detection in bundled gen-context.js. The source code already had support for `from package.module import X` patterns, but the bundle was missing this code block, causing MCP tools (`explain_file`, `get_impact`) to show empty import graphs for Python monorepos. Now bundled behavior matches source code exactly.

**Tags:** `bundled fix` · `Python imports` · `MCP tools` · `import graph` · `bundle parity`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (same metrics)

---

### v6.9.0 — Segmented benchmarks and methodology ✓ (tagged v6.9.0 — 2026-05-03)

Introduced benchmark transparency and answer usefulness evaluation. All 18 benchmark repositories now tagged by language, repo type (framework/library/tool/application), and size class to enable segmented analysis by project characteristics. Comprehensive methodology documentation explains benchmark design, task selection, metric definitions, and reproducibility. New answer usefulness evaluation metric tracks whether retrieved context actually enabled correct answers, scored in three tiers: fully-useful (rank 1), partially-useful (ranks 2-5), not-useful (not retrieved).

- **Task metadata for segmentation** — Language, repo type, size class for each benchmark repo enables breakdown analysis
- **Methodology documentation** — Explains test set design, metric definitions, why each metric matters, and reproducibility approach
- **Answer usefulness evaluation** — Three-tier scoring complements task success proxy with granular answer quality assessment
- **Benchmark dashboard** — Supports filtering/grouping by language, repo type, repo size for segmented analysis

**Tags:** `segmented benchmarks` · `methodology` · `answer usefulness` · `transparency` · `reproducibility`

**Benchmark:** 80.0% hit@5 · 96.8% token reduction · 52.2% task success (same metrics, improved transparency)

**Impact:** Developers can see which project types benefit most from SigMap. Methodology page enables independent reproduction and validation of results.

---

### v6.11.0 — Line anchors (Surgical Context Phase 1) ✓ (tagged v6.11.0 — 2026-06-03)

Top-level TypeScript and Python signatures now carry a `:start-end` line anchor (e.g. `export class UserRepository  :18-36`), so an AI agent can read the exact lines instead of re-opening the whole file — the first step of **Surgical Context**, the next phase of token reduction. Anchors are emitted as a string suffix, so `ask`, `CLAUDE.md`, and every adapter render them with no consumer changes. A latent block-comment/docstring strip that destroyed newlines and corrupted line numbers was fixed, so the Python AST and regex fallback paths now produce identical anchors.

**Tags:** `line anchors` · `surgical context` · `token reduction` · `typescript` · `python` · `issue #212`

**Benchmark:** 80.0% hit@5 · 96.5% token reduction · 53.3% task success (re-run on v6.11.0 — anchors are index suffixes, metrics unchanged)

---

### v6.11.1 — MCP bundled hot-cold cold signatures ✓ (tagged v6.11.1 — 2026-06-04)

Community patch from **@rudi193-cmd**: the bundled MCP server now includes the hot-cold "cold" signatures, so context lookups return complete results under the hot-cold strategy. Adds strategy integration tests.

**Tags:** `mcp` · `hot-cold` · `bundled server` · `issue #201` · `PR #216` · `community`

---

### v6.12.0 — Surgical Context Phase 2 (demand-driven + delta) ✓ (tagged v6.12.0 — 2026-06-05)

The demand-driven half of **Surgical Context**. A new **`get_lines` MCP tool** (the 10th) fetches an exact `{ file, start, end }` line range behind a `:start-end` anchor — clamped, secret-scanned, and sandboxed to the project root — so agents read just the lines they need instead of re-opening whole files. `sigmap ask --mode index` emits a two-tier symbol index (`symbol  :start-end` pointers only, no bodies), and `sigmap ask --since <ref>` restricts output to files changed since a git ref. The token budget now degrades gracefully: it collapses signature bodies to anchors before dropping whole files. The dashboard gains a **Token Reduction** panel (baseline vs ranked vs surgical), sourced from the published benchmark.

**Tags:** `surgical context` · `demand-driven` · `delta` · `get_lines` · `mcp` · `--mode index` · `--since` · `dashboard` · `issue #219` · `PR #220`

**Impact:** 10 MCP tools (was 9) · symbol-index mode cuts upfront `ask` context further on top of ranked retrieval, with no `hit@5` regression.

---

### v6.13.0 — Surgical Context Phase 2.1 (JavaScript + member anchors) ✓ (tagged v6.13.0 — 2026-06-05)

Widens line-anchor coverage so demand-driven retrieval actually pays off. The **JavaScript extractor** now emits `:start-end` anchors on top-level functions, classes, exported arrows, and `module.exports` (with a newline-preserving comment strip so line numbers stay exact below `/* … */`). **Class methods and interface members** (TypeScript and JavaScript) now carry their **own** anchor spanning the member body, unlocking method-level `get_lines` targeting. The standalone bundle's extractor factories were re-synced (stale since v6.11.0), and a latent token-budget bug — signature-only accounting that undercounted section headers + the fixed preamble and could exceed `maxTokens` — was made overhead-aware.

**Tags:** `line anchors` · `surgical context` · `javascript` · `member anchors` · `token budget` · `issue #223` · `PR #224`

**Impact:** index-mode token reduction on real repos rises from ~4.6% to **32–42%** (axios 42.1%, fastify 41.1%, svelte 36.8%, vue-core 32.4%), now 100% anchored — with no `hit@5` regression.

---

### v6.14.0 — Hallucination Guard prototype (`verify-ai-output`) ✓ (2026-06-07)

The first headline verification command. `sigmap verify-ai-output <answer.md>` scans an AI answer and flags claims that do not match the repository, composing existing primitives (file map, import resolvers, symbol index) into a deterministic, offline check — no LLM. Three detectors ship in this prototype: **fake-file** (path absent on disk), **fake-import** (relative import that does not resolve, or a bare package missing from `package.json` deps — Node/Python builtins and scoped packages allow-listed), and **fake-symbol** (a called function/class absent from the SigMap symbol index). Markdown report by default, `--json` for CI; exits `1` on any issue, `0` when clean. All external lookups are injectable so the core is unit-testable.

**Tags:** `verify-ai-output` · `hallucination guard` · `fake-file` · `fake-import` · `fake-symbol` · `deterministic` · `offline` · `issue #227` · `PR #228`

**Impact:** new command surface for trust/verification; 65 integration test files pass (13 new). Foundation for the reliable MVP (closest-match suggestions, `fake-test-file`/`fake-npm-script`, 5-repo precision proof).

---

### v6.15.0 — Hallucination Guard Reliable MVP + Memory tools ✓ (2026-06-09)

Two milestones in one release. **`verify-ai-output` Reliable MVP** (#232) grows the Hallucination Guard from three detectors to **five** — adding **fake-test-file** (a referenced `*.test`/`*.spec`/`__tests__`/`test_*.py` path absent on disk) and **fake-npm-script** (`npm run X` not in `package.json` scripts) — and adds **closest-match suggestions** (Levenshtein + file/symbol/script proximity → "Did you mean `loadConfig()` in `src/config/loader.js:42`?", labeled heuristic). The JSON schema is finalized (`{ type, value, line, location, message, confidence, suggestion }`), a standalone **HTML report** (`--report`, red/amber/green, no external assets) renders the findings, and a **proof harness** (`npm run benchmark:verify`) enforces per-detector precision targets (file ≥ 95%, import ≥ 85%, symbol ≥ 75%, script ≥ 95%).

**Memory tools** (#233) close the agent cold-start gap. `sigmap note "<text>"` appends to a cross-session decision log (`.context/notes.ndjson`); `sigmap status` shows branch, dirty files, and index freshness/staleness; and the **`read_memory` MCP tool — the 11th** — recalls recent notes plus the last `ask` session focus so a fresh agent session starts already knowing where work left off.

**Tags:** `verify-ai-output` · `fake-test-file` · `fake-npm-script` · `closest-match` · `--report` · `note` · `status` · `read_memory` · `11 MCP tools` · `PR #232` · `PR #233`

**Impact:** 5-detector Hallucination Guard + heuristic suggestions; 11 MCP tools (was 10); 42 new tests (29 verify + 13 memory); 949 tests passing.

---

### v8.26.1 — Trust Quick Wins II: KNOWN_LIMITATIONS.md ✓ (2026-08-18)

**Patch release — Pillar-A honesty reaches the extraction layer (G1).** New [`KNOWN_LIMITATIONS.md`](https://github.com/manojmallick/sigmap/blob/main/KNOWN_LIMITATIONS.md): a three-tier extractor table grounded in code (Tier 1 AST — Python via `python_ast.py` with regex fallback; Tier 2 anchored regex — the 11 `withAnchor` brace languages, doc hints on 6; Tier 3 pattern/heuristic — the rest plus the generic fallback), the truncation caps (25 signatures/file, 8 members/block) and what falls off, the nested-paren regex gap named plainly as the G4/D1 precondition, and the honest `verify` framing: an index-missing real symbol flags `fake-symbol` at medium confidence — a conservative false positive, never a silent pass. README carries a compact "Extraction honesty" tier label. A guard test drift-locks the doc's counts to `version.json` and cross-checks the Tier-2 count against the extractors that actually call `withAnchor` — the honesty page cannot silently rot.

**Tags:** `KNOWN_LIMITATIONS.md` · `extraction honesty` · `tier label` · `drift guard` · `G1` · `#520` · `PR #521`

**Impact:** the credibility gap a skeptical reviewer finds first is closed in writing; 6 new guard checks (133 files); zero runtime changes.

---

### v8.28.1 — Two silent failures fixed ✓ (2026-08-22)

**Patch release — both bugs failed silently, which is the worst way to fail.** (1) **Python absolute imports** (#532, reported and precisely diagnosed by **@ruurdboeke**): `from package.module import` was resolved against only the importing file's directory and one parent, so `src/`-layout projects lost every graph edge from files nested two or more levels below the source root — and `get_impact` reported **zero importers**, exactly the false signal that says a change is safe. Fixed with an ancestor walk to the project root (nearest first, so existing resolutions keep identical semantics). (2) **Per-module strategy** (#534): the strategy's `context-<module>.md` split files were never merged into the signature index — only `context-cold.md` was — so `sigmap ask` died with "no context file found" and `query_context` returned nothing on every per-module repo. Fixed by generalizing the cold-file merge to every `.github/context-*.md` split, sorted and deterministic.

**Tags:** `extractFileDeps` · `ancestor walk` · `zero importers` · `_enrichSigIndexFromStrategy` · `per-module` · `#532` · `#534` · `PRs #533 #535`

**Impact:** `get_impact` is trustworthy on `src/`-layout Python repos; `ask`/`query_context` work under every strategy; 8 new regression tests (138 files).

---

### v8.28.0 — Arity Guard: calls checked against real signatures ✓ (2026-08-18)

**Minor release — D1 lands, and the tokenizer investment pays out.** New `src/verify/arity.js`: signature parameter lists (exact for JS/TS since v8.27's balanced scanner, exact for Python via the AST) become per-name arity ranges — defaults and TS optionals lower the minimum, `...rest`/`*args`/`**kwargs` mark variadic, destructuring counts as one parameter. Calls in answer code blocks are read over masked text (nested calls and comma-containing strings count correctly), and a call to a **known** repo function outside its `[min, max]` flags **`arity-mismatch` at medium confidence** with the actual repo signature and file as the suggestion. Wired as Hallucination Guard detector 3b, so `verify_suggestion` (MCP) and `sigmap verify-ai-output` inherit it with zero new surface. Precision comes from what it *refuses* to check: ambiguous names (signatures disagree across files), variadic overshoots, dotted method calls, indented members, and every language whose params aren't yet exact. Unknown symbols remain `fake-symbol` territory.

**Tags:** `arity.js` · `arity-mismatch` · `parseParams` · `buildArityIndex` · `extractCallArgCounts` · `D1` · `#529` · `PR #530`

**Impact:** verification now checks argument counts, not just existence — the first grounding capability no grep-based agent loop can replicate; 6 new tests incl. end-to-end (136 files); zero new dependencies.

---

### v8.27.0 — Tokenizer Core I: the balanced scanner, JS/TS unbroken ✓ (2026-08-18)

**Minor release — the v9.0 grounding track opens (G4 increment 1).** New `src/extractors/scan.js`: a hand-rolled scanning core — string-aware comment stripping, string/comment masking, and depth-matched delimiter reading — three deterministic, length- and newline-preserving passes that generalize the repo's own `maskJs` and `readBalancedParens` patterns. Explicitly not tree-sitter. Applied to the JS and TS extractors: every parameter capture that used to truncate at the first `)` is now depth-matched, so `f(a, b = g(x))`, string defaults containing `)` or `//` (`url = "https://x"` used to be corrupted by the naive comment strip), and destructuring-brace params all extract fully, with body and anchor endpoints computed from the real close. TS type annotations strip depth- and quote-aware (`cb: (x: number) => void` → `cb`; `m: Map<K,V> = new Map()` keeps its default). Shipped behind the **byte-identical-or-better gate**: the entire pre-existing exact-output test corpus passes unchanged, and 12 adversarial fixtures prove the new cases. This closes the JS/TS half of the nested-paren gap named in `KNOWN_LIMITATIONS.md` — the stated precondition for arity-checked verification (D1); Go/Java and the rest of Tier 2 follow in later increments.

**Tags:** `scan.js` · `stripComments` · `maskCode` · `readBalanced` · `byte-identical-or-better` · `G4` · `D1 precondition` · `#526` · `PR #527`

**Impact:** JS/TS params are now exact (arity-usable); string-corruption class fixed; 12 new adversarial tests (135 files); 43 extractor modules; zero new dependencies — no tree-sitter, still.

---

### v8.26.0 — Agent Economy III: sigmap skills, the pillar closes ✓ (2026-08-18)

**Minor release — the optimal usage loop becomes installable behavior, and the Agent Economy pillar (F1→F4) is complete.** New `src/skills/skills.js`: two canonical, deterministic skill documents — **sigmap-usage-maximizer** (F3: `ask` before any file read · `get_lines` for anchored ranges · `verify_suggestion` before trusting generated code · `squeeze` big logs/traces/JSON · checkpoint via `create_checkpoint`/`note` · check `get_budget` and summarize-then-drop near budget; token accounting reads the F1 ledger, no LLM calls) and **sigmap-config-optimizer** (the F2 playbook: `tune` → review reasons → `--apply` → `validate`). The installer mirrors the `mcp/install.js` CLIENTS pattern across five clients: Claude Code, Cursor, Windsurf, and Copilot get sigmap-namespaced native files; Codex gets a marker-delimited `AGENTS.md` block inserted **above** the signatures marker — the spot the codex adapter preserves on regeneration, proven by an end-to-end test that regenerates and checks the block, the human content, and the fresh signatures all coexist. Plain `skills install` wires only detected clients (the `--setup` only-touch-existing precedent); `--client`/`--all` create; every install is idempotent.

**Tags:** `sigmap skills` · `sigmap-usage-maximizer` · `sigmap-config-optimizer` · `installSkills` · `above-marker AGENTS.md` · `F3` · `F4` · `#517` · `PR #518`

**Impact:** the measured ~90% read-reduction loop is now default agent behavior, not documentation; Agent Economy pillar complete (F1 budget · F2 tune · F3+F4 skills); 8 new integration tests (132 files); zero new dependencies.

---

### v8.25.0 — Agent Economy II: sigmap tune ✓ (2026-08-18)

**Minor release — the discovery stack becomes a config optimizer.** New `src/config/tune.js`: `buildTuneProposal(cwd)` packages `resolveSourceRoots`, the workspace-marker probe, and client-artifact detection into a deterministic recommended-config diff — one evidence-naming reason per change, explicit user choices never proposed against. Five rules: **srcDirs pin** (confidence-gated; pinned srcDirs are stable across runs and protected from token-budget drops), **monorepo** (reason names the marker found), **adapters** (additive, from `CLAUDE.md`/`.cursorrules`/`.windsurfrules`/`AGENTS.md`), **exclude** (curated vendored/generated dirs at root, defaults preserved), **autoMaxTokens** (fires only when a pinned budget sits below a labeled ~25-tokens/file estimate). `applyTuneProposal` merges into `gen-context.config.json` preserving every user key and is idempotent — a second `tune` proposes nothing. CLI: read-only by default (`--dry-run` alias), `--apply` writes and hands off to `sigmap validate`, `--json` for agents. This is F2 of the Agent Economy pillar — the direct answer to the #1 onboarding failure (bad/default config), built entirely from detection code that already existed.

**Tags:** `sigmap tune` · `buildTuneProposal` · `applyTuneProposal` · `--apply` · `--json` · `F2` · `#514` · `PR #515`

**Impact:** config onboarding is now one command; 10 new integration tests (131 files); zero new dependencies, zero new detection code.

---

### v8.24.0 — Trust Quick Wins I: sigmap redact ✓ (2026-07-28)

**Minor release — the redaction engine goes standalone.** New `src/security/redact.js`: `redactText()` applies the existing 10-pattern secret bank to arbitrary text, masking only the matched substring (`[REDACTED:<pattern>]`) so surrounding context stays readable — the generation-time scanner's whole-line behavior is untouched. Findings carry 1-based line numbers and per-pattern counts. CLI `sigmap redact [file] [--json]` reads a file or stdin and keeps stdout pipe-clean (summary on stderr), so `git diff | sigmap redact` works as a pre-share hygiene step. A fitting validation: GitHub Push Protection rejected the first push of the test fixtures because the fake secrets pattern-matched real credential formats — fixtures are now assembled at runtime so no secret-shaped literal exists in any committed blob.

**Tags:** `redact.js` · `redactText` · `sigmap redact` · `--json` · `stdin` · `#511` · `PR #512`

**Impact:** the pattern bank now covers ad-hoc text, not just SigMap-generated surfaces; 6 new integration tests incl. an every-pattern sweep (130 files); zero new dependencies. Remaining v8.24 plan items (KNOWN_LIMITATIONS.md, SUCCESSION.md, issue triage) are non-code and land outside the release train.

---

### v8.23.0 — Agent Economy I: sigmap budget, get_budget ✓ (2026-07-28)

**Minor release — token savings become queryable *during* the session.** New `src/tracking/budget.js`: `budgetStatus()` turns the existing gain log into a session spend ledger — estimated SigMap-emitted tokens (spent/baseline/saved, op count), optional budget with remaining/percent-used, and generated-context age with a stale flag against `contextTtlDays`. Session identity is `SIGMAP_SESSION` (host-settable) or the UTC day bucket; `recordUsage` stamps every entry, and legacy entries match day buckets by timestamp prefix. Surfaces: `sigmap budget [--json] [--session] [--budget]` and the **21st MCP tool `get_budget`**, which advises degrade-gracefully tactics (terse encoding, `squeeze`, summarize-then-drop) at ≥80% budget. Scope honesty by design, per the improvement-plan audit: the ledger counts what SigMap emitted (chars/4, labeled `estimated-tokens` everywhere) — not the chat's total spend, which a CLI cannot see — and the unverifiable prompt-cache "injection TTL" idea was cut in favor of measurable context-file age. Config keys `sessionBudgetTokens` / `contextTtlDays`, both opt-in `null`.

**Tags:** `budget.js` · `budgetStatus` · `sessionKey` · `SIGMAP_SESSION` · `get_budget` · `sessionBudgetTokens` · `contextTtlDays` · `#508` · `PR #509`

**Impact:** 21 MCP tools; 7 new integration tests (129 files); zero new dependencies; F2–F4 of the Agent Economy plan (auto-tune, usage skill, multi-client skills install) queue next.

---

### v8.22.0 — Hard Corpus: no-leakage split, leakage gate, size buckets ✓ (2026-07-28)

**Minor release — the benchmark corpus stops grading itself on filename matching.** (1) **A3 leakage criterion:** new `src/eval/corpus.js` — a task *leaks* when its BM25-tokenized query shares a stemmed token with the tokenized basenames of its expected files; the criterion reuses the production tokenizer, so `payments` leaks against `payment.js` and camelCase basenames split exactly as the ranker sees them. `scripts/validate-task-corpus.mjs` is the CI gate: exit 1 if any `split: "hard"` task leaks (easy-split leakage is reported as info — it measured **90 of 110 pre-existing tasks leaking**). (2) **Hard split:** task JSONL carries an optional `split` field (`easy` default); 15 hand-authored, leak-free hard tasks land across express, flask, axios, fastify, and gin. (3) **Size buckets:** `benchmark:honest` now reports hit@5/MRR per split *and* per repo-size bucket (small <200 / medium ≤1000 / large >1000 files **scanned on disk** — deliberately not the budget-capped context index, which measures `maxTokens` rather than the repo). The result is the honest number the split exists to expose: **hard-split hit@5 33.3% vs the grep baseline's 53.3%** — with leakage removed, grep currently wins, which is the measured vocabulary-mismatch ceiling that repo-mined query expansion (B2, v9.0) is scheduled to attack. Also ships the MiniMax LLM-ablation provider (`MINIMAX_API_KEY`, OpenAI-compatible, default MiniMax-M3) — thanks **@octo-patch** (PR #504).

**Tags:** `corpus.js` · `queryLeakage` · `validateTasks` · `sizeBucket` · `validate-task-corpus.mjs` · `split: hard` · `benchmark:honest splits/buckets` · `minimax ablation provider` · `#505` · `PR #506` · `PR #504`

**Impact:** the corpus's leakage rate is now measured (90/110 easy tasks) and gated for hard tasks; the semantic-retrieval gap has a hard number (33.3% vs 53.3%); 8 new integration tests (128 files); zero new dependencies.

---

### v8.21.0 — Semantic Bridge II: Go/Rust/Java doc hints, centrality blend ✓ (2026-07-19)

**Minor release — the doc-comment bridge reaches three more languages, and the import graph gains a principled ranking prior.** (1) **B1b:** `buildDocHints` lands in the Go extractor (godoc `//` blocks above top-level `func`/`type`, compiler directives `//go:`/`nolint` skipped), the Rust extractor (`///` blocks above `pub fn`/`struct`/`enum`/`trait` and impl methods, `#[attr]` lines between doc and declaration tolerated), and the Java extractor (Javadoc on type declarations *and* public/protected members; tag-only blocks produce no hint) — first prose sentence, 60-char cap, `  # <hint>` after the anchor, byte-format identical to the Python/JS/TS hints. Hints are mined from the original source since `extract()` strips comments before matching. (2) **B3:** new `src/graph/centrality.js` — zero-dependency power iteration over the forward import graph (damping 0.85, 20 iterations, deterministic), max-normalized; `rank()` blends `0.3 × centrality` onto **positively-scored files only** as a tie-breaker (`signals.centrality`), gated by the new opt-in `retrieval.centralityBlend` and wired like `callGraphBoost` (MCP `query_context` + CLI `ask`/`--query`, non-fatal). The `benchmark:centrality-blend` A/B measured **both arms at 77.8% hit@5 (+0 tasks)** over 90 tasks / 18 repos — non-regressing but neutral on the lexical corpus, so the flag ships **off** per the measure gate; the v8.22 hard-split corpus is the next chance to show a real delta.

**Tags:** `buildDocHints (Go/Rust/Java)` · `centrality.js` · `retrieval.centralityBlend` · `signals.centrality` · `benchmark:centrality-blend` · `#501` · `PR #502`

**Impact:** doc hints on 6 languages total (Python, JS, TS, Go, Rust, Java); centrality prior measured +0 → shipped dark; 11 new integration tests (127 files); zero new dependencies.

---

### v8.20.0 — Semantic Bridge I: JS/TS doc hints, sigmap memory ✓ (2026-07-19)

**Minor release — the JS/TS extractors gain the doc-comment hints Python has carried for releases.** `buildDocHints` mines the first prose sentence of the JSDoc block preceding each top-level function form and appends it after the line anchor as `  # <hint>` — byte-format identical to Python's `extractDocHint`. A tempered comment-body pattern prevents cross-block misattribution (caught in smoke testing). The trade was measured and shipped honestly: hints add English tokens that compete on the lexical corpus — **hit@5 86.4% → 85.5% task-level (−0.9pt, one borderline task: `svelte-t002`), honest lift 2.02× → 2.00×**, grep baseline unchanged — shipped default-on per the v8.18 anchors precedent and Python-parity, with the semantic upside proven directly by a new vocab-mismatch fixture (a query fully disjoint from every identifier retrieves the file *only* via its hint; BM25 score 0 without). The v8.22 hard-split corpus will measure that upside at scale. Also ships `sigmap memory`: one inspect/prune view over the existing `.context/` cross-session stores (session, notes, weights, evidence, gain, usage) with `--json` and explicit `--clear` — no new storage.

**Tags:** `buildDocHints` · `firstDocSentence` · `sigmap memory` · `memory --clear` · `vocab-mismatch fixture` · `#498` · `PR #499`

**Impact:** doc hints on 3 JS + 2 TS top-level forms (Python-parity); measured −0.9pt lexical-corpus trade documented; 10 new integration tests (126 files); memory command over 6 existing stores; zero new dependencies.

---

### v8.19.0 — Honest Numbers: measured grep baseline, random-baseline lift retired ✓ (2026-07-19)

**Minor release — the published retrieval lift now comes from a measurement, not a strawman.** The old headline compared hit@5 against random file selection (`min(1, 5/fileCount)` ≈ 13.6%) — a 6.4× lift nobody could defend. The new `npm run benchmark:honest` (`scripts/run-honest-benchmark.mjs`) scores the production ranker against an **internal single-shot grep-agent baseline** — a pure-Node, zero-dependency, child-process-free repo scan ranked by distinct-term coverage then occurrences, `.gitignore`-aware — on the same 110-task / 19-repo corpus with the same scorer. **Measured: SigMap 86.4% hit@5 / MRR .780 vs grep 42.7% / .228 → 2.02× lift (+43.6pt)**, reproduced exactly across independent runs. `grep_baseline_hit_at_5` + `grep_lift` flow from the report through `computeLatest` → latest.json → every human surface; task success is labeled a **retrieval-tier proxy** everywhere; and a claim-hygiene guard test makes the retired numbers a one-way door — 6.4×, 13.6%, and the unsourced "10% without" can never reappear on README or llms surfaces. (Release hygiene note: the benchmark ordering matters — the quality suite regenerates shared repo contexts with a default config, so `benchmark:honest` runs immediately after the retrieval harness, the same cross-suite-skew class the v8.16.1 hermetic fix addressed.)

**Tags:** `benchmark:honest` · `grep_baseline_hit_at_5` · `grep_lift` · `honest-baseline.test.js` · `claim hygiene` · `#495` · `PR #496`

**Impact:** honest lift 2.02× (+43.6pt) vs single-shot grep, measured and reproduced; 6.4×-vs-random retired from all human surfaces; 7 new guard checks (125 test files); zero new dependencies, zero child processes.

---

### v8.18.0 — Phase-2 closer: anchors everywhere, surface enrichment, live-loop framing ✓ (2026-07-12)

**Minor release — with these three changes, every §7.4 Phase-2 quality-ceiling row is done or measure-gated-closed.** (1) **Anchors:** the v8.17 recipe applied to Kotlin, Swift, PHP, Scala, and Dart — all five fixture files anchor 100%, bringing Surgical Context anchors to **9 brace languages**. (2) **Route surface-enrichment** (opt-in `retrieval.surfaceEnrichment`): `enrichWithSurfaces` appends deterministic `route METHOD /path` pseudo-signatures to the rankable index; the new `benchmark:surface-enrichment` A/B measured **+0** on the file-discovery-flavored 90-task corpus, so the default stays off — while the fixture test proves the value case directly (a route-worded query retrieves the controller *only* when enriched). (3) **Live-loop framing** (docs): the MCP guide now positions `query_context` → `get_callee_signatures` → `get_lines` → `verify_suggestion` → `get_method_impact` as what an agentic loop *calls for grounding* — grep finds; SigMap grounds.

**Tags:** `line-anchors` · `9-languages` · `retrieval.surfaceEnrichment` · `benchmark:surface-enrichment` · `measure-gated` · `live-loop` · `#486` · `#488` · `#490` · `PRs #487 #489 #491`

**Impact:** Phase-2 scorecard complete; anchors on 9 brace languages; 9 new integration tests (124 derived); two honest measured decisions recorded (+0 → dark); headline unchanged (87.8%).

---

### v8.17.0 — Line anchors for Java, Go, Rust, and C# ✓ (2026-07-12)

**Minor release — the §7.4 Lang ceiling's first concrete piece, and a long-named roadmap item.** Only the JS/TS/Python extractors emitted `:start-end` anchors; on Java/Go/Rust/C# repos every Evidence Pack had empty `sourceLines` and zero `anchorCoverage`, and `get_lines` (Surgical Context) had nothing to fetch. The four extractors now anchor everything — brace-matched real ranges on bodied types/functions, `:n-n` on single-line members, single-line anchors on Rust bodyless items. The hidden prerequisite was the fix that mattered: their comment strips collapsed block comments outright, so match indices could never map to true line numbers; the strips are now **newline-preserving** (regression-tested with a multi-line license header above declarations). Evidence Pack `anchorCoverage` goes **0 → 1.0** on those languages; `parseAnchor` round-trips every anchor.

**Tags:** `line-anchors` · `Surgical-Context` · `Java` · `Go` · `Rust` · `C#` · `newline-preserving-strip` · `#483` · `PR #484`

**Impact:** anchorCoverage 0 → 1.0 on 4 languages; `get_lines` usable across them; 5 new integration tests (123 derived); 4 expected fixtures regenerated (anchors only); remaining languages (Kotlin/Swift/PHP/Scala/Dart) follow the same recipe.

---

### v8.16.1 — Hermetic grounding benchmark (CI hygiene) ✓ (2026-07-12)

**Patch — benchmark isolation; the published package is unchanged.** A full benchmark sweep revealed that the grounding suite regenerated the shared cached repos with a plain default config, silently overwriting the retrieval harness's per-repo-scoped contexts — any later context-reading suite saw degraded indexes (the callgraph A/B measured 32.2% hit@5 instead of ~87.8%). `measureGroundingHermetic` now snapshots every context artifact before its regen and restores them byte-exactly after measuring. For a project whose pitch is deterministic, auditable numbers, cross-suite skew was a credibility bug of exactly the class the Trust Hygiene tier exists to kill — found and fixed the same day.

**Tags:** `benchmark-isolation` · `measureGroundingHermetic` · `snapshot-restore` · `#480` · `PR #481`

**Impact:** grounding → A/B parity verified (87.8% both sides, was 32.2%); no first-run retrieval transient; 3 regression tests (122 derived); headline metrics unaffected.

---

### v8.16.0 — Evidence Pack schema v2 ✓ (2026-07-12)

**Minor release — the last Machine-lever item from the master plan §7.4; with it, every Phase-1 and Phase-2 checklist item is shipped or measure-gated-closed.** Schema v2 is additive over v1: `schemaVersion: '2.0'` plus a `schemaUrl` pointing at a **published draft-07 JSON Schema** ([sigmap.io/schemas/evidence-pack-2.json](https://sigmap.io/schemas/evidence-pack-2.json)) so CI and agents can *validate* a pack, not just parse it. `files[].riskFactors` exposes every matched risk category in precedence order — a migration touching payments carries `['migration','payment']` — while `riskLabel` stays the dominant factor for v1 consumers. A `testDiscovery` provenance block states the measured accuracy of the related-tests method (**F1 0.98, precision 0.971, recall 0.988** over 3,701 pairs / 28 repos), with the constants guard-tested against the committed benchmark report so they can never silently drift. `generator: { name, version }` records what built the pack. Byte-stable; `contextHash` determinism preserved. _(Also the first published release carrying v8.15.0, which was prepared but never tagged standalone.)_

**Tags:** `evidence` · `schema-v2` · `schemaUrl` · `riskFactors` · `testDiscovery` · `generator` · `#477` · `PR #478`

**Impact:** packs are validatable against a published schema; multi-factor risk; measured related-tests provenance; 8 new integration tests (121 derived); v1 consumers unaffected (additive).

---

### v8.15.0 — Call-graph ranking boost, measured and shipped dark ✓ (2026-07-11)

**Minor release — the milestone item "call-graph edges into ranking" is done, and the default is OFF because the measurement said so.** `buildCallFileGraph` collapses symbol edges to deterministic file-level bidirectional edges; `rank()` gains an opt-in single-hop, hub-suppressed call-neighbor boost (`callHop: 0.30`, `callGraphBoost` explain signal), wired config-gated into `ask`, `--query`, and `query_context` via `retrieval.callGraphBoost: false`. The new `npm run benchmark:callgraph-boost` A/B ran 90 tasks across 18 cached repos through the full ranker: import-graph arm **80% hit@5**, +call-graph arm **80%** — delta **+0, no repo moved**. Per the measure-first gate the default stays off; the boost targets call-topology-heavy repos (Go/Java same-package) where import edges structurally can't see the relationship — a shape the benchmark corpus doesn't stress. The headline BM25 harness is untouched (87.8% reproduces). This is the philosophy working as designed: the feature exists, the number decides the default, and the A/B script is the standing gate for revisiting it.

**Tags:** `retrieval.callGraphBoost` · `buildCallFileGraph` · `callHop` · `benchmark:callgraph-boost` · `measure-gated` · `+0` · `#474` · `PR #475`

**Impact:** measured A/B +0 (80% → 80% hit@5) — default off; 5 new integration tests (120 derived); default-path ranking byte-identical; headline unchanged.

---

### v8.14.0 — Call-graph for Java, Go, and Rust (GR1) ✓ (2026-07-11)

**Minor release — the method-level call-graph goes from 2 to 5 languages.** New def extractors in `src/graph/call-graph.js`: Go `func` + receiver methods (parenthesized return lists handled), Java methods + constructors (generics/`throws` tolerated; control-flow keywords and `new Foo(){}` anonymous classes rejected), and Rust `fn` incl. generics + `where` clauses and `impl` methods (bodiless trait declarations skipped). A **lifetime-safe `maskRust`** masker lets `'a` lifetimes pass through while masking char literals and strings — the one place the JS masker would corrupt offsets. Because Go/Java call same-package functions across files with *no import statement*, same-directory same-language siblings join the resolution scope (sorted, deterministic). Every consumer inherits the languages with zero further changes: `--callers`/`--callees`, GR2 blast-radius scoring, `review-pr` method-blast findings, and `get_method_impact`. Per North-Star #1, unparseable constructs are skipped — never a parser dep.

**Tags:** `call-graph` · `Java` · `Go` · `Rust` · `maskRust` · `same-package-scope` · `GR1` · `#471` · `PR #472`

**Impact:** call-graph consumers now work on Go/Java/Rust repos; 9 new integration tests (119 derived); JS/TS + Python behavior regression-tested unchanged; benchmark headline unchanged (hit@5 87.8%).

---

### v8.13.0 — Method-level blast-radius scoring (GR2) ✓ (2026-07-11)

**Minor release — the biggest Phase-2 lever from the master plan's §7.4 scorecard.** The D4 method-level call-graph finally gets consumers. New `src/graph/blast-radius.js` reverse-BFSes each changed file's defined symbols and scores the change with a documented deterministic formula — `min(100, direct×4 + transitive×1)`, tiers none/low/medium/high/critical. Three surfaces consume it: `review-pr` attaches `methodBlast` and fires a `method-blast` finding on high/critical tiers; the **PR Evidence** report adds a per-file *Method blast radius* line (impacted function count, score/tier, top caller ids); and the new **`get_method_impact`** MCP tool gives agents per-symbol blast radius (callers) or dependencies (callees) — **19 → 20 MCP tools**. A reviewer now sees *which functions break*, not just which files. Graph optional: repos without a resolvable call graph degrade gracefully.

**Tags:** `blast-radius` · `method-blast` · `get_method_impact` · `20 MCP tools` · `review-pr` · `PR Evidence` · `GR2` · `#468` · `PR #469`

**Impact:** deterministic per-file blast score/tier in review output; 10 new integration tests (118 derived); dogfooded on its own diff — flagged `src/graph/builder.js` at score 37/100 (high, 19 impacted functions).

---

### v8.12.0 — `sigmap wiki`: deterministic architecture narrative (D9) ✓ (2026-07-11)

**Minor release — the final unstarted in-boundary item from the master plan's §3.5 backlog; D1–D9 are now all shipped.** `sigmap wiki` writes `.context/WIKI.md`, a one-page onboarding narrative composed entirely from data SigMap already computes: overview (indexed files, modules, signature tokens, health grade), a module rollup with key files, dependency flow (the hub files with the widest blast radius, entry points, cycle count from the import graph), a conventions summary, and navigation pointers. Template prose only — **no LLM, no network, no timestamps** — so two consecutive runs on an unchanged repo are byte-identical (regression-tested; the Philosophy Gate holds). `--out` overrides the path; `--json` emits the structured data. Graph paths are relativized against the builder's normalized base so hubs/entries render repo-relative even on macOS tmpdirs.

**Tags:** `wiki` · `.context/WIKI.md` · `--json` · `--out` · `no-LLM` · `byte-stable` · `D9` · `#465` · `PR #466`

**Impact:** the in-boundary backlog (D1–D9) is complete; 6 new integration tests (117 derived tests); zero new dependencies; benchmark headline unchanged (hit@5 87.8% — wiki adds no retrieval-path code).

---

### v8.11.0 — Terse signature encoder, measured (D7) ✓ (2026-07-11)

**Minor release — the master plan's last unstarted v8.5-tier item, shipped under its measure-first gate.** `--terse` (or `terse: true` in config) deterministically compacts every signature line — `function `→`fn `, tightened params/arrows/exports — while preserving the `:start-end` line anchor and any trailing doc hint byte-exactly, so `get_lines`, evidence packs, `parseAnchor`, symbol extraction, and ranker parse-back all keep working (regression-tested). Off by default: without the flag, output is byte-identical. The public number comes from the new `npm run benchmark:terse` gate run on the SigMap repo itself — never from another tool's prose-compression claims (the borrowed "65–75%" figure correctly did not apply).

**Tags:** `--terse` · `terse: false` · `src/format/terse.js` · `benchmark:terse` · `measure-first` · `D7` · `#462` · `PR #463`

**Impact:** measured −16.1% signature-block tokens (10,232 → 8,580 across 143 files / 780 sig lines); 15 new integration tests (116 derived tests); anchors byte-exact; default output unchanged.

---

### v8.10.0 — Honesty fixes across the CLI surface ✓ (2026-07-09)

**Minor — a brutal code-review audit turned into ~40 regression tests, closing the gap between what each command claims and what it does.** `judge` gained claim-level grounding — it fails an answer that cites a symbol/file/import the context never contains, catching a hallucination that pure word-overlap would pass. `validate --query` emits a retrieval-confidence report for natural-language queries (e.g. `"login rate limit"`) instead of the previous silent no-op. `plan` now uses the real planner, fixing a bug where the impact traversal ignored its depth cap and ran unbounded, and surfaces a true blast radius. `review-pr` adds a content-based secret scan (a hardcoded key in an innocently-named file is now flagged). The dependency graph resolves `tsconfig`/`jsconfig` path aliases, re-exports, and dynamic `import()` — lifting `--impact`, `--map`, `--callers`, `plan`, and `review-pr` at once. `--health` returns an auditable `components[]` breakdown and no longer scores a never-generated repo as 100/A. `gain`/`--cost` unify on a single pricing table; `conventions` stops misreporting single-word repos as "100% camelCase"; `suggest-profile` infers from the staged diff; `learn`/`create` get honest labels; and the JS/TS extractors disclose truncation with a visible `… +N more` marker instead of silently dropping the tail. Zero new dependencies; bundle reproducible from `src/`.

**Tags:** claim-grounding, retrieval-confidence, alias-resolution, secret-scan, auditable-health, honest-labels

**Impact:** ~40 new regression assertions (guard test count 112 → 115). Retrieval hit@5 stable at 87.8% and token reduction 97.0% — these were correctness and labeling fixes, not compression changes.

### v8.9.1 — Self-healing Pages deploy (CI) ✓ (2026-07-06)

**Patch — CI only; the published package is unchanged from 8.9.0.** Every release's first GitHub Pages deploy went red on a GitHub-side transient (`Deployment failed, try again later` within seconds of the push-triggered deploy; the identical artifact re-deployed a minute later always succeeded, but `actions/deploy-pages` treats that status as terminal). `pages.yml` now lets the first attempt fail softly, waits 60s for the backend to settle, and retries once — green if either attempt deploys, red only if both fail (the rare stuck-sha case). Zero new dependencies.

**Tags:** `ci` · `pages.yml` · `deploy-pages` · `continue-on-error` · `retry` · `#451`

**Impact:** releases no longer need a manual Pages re-run; no change to the npm package or metrics.

---

### v8.9.0 — Detached watch daemon (D1) ✓ (2026-07-06)

**Minor release — the watcher, detached.** `sigmap --watch` kept the signature index fresh but held a terminal in the foreground. This adds `sigmap daemon start|stop|status`, running `--watch` as a managed background process so you start it once and forget it — the roadmap's #1 friction win. The watcher is launched as a detached child (an arguments array, never a shell string) and tracked by a PID file under `.context/`, with output to `.context/daemon.log`. `start` is idempotent and cleans a stale PID file; `stop` SIGTERMs and clears the file; `status` reports the PID and exits 0/1. Every subcommand supports `--json`. Zero-dependency, shell-free, deterministic — no change to retrieval, so the benchmark headline is unchanged (hit@5 87.8%).

**Tags:** `daemon` · `daemon start/stop/status` · `--watch` · `detached` · `.context/daemon.pid` · `D1` · `#447` · `PR #448`

**Impact:** background index freshness with one command; new `src/daemon/daemon.js`; 8 new integration tests (112 derived tests).

---

### v8.8.1 — Byte-stable context, reproducible benchmark ✓ (2026-07-05)

**Patch release — closing the determinism residual (#440).** v8.8.0 hardened three nondeterminism sources but left a residual: `gen-context` output still varied run-to-run on a few large repos. The cause was the token-budget recency boost stamping `mtime = Date.now()` on every recently-committed file — on repos where nearly every file is "recently changed", consecutive files landed on the *same millisecond*, so which equal-priority files shared a millisecond (and fell through to the `filePath` tie-break) shifted run to run, swapping which files survived the budget cutoff. The `Date.now()` value silently encoded the alphabetical walk order the budget relied on; the nondeterminism was only the collisions. Replaced with a deterministic monotonic counter (`nextRecentMtime`) that reproduces the same processing-order ranking without collisions. All 43 benchmark repos are now byte-identical across two clean runs, and the retrieval benchmark reproduces a single hit@5 (**87.8%**) instead of flapping 85.6–87.8%. A byte-equality regression guard runs gen-context twice on a committed fixture and asserts equality.

**Tags:** `determinism` · `byte-stable` · `nextRecentMtime` · `token-budget` · `reproducible-benchmark` · `#440` · `PR #444`

**Impact:** reproducible headline (hit@5 87.8%, unchanged in value, now byte-stable); 43/43 repos byte-identical; 1 new regression guard (111 derived tests).

---

### v8.8.0 — `squeeze_output` MCP tool + `squeeze --response` (D6) ✓ (2026-07-05)

**Minor release — the squeeze engine, exposed mid-session.** The always-on squeeze engine (`src/squeeze/`) that powers `sigmap squeeze` was reachable only from the CLI on pasted input. This exposes it as the **19th MCP tool** (18 → 19) — `squeeze_output({ content })` — so an agent can compress noisy tool/command output (a stack trace, CI/build log, or JSON payload) *before it enters context*: it keeps the signal, strips the noise, enriches the top stack frame, and reports token-reduction stats, passing input through unchanged when nothing is squeezable. Also adds `sigmap squeeze --response <file|->`, naming the agent/tool response input explicitly (mirroring `judge --response`). Zero-dependency, offline, deterministic — the last A+ ceiling item (Machine 9→10): the engine already shipped, this just exposes it.

**Tags:** `squeeze_output` · `squeeze --response` · `19 MCP tools` · `mid-session compression` · `D6` · `#437` · `PR #438`

**Impact:** 19 MCP tools (was 18); the deterministic squeeze engine reachable by agents mid-session and named on the CLI; 6 new tests; no retrieval/token code changed.

---

### v8.7.1 — Multi-model cost savings + verified pricing ✓ (2026-07-05)

**Patch release.** The quality benchmark reported API input-cost savings for GPT-4o only; it now reports **GPT-4o, Claude Sonnet, and Claude Haiku** side by side (`scripts/run-quality-benchmark.mjs` gains a per-model "cost savings by model" table), and `docs-vp/guide/quality-benchmark.md` shows all three. Hardcoded Claude rates in `src/tracking/pricing.js` (the `sigmap gain` dashboard's cost assumptions) were corrected to current published pricing — Haiku $0.80→$1.00, Opus $15→$5.00 — verified 2026-07 (per 1M input tokens: GPT-4o $2.50, Sonnet 5/4.6 $3.00, Haiku 4.5 $1.00). Makes the point explicit: **token reduction is model-agnostic, but the dollar figure scales with each model's input rate.**

**Tags:** `benchmark` · `cost` · `pricing` · `multi-model` · `haiku` · `sonnet` · `#433` · `PR #434`

**Impact:** cost story now covers three model tiers; stale pricing corrected. No retrieval/token code changed — the saved run reflects corpus run-to-run drift (86.7% hit@5, within the noise band); the token-based cost figures are unaffected.

---

### v8.7.0 — Method/caller-level call-graph (D4 v1) ✓ (2026-07-05)

**Minor release — the graph goes from files to functions.** SigMap's dependency graph was file-level only (imports → `--impact`). New `src/graph/call-graph.js` adds **symbol-level** edges — *which function calls which function* — and the **method-level blast radius** of changing one symbol, for **JS/TS + Python**. Definitions are extracted with real body ranges (brace-matching for JS, indentation for Python) over comment/string-masked source, so literals never create phantom edges; each call site resolves with high precision — same-file def first, then a directly-imported file — and unresolved names produce no edge. Exposed as `buildCallGraph`/`methodImpact`/`methodCallees` and the `--callers`/`--callees` CLI (with `--json`/`--depth`), mirroring `--impact`. This is the plan's single hardest unbuilt gap and the biggest remaining lever on graph intelligence (v9.5 GR1).

**Tags:** `graph` · `call-graph` · `method-level` · `blast-radius` · `D4` · `--callers` · `--callees` · `#429` · `PR #430`

**Impact:** moves graph intelligence from file-level to function-level; +10 tests (110 total). The call-graph does not touch ranking, so retrieval is unaffected by design — the latest saved run measures 87.8% hit@5 / 97% token reduction (within the corpus's run-to-run noise band).

---

### v8.6.0 — Phase 1 "bank the A": harness, header pins, verify flagship ✓ (2026-07-05)

**Minor release — the grounding moat's supporting surface.** Three master-plan Phase 1 items land together, all zero-dependency and deterministic. **G1 — public reproducible benchmark harness:** new `public-benchmarks/` (`repos.csv`, `queries.json`, `run.sh`, `score.mjs`, `README.md`) is a self-contained, third-party-runnable retrieval harness — it shallow-clones 18 pinned repos, maps each with `gen-context.js`, ranks 90 queries with the **shipped** BM25 ranker (`src/retrieval/bm25.js`), and reports hit@1/hit@5/MRR. Turns the published retrieval numbers into a third-party-verifiable fact; dev-only (excluded from the npm package). **D8 — version pins in the context header:** the generated header now carries a `## versions (installed direct deps)` block of sorted `name@version` pins (JS + Python), via new `collectVersionPins()` in `src/verify/lib-index.js`, gated by the `versionPins` config key — agents ground against what is actually installed. **G2 — `verify` flagship:** `sigmap verify` is now a first-class alias of `verify-ai-output` with a dedicated README/CLI-reference section, positioning deterministic grounding as the headline.

**Tags:** `grounding` · `public-benchmarks` · `G1` · `D8` · `version-pins` · `G2` · `verify` · `flagship` · `#425` · `PR #426`

**Impact:** grounding surface completed toward the v9.0 "A" tier; benchmark reproducibility now third-party-runnable. Benchmark metrics unchanged; +12 tests (109 total).

---

### v8.5.0 — Deterministic query expansion ✓ (2026-07-05)

**Minor release — a vocabulary-mismatch recall aid.** The identifier-aware BM25 ranker (`src/retrieval/bm25.js`) now bridges common code-domain synonyms and abbreviations via a curated table (`auth`↔`authentication`/`login`, `db`↔`database`, `ctx`↔`context`, `config`↔`configuration`, `req`/`res`, `init`, `impl`, …). `expandQuery()` adds synonyms to the query tokens at a **discount weight (0.15)** so an exact-term match always outranks a synonym-only match; documents are unchanged. It's wired through the ranker, so `sigmap ask`, `--query`, and MCP `query_context` all benefit. **Honest result:** a weight sweep on the retrieval benchmark showed higher weights *regress* hit@5, so the shipped setting (0.15) is **benchmark-neutral** — this is a recall aid for real users whose query vocabulary differs from the code (a case the curated benchmark doesn't exercise), *not* a hit@5 improvement. Zero-dependency, deterministic.

**Tags:** `retrieval` · `bm25` · `query-expansion` · `synonyms` · `recall` · `measured` · `#421` · `PR #422`

**Impact:** closes a lexical-recall gap for vocabulary-mismatch queries with no retrieval regression. Benchmark metrics unchanged (86.7% hit@5, 97% token reduction); +5 tests.

---

### v8.4.0 — PR Evidence Report (v9.0 G3) ✓ (2026-07-05)

**Minor release — a branded, deterministic review artifact.** SigMap already had `review-pr` findings and `get_diff_context`, but no single Markdown comment an agent or CI could post on a PR. New `src/review/pr-evidence.js` folds together, per changed file, its extracted **signatures**, **blast radius** (direct/transitive importers, impacted tests + routes), cross-language **related tests**, a **risk label**, and the `review-pr` findings (scope drift, god-node edits, missing tests, security-sensitive files). `sigmap review-pr --markdown` (alias `--evidence`) renders the branded **"🔍 PR Evidence Report"** — with **no wall-clock timestamp**, so it's byte-stable given a fixed tree — and the exit code reflects the review pass/fail, so the same command can both post the comment and gate the PR in CI. Reuses shipped zero-dep modules; git stays behind the shell-free `git()` util.

**Tags:** `review` · `pr-evidence` · `blast-radius` · `G3` · `--markdown` · `ci-gate` · `deterministic` · `#417` · `PR #418`

**Impact:** the machine-consumable review artifact the plan named (G3) — *"what changed, what it touches, and what to test"* in one deterministic comment, no LLM. Retrieval/token metrics unchanged (86.7% hit@5, 97% token reduction); +3 tests.

---

### v8.3.0 — Python site-packages grounding (the moat, both ecosystems) ✓ (2026-07-05)

**Minor release — the grounding moat now spans JS/TS *and* Python.** v8.1/v8.2 grounded AI suggestions against installed `node_modules` libraries; this extends `buildLibraryIndex` (`src/verify/lib-index.js`) with a Python pass: it reads direct deps from `requirements.txt`/`pyproject.toml` (PEP 621 + Poetry), discovers the project's venv `site-packages` (`.venv|venv|env` → `lib/python*/site-packages`, or `Lib/site-packages` on Windows) **without spawning Python**, resolves each dep's installed module + version (`*.dist-info`, D8) with PEP 503 name normalization, and extracts exported names from its `__init__.py`/`.pyi` (`__all__`, top-level `def`/`class`, public assignments, and `from … import` re-exports). Both ecosystems merge into one symbol index, so `verify-ai-output` and the `verify_suggestion` MCP tool stop false-flagging genuine installed-Python-library calls. Zero-dependency, deterministic (byte-stable given a fixed installed tree), cached via `sig-cache`.

**Tags:** `verify` · `python` · `site-packages` · `venv` · `G5` · `D5` · `private-api-grounding` · `D8` · `#413` · `PR #414`

**Impact:** installed-library grounding now covers the two biggest ecosystems (JS/TS + Python); Phase-1 of the grounding moat is feature-complete. Retrieval/token metrics unchanged (86.7% hit@5, 97% token reduction); +4 tests.

---

### v8.2.0 — `verify_suggestion` MCP tool (the moat, for agents) ✓ (2026-07-04)

**Minor release — the grounding moat, made consumable by agents.** v8.1.0 built local-library grounding inside the `verify-ai-output` CLI; this exposes it as the **18th MCP tool** so a coding agent can verify its own generated code against the repo **and the libraries actually installed** in `node_modules` — *before it writes*. `verify_suggestion({ code })` runs the Hallucination Guard against the repo signature index and the installed-library symbol index (G5/D5), returning a clean/✗ verdict, one line per issue (fake file / import / symbol / npm-script + closest-match suggestions), and a **D8** line listing the installed libraries verified against with pinned versions (`name@version`). Reuses the shipped `verify()` core; deterministic, offline, zero-dependency; graceful on missing/empty `code`.

**Tags:** `mcp` · `verify_suggestion` · `18-mcp-tools` · `G5` · `D5` · `private-api-grounding` · `D8` · `#409` · `PR #410`

**Impact:** MCP surface **17 → 18 tools**; the moat is now callable by the agents that consume SigMap's grounding. Retrieval/token metrics unchanged (86.7% hit@5, 97% token reduction); +5 tests.

---

### v8.1.0 — Local-library signature index (v9.0 G5/D5, the moat) ✓ (2026-07-04)

**Minor release — the private-API grounding moat, v1.** SigMap's hallucination guard can now verify AI suggestions against the libraries **actually installed** in `node_modules`, not just declared dependency *names* — a capability no competitor offers (Context7 knows only *public* library docs; SigMap grounds against the real installed tree). New `src/verify/lib-index.js` resolves each **direct** dependency, reads its version (**D8 version pinning**) and TypeScript declaration entry (`types`/`typings`, else `index.d.ts`), and deterministically extracts the exported symbol names — bounded, cached via `src/cache/sig-cache.js`, graceful on missing/untyped/malformed packages. `verify-ai-output` unions those symbols into its known-symbol universe, so genuine library calls (`Router()`, `debounce()`) stop being false-flagged as `fake-symbol`; the summary gains `librariesIndexed` + `libraries` (`name@version`). Auto-runs from the project's `node_modules`; scope v1 is JS/TS `.d.ts` (Python site-packages + a standalone `verify_suggestion` MCP tool follow). Zero-dependency, deterministic — byte-stable given a fixed installed tree.

**Tags:** `v9.0` · `G5` · `D5` · `local-library-index` · `verify-ai-output` · `private-api-grounding` · `D8-version-pinning` · `#405` · `PR #406`

**Impact:** verify-ai-output no longer false-flags real installed-library calls; suggestions are grounded against repo + private + installed-lib symbols with pinned versions. Retrieval/token metrics unchanged (86.7% hit@5, 97% token reduction); +8 tests.

---

### v8.0.0 — v8.5 repo-context coverage, measured test discovery, richer risk labels ✓ (2026-07-04)

**Major release (v8 milestone) — v8.5 "Repo-Context Coverage & Test Discovery" (C1 + C2 + C3).** Closes the map-completeness gaps so the signature map can be trusted as *complete*. **C1 (coverage):** four dedicated zero-dependency `src/map/` analyzers — environment variables (`env-schema.js`), Build & CI (`build-ci.js`), Config & manifests (`config-manifest.js`), and Database migrations (`migrations.js`) — extend `PROJECT_MAP.md` and the MCP `get_map` sections beyond functions/classes/routes into the repo's operational surface. **C2 (test discovery):** `findRelatedTests` now normalizes cross-language conventions (`test_x.py`↔`x.py`, `x_test.go`↔`x.go`, `XTest.java`↔`X.java`, `x.spec.ts`↔`x.ts`), and a new reproducible benchmark (`scripts/run-test-discovery-benchmark.mjs`) measures it against an independent canonical-name gold oracle — no LLM, pure string math. **C3 (risk labels):** `riskLabelFor` returns a richer, precedence-ordered set — `migration | payment | auth | security | public-api | config | test | generated | source` — feeding every Evidence Pack file. Deterministic, zero new dependencies.

**Tags:** `v8.5` · `coverage-expansion` · `env-schema` · `build-ci` · `config-manifest` · `migrations` · `test-discovery` · `risk-labels` · `#401` · `PR #402`

**Impact:** measured test-discovery **F1 98.0% · hit@1 97.4%** across 28 repos / 3,701 canonical impl↔test pairs; four new PROJECT_MAP / `get_map` coverage sections; richer risk labels on every Evidence Pack file. Retrieval/token metrics unchanged (86.7% hit@5, 97% token reduction).

---

### v7.31.0 — Identifier-aware BM25 re-ranker ✓ (2026-07-02)

**Minor release.** Plain exact-token TF-IDF missed queries whose terms live *inside* code identifiers — `component emit` never surfaced `componentEmits`, the dominant retrieval-miss cause. The new zero-dependency `src/retrieval/bm25.js` adds four things: identifier-aware tokenization (split camelCase / snake_case), light stemming (`emits` → `emit`), a path-token boost (filename weighed 3×), and length-normalized **BM25** scoring in place of raw TF-IDF. It is wired into the core ranker (`src/retrieval/ranker.js`) as the base relevance score — so `sigmap ask`, `sigmap --query`, and MCP `query_context` all benefit — with the existing negative-signal penalty and recency/graph/learned boosts layered on top; it also drives the benchmark runner. Deterministic, no LLM/embeddings, zero new dependencies.

**Tags:** `bm25` · `identifier-aware tokenization` · `stemming` · `path-token boost` · `src/retrieval/bm25.js` · `#395` · `PR #396`

**Impact:** retrieval hit@5 **75.6% → 86.7%** (lift 5.6× → 6.4×); task-success proxy 52.2% → 67.8%, prompts/task 1.72 → 1.46; rank-1 gains on flask, spring-petclinic, rails, and svelte (60% → 100%).

---

### v7.29.0 — One-command per-client MCP install (v8.0 E4) ✓ (2026-06-23)

**Minor release — v8.0 E4.** `sigmap mcp install <client>` is the fast path to a working MCP setup: it wires a single client and **creates** the config when absent, where `--setup` wires every editor at once and only touches configs that already exist. Supported clients are `claude`, `cursor`, `windsurf`, `vscode`, `zed`, `codex`, `gemini`, `opencode`, and `mcp` (portable `.mcp.json`); the command emits the correct shape per client — `mcpServers` JSON, Zed `context_servers`, or Codex YAML — and is **idempotent** (a re-run reports already-registered, never duplicates). `--global` selects the user-level config for clients with both a project and a global scope (Windsurf, OpenCode). `sigmap mcp list` (`--json`) shows every client and its resolved config path. All of it lives in the zero-dep `src/mcp/install.js` — no system-shell spawns, no install scripts — so Socket Supply Chain Security holds at 100.

**Tags:** `mcp install` · `mcp list` · `one-command-setup` · `idempotent` · `--global` · `zero-dep` · `#385` · `PR #386`

**Impact:** first-run friction down further — one targeted command brings up MCP for the user's actual client (the v8.0 <5-minute-quickstart gate); +11 tests (1,247 passing); zero new runtime dependencies. Continues the v8.0 milestone (E1, E3, D3 already shipped).

---

### v7.28.0 — sigmap doctor (v8.0 E3) ✓ (2026-06-23)

**Minor release — v8.0 E3.** `sigmap doctor` is a one-shot setup diagnostic so a cold user reaches a useful answer fast. It runs seven resilient checks — git repository, config & source roots, the generated context file, the signature index, index freshness, coverage, and MCP wiring — and prints an **actionable fix** for anything wrong or stale (e.g. "run: npx sigmap", "run: sigmap --setup", "increase maxTokens or expand srcDirs"). `--json` emits `{ checks, ok, errors, warnings }`, and the command exits **1** on a hard failure (no context file / invalid config) and **0** otherwise, so it drops into CI as a setup gate. Composed from the existing config loader, coverage scorer, signature index, and the known adapter-output / MCP-config paths — zero new runtime dependencies, no system-shell spawns. This release also hardened the release CI so `develop` self-heals after the develop→main merge (it had been auto-deleted by the repo's delete-branch-on-merge setting).

**Tags:** `doctor` · `diagnostics` · `setup-gate` · `actionable-fixes` · `--json` · `#381` · `PR #382` · `#380`

**Impact:** first-run friction down — one command tells a new user exactly what to fix; +11 tests (1,236 passing); zero new runtime dependencies. Continues the v8.0 milestone (E1, D3 already shipped).

---

### v7.27.0 — Diff context & architecture overview MCP tools (v8.0 D3) ✓ (2026-06-22)

**Minor release — v8.0 D3.** Two new MCP tools take the server from 15 to 17, both composed from data SigMap already computes (zero new runtime deps, no system-shell spawns). **`get_diff_context`** `{ base?, staged?, depth? }` returns, for every changed file (working tree, staged, or vs a base ref), its current **signatures** plus **blast radius** — direct importers, transitive count, affected tests/routes — and a risk label, so an agent gets everything a review or a safe edit needs in one call. Changed files are listed **shell-free** through `src/util/git.js`. **`get_architecture_overview`** `{}` returns a one-call codebase map — module breakdown (files/tokens), the most depended-on **hub files**, the dependency-**cycle** count, and route totals — extending `get_map` for orienting in an unfamiliar repo. Both reuse the existing graph (`buildFromCwd`, `analyzeImpact`, `detectCycles`) and extractor pipeline.

**Tags:** `mcp` · `get_diff_context` · `get_architecture_overview` · `blast-radius` · `hub-files` · `17 MCP tools` · `#376` · `PR #377`

**Impact:** MCP surface 15 → 17 tools (synced across `--help`, README, `mcp.md`, `version.json`, llms); +6 tests (1,225 passing); zero new runtime dependencies. Continues the v8.0 milestone (E1 shipped in v7.26.0).

---

### v7.26.0 — The Evidence Pack (v8.0 E1) ✓ (2026-06-22)

**Minor release — the first installment of the v8.0 "Evidence Pack & the Pivot" milestone.** SigMap gets its keystone artifact: a deterministic, machine-consumable signature-and-evidence map that replaces the copy-paste workflow. `sigmap evidence "<query>"` emits a byte-stable JSON (schema v1) — plus a `--markdown` handoff rendering — that an agent or CI can ingest directly. Every `files[]` entry is anchored to real symbols and `{start,end}` line ranges, with a relevance `reason`, a `0–1` `confidence`, best-effort `relatedTests`, and a `riskLabel` ∈ `generated · test · config · security · source`; `tokenBudget`/`droppedFiles` make the budget honest, and a `grounding` block signs the canonical pack with a sha256 `contextHash`. The pack carries **no wall-clock timestamp** — an unchanged repo yields byte-identical output and an identical hash, exactly the auditable, reproducible context an agentic grep loop cannot produce. Built entirely from shipped zero-dep modules (ranker, line-anchor parsing, security scanner); always writes `.context/evidence-pack.json`; flags `--top`, `--budget`, `--out`.

**Tags:** `evidence-pack` · `sigmap evidence` · `schema-v1` · `deterministic` · `contextHash` · `grounding` · `#372` · `PR #373`

**Impact:** the first machine-consumable handoff artifact; +14 tests (1,219 passing); zero new runtime dependencies. Opens the v8.0 milestone (E2 repositioning, E3 `doctor`, E4 agent recipes + `mcp install`, D3 +2 MCP tools to follow).

---

### v7.25.2 — Trust Hygiene: reproducible bundle build ✓ (2026-06-22)

**Patch release — H2, the last piece of Trust Hygiene.** The shipped `gen-context.js` is now provably reproducible from source. `scripts/build-bundle.mjs` (`npm run build:bundle`) deterministically regenerates the embedded `__factories` from `src/` + `packages/adapters/` — sorted, de-duplicated — between two markers, leaving the preamble and the hand-written CLI core byte-identical. `build:bundle --check` asserts the committed bundle equals a fresh build and gates `prepublishOnly` + CI (alongside the standalone `bundle-smoke` test on Node 18/20/22). This fixed a duplicate `llm-ablation` factory and embedded the previously-missing `willow` adapter — the canonical bundle is now **125 modules, one factory each**. `check-bundle --fix` delegates to the builder so duplicates can't recur.

**Tags:** `trust-hygiene` · `build:bundle` · `reproducible` · `bundle-repro` · `#369`

**Impact:** deterministic, reproducible distributable; +6 tests (1,205 passing); zero new runtime dependencies. **Completes the v7.25.x Trust Hygiene milestone (H1+H2+H3+H4).**

---

### v7.25.1 — Trust Hygiene: document the real surface ✓ (2026-06-21)

**Patch release — H4, the documentation half of Trust Hygiene.** SigMap shipped more than it advertised. `sigmap --help` now lists the five wired-but-undocumented commands — `conventions`, `scaffold`, `verify-plan`, `review-pr`, and `create` (the grounded-creation pipeline). The README corrects its MCP count (10 → **15**, with the full tool list), adds a "Grounded creation & guardrails" section, and lists the `willow` adapter (all 8 adapters). A new `surface-docs` test pins the documented surface to source — `--help` must list the commands, the README MCP count must equal `TOOLS.length`, and every registered adapter must appear in the README table — so the docs can never silently undersell the product again.

**Tags:** `trust-hygiene` · `--help` · `surface-docs` · `grounded-creation` · `willow` · `#366`

**Impact:** docs-only; +9 tests (1,199 passing); the v7.25.x milestone is documentation-complete (only H2, the reproducible bundle build, remains).

---

### v7.25.0 — Trust Hygiene: single source of benchmark truth ✓ (2026-06-21)

**Minor release — the first installment of the v7.25.x "Trust Hygiene" milestone (H1 + H3).** Every public number now derives from one generated file. `benchmarks/latest.json` is produced from the benchmark reports (`scripts/gen-benchmark-latest.mjs`); `version.json` metrics, the `README.md` benchmark block (via `<!--SM:KEY-->` markers), and `llms.txt`/`llms-full.txt` all read from it (`scripts/sync-metrics.mjs`). No metric is hand-typed, so README, version.json, and the LLM docs can never silently disagree with the measured reports again. `version.json`'s `languages`/`extractors`/`mcp_tools`/`tests` are auto-derived from source via a shared `scripts/lib/source-meta.mjs` — the same derivation the llms generator uses — fixing a stale `languages` count (31 → 33) and adding `extractors` (42). `npm run check:metrics` gates the whole chain in `prepublishOnly` and CI. This release regenerates the numbers from a live benchmark run.

**Tags:** `trust-hygiene` · `benchmarks/latest.json` · `metrics:sync` · `check:metrics` · `source-meta` · `#363`

**Impact:** single source of truth for all published metrics; +15 tests (1,190 passing); zero new runtime dependencies. Live run (`sigmap-v7.25-main`, 2026-06-21): hit@5 75.6% · token reduction 97% · task success 52.2%.

---

### v7.24.2 — StarMapper stargazer map in the docs ✓ (2026-06-19)

**Patch release — surface the community.** SigMap has 517 stars across 37 countries; the [StarMapper map](https://starmapper.bruniaux.com/manojmallick/sigmap) visualizes where. This release adds a StarMapper badge to the README badge row, a "stargazers around the world" link in Support, and a community link on the docs site. StarMapper is a client-rendered SPA with no verifiable badge endpoint, so a reliable shields.io static badge links to the map rather than embedding an unverifiable image; a README-structure test pins the URL.

**Tags:** `docs` · `starmapper` · `community` · `badge`

**Impact:** docs-only; +1 test (1,175 passing).

---

### v7.24.1 — §9 grounding result published: 99.8 → 0.2 flagged per 100 ✓ (2026-06-19)

**Patch release — the §9 measurement chain pays off.** The first averaged §9 ablation on the fact-question corpus (5 runs × 100 repo-fact tasks, Gemini `gemini-2.5-flash`): with SigMap's exact-signature grounding, flagged codebase-fact errors fell from **99.8 [99–100]** to **0.2 [0–1]** per 100 outputs — a mean reduction of **99.6 per 100**, with negligible run-to-run variance. Without grounding the model has no repo knowledge and fabricates a plausible-but-wrong file path on essentially every task (`src/sigmap/utils.py`, `src/sigmap/extract.py`, even Java/Go paths for a JS repo); with grounding it states the correct path. This measures **factual-recall grounding** (faithful use of provided context) — not generative code correctness — and the grounded arm is given the exact paths, so it is the strong, clean direction of the claim. Recorded in `version.json` under a dedicated `ablation` block, separate from the retrieval/token/task metrics.

**Tags:** `llm-ablation` · `§9` · `grounding-result` · `gemini` · `factual-recall`

**Impact:** the four-release §9 arc (v7.22.1 guard cleanup → v7.22.2 → v7.23.0 `--runs` → v7.24.0 fact corpus) culminates in a defensible, published number: **grounding eliminates fabricated file-location claims (99.8 → 0.2 per 100).**

---

### v7.24.0 — §9 corpus redesign: checkable repo-fact questions ✓ (2026-06-19)

**Minor release — make the §9 metric measure grounding, not guard precision.** A 100-task run (on the v7.22-cleaned guard + v7.23 harness) showed grounding drives *genuine* invented-file hallucinations to ~0, but the old "write a minimal example that requires X" corpus elicited placeholder scaffolding (`src/main.js`, `minimal.js`, real modules referenced by basename) that a string-based guard cannot distinguish from claimed repo files — so the measured delta (9 → 7) was dominated by benchmark artifacts, not grounding. `scripts/gen-ablation-corpus.mjs` now generates **checkable repo-fact questions** — *"which file defines `<name>`, and what are its parameters?"* — where a wrong file path is an unambiguous, checkable hallucination and the prompt forbids example code. The grounded arm (given exact signatures grouped by file) answers correctly; the ungrounded arm must guess. Task ids `call-` → `fact-`; 100 real-symbol tasks; a regression test pins the methodology so it can't drift back to code-writing.

**Tags:** `llm-ablation` · `corpus` · `fact-questions` · `grounding` · `§9` · `#356` · `#357`

**Impact:** the §9 ablation now isolates grounding — no example-scaffolding false positives. The next averaged run (`--runs 5`) should yield a clean, publishable `mean [min–max]` delta. +1 test (1,174 passing).

---

### v7.23.0 — robust §9 ablation: --runs averaging + 100-task corpus ✓ (2026-06-19)

**Minor release — turn the §9 result into a stable number.** With the guard cleaned (v7.22.1–v7.22.2), the §9 ablation shows grounding cuts flagged codebase-fact errors ~13 → 3 per 100 — but at N=40 with single-digit raw counts a single pass bounces run-to-run. This release makes one invocation yield a publishable figure: `scripts/run-llm-ablation.mjs` gains `--runs N` (default 1) that runs the full task set N times with **fresh model calls per pass** and prints a `mean ± [min–max]` summary; `src/eval/llm-ablation.js` adds the pure, unit-tested `aggregateRuns(aggregates[])`. The committed corpus expands from 40 to **100** real-symbol tasks for a tighter single-run estimate. The network touch stays confined to `scripts/`.

**Tags:** `llm-ablation` · `--runs` · `aggregateRuns` · `corpus-100` · `§9` · `#353` · `#354`

**Impact:** the §9 grounding result is now measurable with an honest spread (`mean ± range`) from a single command — `npm run benchmark:llm-ablation -- --runs 5 --save`. +3 tests (1,173 passing).

---

### v7.22.2 — verify-ai-output: clear camelCase & doc-placeholder false positives ✓ (2026-06-19)

**Patch release — expose the §9 grounding signal.** Re-running the §9 ablation on the v7.22.1-cleaned guard showed grounding genuinely fixed **6 mis-path flags**, but the guard re-flagged **4 illustrative tokens** in the with-grounding arm (net delta only +2). Those 4 were not real hallucinations, so this release removes them: `extractFilePaths` now also skips camelCase/Pascal placeholders (`myExample.js`, `exampleConfig.ts`) via a case-boundary rule that still flags ordinary words (`resample.js`), and the `fake-import` detector skips documentation-placeholder imports (`@scope/utils`, `some-module`, `./local-file`, `./path/to/…`) while still flagging genuine missing packages and unresolved relatives. On those same outputs the with-grounding flag count drops 10 → 6 — turning the §9 delta from +2 into **+9 per 100**. Bundled `parsers` + `hallucination-guard` factories regenerated.

**Tags:** `verify-ai-output` · `hallucination-guard` · `extractFilePaths` · `fake-import` · `camelCase` · `placeholder-imports` · `#350` · `#351`

**Impact:** clears the last two `verify-ai-output` false-positive classes, exposing the true §9 grounding delta (+2 → +9 on the measured outputs). +2 tests (1,170 passing).

---

### v7.22.1 — verify-ai-output: stop flagging Node.js & placeholder filenames ✓ (2026-06-18)

**Patch release — clear the §9 ablation's dominant false-positive class.** The Hallucination Guard's file-path extractor (`src/verify/parsers.js` `extractFilePaths`) was treating runtime/library product names and illustrative placeholders as repo file claims — in the v7.22.0 ablation, **22 of ~34 flags were literally "Node.js"**. It now skips well-known `X.js` product names (`node.js`, `next.js`, `vue.js`, `express.js`, `three.js`, `d3.js`, …) and placeholder basenames (`example`/`sample`/`demo`/`placeholder`, including `minimal-example.js`). Genuine repo-shaped paths (`src/foo/bar.js`, `main.js`, `index.ts`) are still flagged when absent, so real hallucinations are unaffected. The bundled `src/verify/parsers` factory was regenerated for standalone-binary parity.

**Tags:** `verify-ai-output` · `hallucination-guard` · `extractFilePaths` · `false-positives` · `#347` · `#348`

**Impact:** removes the dominant `verify-ai-output` false-positive class for every user, and turns the §9 grounding delta into a clean, publishable signal. +4 tests (1,168 passing).

---

### v7.22.0 — realistic §9 ablation (real-symbol corpus, exact-signature grounding, --verbose) ✓ (2026-06-18)

**Minor release — make the §9 measurement meaningful.** The LLM A/B ablation now uses a ~40-task corpus generated from the repo's real exported symbols/files (`scripts/gen-ablation-corpus.mjs`), grounds with **exact signatures grouped by file** (what `get_callee_signatures` returns, bounded — not a flat name dump), and `--verbose` prints every flagged item per arm. `src/eval/llm-ablation.js` adds `scoreAnswerDetail` (count + issues) and `runAblation`'s `collectIssues`. A 40-task Gemini run measured **62.5 → 22.5 flagged errors per 100 outputs with grounding** (directionally positive, vs the earlier 4-task noise). `--verbose` then revealed most flags are `verify-ai-output` file-path false-positives (e.g. "Node.js"), which is the next thing to harden before publishing a clean number. Also fixes the runner's default Gemini model (`gemini-2.0-flash` → `gemini-2.5-flash`, the former being retired).

**Tags:** `llm-ablation` · `corpus` · `exact-signatures` · `--verbose` · `scoreAnswerDetail` · `gemini` · `#344` · `#343`

**Impact:** the §9 A/B is now a real experiment — and it surfaced a concrete `verify-ai-output` false-positive class to fix next.

---

### v7.21.0 — Gemini (AI Studio) provider for the §9 ablation ✓ (2026-06-18)

**Minor release — run the §9 A/B with a Gemini key.** The LLM A/B ablation runner (`scripts/run-llm-ablation.mjs`) now supports Google Gemini via the AI Studio / Generative Language API (`generateContent`) alongside Anthropic. The provider is auto-detected from whichever key is present (`GEMINI_API_KEY` / `GOOGLE_API_KEY` → gemini; `ANTHROPIC_API_KEY` → anthropic); `--provider` and `--model` override, with a sensible default model per provider. Run with `GEMINI_API_KEY=… npm run benchmark:llm-ablation`. The offline harness (`src/eval/llm-ablation.js`) is unchanged and the network fetch stays confined to `scripts/`.

**Tags:** `llm-ablation` · `gemini` · `ai-studio` · `provider` · `grounded-codegen` · `#340`

**Impact:** the §9 measurement can now run on either Anthropic or Gemini keys — lowering the bar to publish the real hallucination delta.

---

### v7.20.0 — `init` Creation-workflow CLAUDE.md block (plan complete) ✓ (2026-06-18)

**Minor release — the final IMPL item.** `sigmap --init` now injects a marker-delimited "Creation workflow" block into CLAUDE.md describing the four-stage grounded-creation pipeline (`scaffold` → `verify-plan` → `verify-ai-output` → `review-pr`, orchestrated by `sigmap create`), so an agent reading CLAUDE.md knows the guard-rail workflow exists. New zero-dependency, bundle-safe `src/init/creation-workflow.js` (`renderCreationWorkflowBlock`, `injectCreationWorkflow`); idempotent and marker-scoped, it creates CLAUDE.md if absent, preserves human content, and coexists with the conventions + auto-generated-signatures blocks. **With this, every item in the grounded-codegen implementation plan is shipped** — the §9 LLM A/B ablation is built and offline-tested; a live run needs only an API key.

**Tags:** `init` · `creation-workflow` · `claude-md` · `injectCreationWorkflow` · `grounded-codegen` · `gap-2` · `plan-complete` · `#337`

**Impact:** the grounded-codegen plan (4 root causes + the full create pipeline + measurement harness) is complete end-to-end.

---

### v7.19.0 — scaffold persistence ✓ (2026-06-18)

**Minor release — `.context/scaffold/latest.md`.** `sigmap scaffold` now writes an accepted proposal to `.context/scaffold/latest.md` so the `create` pipeline and agents can read back the convention-matched proposal instead of re-deriving it. New zero-dependency, bundle-safe `src/scaffold/persist.js` (`renderScaffoldMarkdown`, `scaffoldPath`); the record captures the filename + naming style, export style, test file + framework, and any force-warning. Persisted in both human and `--json` modes (`persistedTo` field); a refusal writes nothing.

**Tags:** `scaffold` · `persistence` · `latest.md` · `renderScaffoldMarkdown` · `grounded-codegen` · `gap-2` · `#334`

**Impact:** scaffold proposals are now durable artifacts the rest of the pipeline can consume.

---

### v7.18.0 — `conventions --update` (incremental rescan) ✓ (2026-06-18)

**Minor release — completes the `conventions` flag set.** `sigmap conventions --update` refreshes `.context/conventions.json` only when source files have changed since the last scan (by mtime vs the stored snapshot); otherwise it reports "up to date" and skips the work — handy in a pre-commit hook or watch loop. New zero-dependency, bundle-safe `src/conventions/update.js` (`changedSince`, `planUpdate`). `--json` for machine output. With this, all six IMPL §4 `conventions` flags ship: `--conflicts`, `--inject`, `--report`, `--ci`, `--fix`, `--update`.

**Tags:** `conventions` · `--update` · `incremental` · `planUpdate` · `grounded-codegen` · `#331`

**Impact:** the `conventions` command is now complete across every documented flag.

---

### v7.17.0 — `conventions --fix` (exhaustive rename checklist) ✓ (2026-06-18)

**Minor release — completes the `conventions` flag set.** `sigmap conventions --fix` lists every source file whose name doesn't match the dominant convention, with full from→to paths — the complete, paste-ready rename checklist (distinct from `--conflicts`' 3-example diagnostic summary). New zero-dependency, bundle-safe `src/conventions/fix.js` (`buildFixList`) reuses `classifyNaming` + `toNamingStyle`; read-only (a checklist, never renames). `--json` for machine output. With this, all five `conventions` flags ship: `--conflicts`, `--inject`, `--report`, `--ci`, `--fix`.

**Tags:** `conventions` · `--fix` · `rename-checklist` · `buildFixList` · `grounded-codegen` · `#328`

**Impact:** the `conventions` command is feature-complete — detect, surface conflicts, inject into CLAUDE.md, score + trend, CI-gate, and now the full rename checklist.

---

### v7.16.0 — LLM A/B hallucination ablation harness (IMPL §9) ✓ (2026-06-18)

**Minor release — the honest measurement behind the grounded-codegen plan.** The §9 A/B ablation runs a model twice per task — (A) no SigMap context, (B) with SigMap grounding — pipes both outputs through the hallucination guard, and reports the measured delta in flagged codebase-fact errors. New zero-dependency, bundle-safe `src/eval/llm-ablation.js` (`buildGrounding`, `scoreAnswer`, `runAblation`) keeps the model call **injected** so the harness is fully offline-testable; the live runner `scripts/run-llm-ablation.mjs` wires Anthropic via `ANTHROPIC_API_KEY` (`npm run benchmark:llm-ablation`) and degrades to a graceful skip when no key is set. The network fetch is confined to `scripts/`, never the published surface. Starter corpus in `benchmarks/llm-ablation-tasks.json`. This turns §9 from an offline coverage proxy into a ready-to-run real A/B.

**Tags:** `llm-ablation` · `benchmark:llm-ablation` · `runAblation` · `injected-completer` · `grounded-codegen` · `the-gate` · `#325`

**Impact:** the grounded-codegen plan's headline measurement is now buildable and tested offline — running it live (with a key) produces the measured hallucination delta.

---

### v7.15.0 — `conventions --ci` (consistency CI gate) ✓ (2026-06-18)

**Minor release — enforce convention consistency in CI.** `sigmap conventions --ci` computes the overall consistency score (from `--report`) and **exits non-zero** when it falls below a threshold (`--min`, default 0.70) — so a PR that scatters new naming styles fails the build. With `--no-regress` it also fails when the score dropped vs the last recorded snapshot. New zero-dependency, bundle-safe `src/conventions/ci.js` (`ciGate`) reuses `overallScore`; the gate is read-only (it never writes history — `--report` owns that). `--json` for machine output.

**Tags:** `conventions` · `--ci` · `gate` · `ciGate` · `no-regress` · `grounded-codegen` · `#322`

**Impact:** convention consistency is now enforceable in CI — pair `--report` (records the trend) with `--ci` (the PR check).

---

### v7.14.0 — `conventions --report` (consistency audit + trend) ✓ (2026-06-17)

**Minor release — the next `conventions` flag.** `sigmap conventions --report` scores each convention (file naming, export style) plus a single file-count-weighted **overall consistency score**, each with a delta vs the previous run — a trackable "how consistent is our style, and is it improving?" number. New zero-dependency, bundle-safe `src/conventions/report.js` (`scoreReport`, `snapshot`, `overallScore`); the command compares against the last snapshot in `.context/conventions-history.ndjson`, prints the audit with ▲/▼ trend arrows (in percentage points), and appends a fresh snapshot. `--json` for machine output.

**Tags:** `conventions` · `--report` · `consistency-score` · `trend` · `scoreReport` · `grounded-codegen` · `#319`

**Impact:** convention consistency is now a single trackable score with a per-run trend — the basis for a future `--ci` drift gate.

---

### v7.13.0 — `sigmap create` (grounded-creation pipeline capstone, Gap 2) ✓ (2026-06-17)

**Minor release — the capstone of the grounded-codegen work.** `sigmap create "<task>"` sequences the four guard stages — `scaffold` → `verify-plan` → `verify-ai-output` → `review-pr` — in one command with `1/4`…`4/4` numbering and a single pass/fail summary. Each stage runs only when its input is present (`--name` → scaffold, `--plan` → verify-plan, `--answer` → verify-ai-output, the git diff → review-pr); a stage with no input is skipped and never fails the run. New zero-dependency, bundle-safe `src/create/orchestrate.js` (`orchestrate`) delegates to the real stage modules — no logic duplication. Exits non-zero when any ran stage fails, so it works as a single CI gate for the whole pipeline. With this, the grounded-creation loop is functionally complete: every root cause (1–4) is closed and all four guard stages are sequenced by one command.

**Tags:** `create` · `orchestrator` · `pipeline` · `n/4` · `grounded-codegen` · `gap-2` · `capstone` · `#316`

**Impact:** the end-to-end grounded-creation loop ships — `sigmap create` runs scaffold, plan-verification, output-verification, and diff-review as one numbered, gated pass.

---

### v7.12.0 — `sigmap review-pr` (the create pipeline, Gap 2) ✓ (2026-06-17)

**Minor release — the last guard stage of the `create` pipeline.** `sigmap review-pr` audits a diff for drift + side effects after a PR is opened: **scope drift** (too many distinct top-level dirs), **god-node edits** (changed files with transitive dependents above a threshold, via the impact graph), **missing tests** (a changed source file with no matching changed test), and **security-sensitive files** (`.env*`, auth, secrets, `package.json`/lockfiles, `.github/workflows/**`, Dockerfiles, keys). New zero-dependency, bundle-safe `src/review/review-pr.js` (`reviewPr`); deletions are excluded from the source/security checks. CLI `review-pr [--base <ref>] [--staged] [--json]` collects the diff via shell-free git and exits non-zero on any finding (CI-gate). With this, **all four create-pipeline guard stages exist** (`scaffold` → `verify-plan` → `verify-ai-output` → `review-pr`).

**Tags:** `review-pr` · `create-pipeline` · `god-node` · `scope-drift` · `security-files` · `grounded-codegen` · `gap-2` · `#313`

**Impact:** the grounded-creation loop's four guard stages are complete — only the `sigmap create` orchestrator (which sequences them) remains.

---

### v7.11.0 — `sigmap verify-plan` (the create pipeline, Gap 2) ✓ (2026-06-17)

**Minor release — first piece of the `sigmap create` pipeline.** `sigmap verify-plan <plan.md>` checks a plan against the **live index** before the agent executes it: referenced files and symbols exist, blast radius is acceptable, scope is in bounds — catching Cause 1+2 at plan time, cheaper than after the code is written. New zero-dependency, bundle-safe `src/plan/verify-plan.js` (`verifyPlan`): flags missing files + unknown symbols (with closest-match suggestions), computes per-file blast radius via the impact graph, and flags broad scope. Plan input is markdown (resolves the open §10 schema decision, consistent with `verify-ai-output`); CLI reads a file or stdin, supports `--json`, and exits non-zero on blocking errors. This is step 2 of the four-stage pipeline (`scaffold` → **verify-plan** → `verify-ai-output` → `review-pr`).

**Tags:** `verify-plan` · `create-pipeline` · `blast-radius` · `live-index` · `grounded-codegen` · `gap-2` · `#310`

**Impact:** three of the four create-pipeline guard stages now exist (scaffold, verify-plan, verify-ai-output) — only the `create` orchestrator and `review-pr` remain.

---

### v7.10.0 — `sigmap scaffold` + confidence floor (Layer 4) ✓ (2026-06-17)

**Minor release — first slice of Layer 4 (Cause 3: guessing structure for new code).** `sigmap scaffold <name>` proposes a convention-matched structure for a new module — filename in the dominant naming style, the export style to use, and a matching test file — but **only when the conventions are consistent enough**. New zero-dependency, bundle-safe `src/scaffold/propose.js` (`proposeScaffold`): the governing confidence is file-naming consistency, with a configurable soft threshold (default 0.70) and a **non-overridable hard floor of 0.50**. Below the threshold it refuses and surfaces the conflict (reusing `analyzeConflicts`); `--force` allows a proposal between the floor and the threshold (flagged), but never below the floor — a wrong proposal *systematizes* bad code, so the floor is the safety. CLI supports `--ext`, `--threshold`, `--force`, `--json`; a refusal exits non-zero. This closes the last open root cause (Cause 3).

**Tags:** `scaffold` · `confidence-floor` · `proposeScaffold` · `hard-floor` · `grounded-codegen` · `layer-4` · `cause-3` · `#307`

**Impact:** grounded codegen now *produces* structure, not just describes it — and refuses rather than systematize an inconsistent convention.

---

### v7.9.0 — `conventions --inject` (CLAUDE.md injection, Layer 3) ✓ (2026-06-17)

**Minor release — completes the "agent sees the conventions" link.** `sigmap conventions --inject` renders the detected conventions (file naming, export style, test framework — each with dominant pattern + consistency tier) into a marker-delimited block and writes it into `CLAUDE.md`, creating the file if absent. New zero-dependency, bundle-safe `src/conventions/inject.js` (`renderConventionsBlock`, `injectConventions`): idempotent and marker-scoped (`<!-- sigmap-conventions:start -->` … `:end -->`), preserving all human content and coexisting with the `## Auto-generated signatures` block. This is §8 step 5 of the grounded-creation loop — the LLM now plans grounded in the repo's house style. `--report`, `--fix`, `--update`, `--ci`, and the Layer 4 scaffold remain follow-ups.

**Tags:** `conventions` · `--inject` · `claude-md-injection` · `renderConventionsBlock` · `injectConventions` · `idempotent` · `grounded-codegen` · `layer-3` · `#304`

**Impact:** the detected house style is now visible to any agent that reads CLAUDE.md — closing the loop from "SigMap knows the conventions" to "the agent writes to them".

---

### v7.8.0 — `conventions --conflicts` (grounded codegen, Layer 3) ✓ (2026-06-17)

**Minor release — next slice of Layer 3.** Where `sigmap conventions` reports the dominant pattern and a consistency tier, `--conflicts` surfaces *why* a convention is mixed: every variant pattern with its file count, share, a visual bar, and example files — plus rename suggestions that move minority file-naming files toward the dominant style. New zero-dependency, bundle-safe `src/conventions/conflicts.js` (`analyzeConflicts`, `toNamingStyle`, `renameSuggestion`); export-style conflicts list variants but no renames (named ↔ default is a code change, not a rename). `scoreConvention(labels, refs?)` now attaches up to 3 example files per variant (backward compatible). `--json` emits the structured report; a consistent repo prints "no conflicts". `--report`, `--fix`, `--update`, `--ci`, and CLAUDE.md injection remain follow-ups.

**Tags:** `conventions` · `--conflicts` · `analyzeConflicts` · `toNamingStyle` · `rename-suggestions` · `grounded-codegen` · `layer-3` · `#301`

**Impact:** mixed conventions are now actionable — the breakdown + renames are the input the scaffold confidence floor (Gap 1) will consume.

---

### v7.7.0 — `sigmap conventions` (grounded codegen, Layer 3) ✓ (2026-06-17)

**Minor release — first slice of Layer 3.** A new `sigmap conventions` command extracts and reports a repo's dominant coding conventions — **file naming** style, **export style**, and **test framework** — for TS/JS/Python, so generated code matches the house style instead of drifting (Cause 4: naming/convention drift). New zero-dependency, bundle-safe `src/conventions/extract.js` exposes `classifyNaming` (PascalCase / camelCase / kebab-case / snake_case), `scoreConvention` (a reusable consistency scorer returning `{ dominant, dominantPct, variants, tier }` with tiers at 90% / 70% — Gap 1's scaffold-confidence floor will reuse it), and `extractConventions`. The command writes `.context/conventions.json` and prints a readable report; `--json` for machine output. `--conflicts`, `--fix`, `--ci`, and CLAUDE.md injection are deferred to follow-ups.

**Tags:** `conventions` · `grounded-codegen` · `layer-3` · `classifyNaming` · `scoreConvention` · `consistency-tiers` · `#298`

**Impact:** SigMap now surfaces *how a repo writes code*, not just *what it contains* — the foundation for convention-matched code generation.

---

### v7.6.0 — Grounding benchmark (the GATE) ✓ (2026-06-17)

**Minor release.** A deterministic, offline **callee-grounding ablation** (`npm run benchmark:grounding`) that measures how much ground truth SigMap actually gives an agent: per corpus repo, `coverage = grounded / universe` — universe being every symbol defined in the source, grounded the subset SigMap surfaces in its index (resolvable by `get_callee_signatures`); baseline is 0 (no SigMap → guess every reference). `scripts/run-hallucination-benchmark.mjs` prints per-repo + aggregate coverage, `--save`s `hallucination.json`, and `--gate <pct>` exits non-zero below a threshold. Honestly framed as a ground-truth-availability proxy — not an LLM hallucination rate (the LLM A/B ablation is a follow-up needing an API key). This is the **decision gate** before the grounded-codegen Layers 3–4 (conventions/scaffold): measure first, then decide.

**Tags:** `benchmark:grounding` · `grounding-ablation` · `the-gate` · `offline` · `hallucination.json` · `#294`

**Impact:** the grounded-codegen plan now has a reproducible number behind it instead of invented percentages.

---

### v7.5.0 — Read-time self-heal ✓ (2026-06-17)

**Minor release — completes Layer 1 freshness.** The v7.4.0 write hooks kept the index live *only if the agent called them*; this removes that single point of failure. `search_signatures` / `get_callee_signatures` now reconcile the index with the source tree **on read** — `src/cache/freshen.js` re-extracts files modified since the last `generate` (bounded to actual session edits, not the whole tree; throttled per repo) and persists to the sig-cache, which `buildSigIndex` merges. So on-disk edits show up even when no hook fired. Deletions stay explicit (`sigmap_notify_file_deleted`), since a cache entry can be a notify overlay for a not-yet-on-disk file. Verified end-to-end in the standalone bundle.

**Tags:** `read-time-self-heal` · `freshen` · `live-index` · `no-cooperation` · `grounded-codegen` · `#290`

**Impact:** Layer 1 freshness is now robust (write hooks + self-heal) — the index reflects reality without depending on the agent.

---

### v7.4.0 — Live-index MCP write hooks ✓ (2026-06-17)

**Minor release — grounded codegen, Layer 1.** Three new MCP tools — `sigmap_notify_file_created`, `sigmap_notify_symbol_added`, `sigmap_notify_file_deleted` — keep the index fresh while an agent creates/modifies/deletes files mid-session, so a freshly-written symbol is immediately resolvable by `search_signatures` / `get_callee_signatures` instead of being re-hallucinated. They update the persisted sig-cache (which `buildSigIndex` already merges), so changes are live on the next read. New bundle-safe `src/extractors/dispatch.js` (static extractor dispatch). Also fixes a pre-existing standalone-bundle bug: the `ranker` factory had a raw `require('../cache/sig-cache')` never rewritten to `__require`, so the cache merge silently failed in the SEA binary — regenerated, and the full create→resolve→delete cycle now works from the bundle with no `src/`.

**Tags:** `mcp-write-hooks` · `live-index` · `notify_file_created` · `grounded-codegen` · `dispatch.js` · `bundle-fix` · `15-tools` · `#286`

**Impact:** MCP server 12 → 15 tools; agent-created code is indexed live within the session (Cause 2 — stale references).

---

### v7.3.0 — `get_callee_signatures` MCP tool ✓ (2026-06-17)

**Minor release.** A 12th MCP tool, `get_callee_signatures`, returns the **exact current signature(s)** of named symbols (functions, classes, methods) from the index — so an agent never guesses a callee's parameter types from training memory. This is the highest-ROI step toward grounded code generation (Layer 2 of the zero-hallucination plan): call it before writing code that uses a symbol. Input `{ symbols: string[] }`; unknown names get a closest-match suggestion. Works against the current index today (Layer 1 live-freshness makes it live later). Wired into the standalone bundle (regenerated `mcp/*` factories) and validated end-to-end via the bundle-driven MCP test.

**Tags:** `get_callee_signatures` · `mcp` · `grounded-codegen` · `callee-signatures` · `closest-match` · `12-tools` · `#282`

**Impact:** MCP server 11 → 12 tools; attacks the #1 code-gen hallucination (wrong parameter types) with ground-truth signatures before write.

---

### v7.2.1 — Realistic per-query savings ✓ (2026-06-17)

**Patch release.** `sigmap ask` (and the `gain` dashboard) measured savings against the *whole repo* — every query assumed feeding the entire source tree — which inflated `gain` (cumulative baselines in the millions) and showed ~99% per query. The baseline is now the full content of the files SigMap actually surfaced for the query (the ranked top-K): without SigMap you'd read those files in full; SigMap gives you their signatures. Drives the `ask` cost line, `--json savingsPct`, and the `gain` record. `generate` keeps the whole-repo baseline (it genuinely indexes every file → signatures).

**Tags:** `realistic-baseline` · `gain` · `ask` · `surfaced-files` · `#278`

**Impact:** `gain` reports honest savings (e.g. per-`ask` baseline ~127K → ~8K on this repo); per-query reduction now ~90–95% (signatures vs full relevant files) instead of ~99% vs the whole repo.

---

### v7.2.0 — Release-pipeline robustness ✓ (2026-06-17)

**Minor release — build/release hardening, no user-facing CLI changes.** Closes the gap that broke the v7.1.0 standalone binaries (a `src/` module missing from the bundle `__factories`). New **bundle integrity check** (`scripts/check-bundle.mjs`, #266) verifies every `src/` module is registered, runs on every PR (Node 18/20/22) + `prepublishOnly` + the binary preflight, and `--fix` inserts missing factories from source. A **version.json metadata gate** (`scripts/check-version-meta.mjs`, #268) derives `mcp_tools`/`tests` and fails on drift. A **standalone-bundle smoke test** (#274) runs `gen-context.js` with no `src/` present (the binary code path) across the matrix, and **`docs/RELEASING.md`** documents the whole flow. Also: `--health` relabels its informational "extractor coverage" line so it no longer reads as contradictory beside a 100/100 score (#270), and the root was decluttered (#272).

**Tags:** `check-bundle` · `check-version-meta` · `bundle-smoke` · `__factories` · `prepublishOnly-gates` · `RELEASING.md` · `--health-clarity` · `#266` · `#268` · `#270` · `#272` · `#274`

**Impact:** the bundle-drift class of release failures is now caught pre-merge and pre-publish (presence + functional smoke); release flow documented; version.json metadata self-checks.

---

### v7.1.0 — Token-savings dashboard (sigmap gain) ✓ (2026-06-16)

**Minor release.** New **`sigmap gain`** (#260) surfaces cumulative token savings right in the terminal — total tokens saved, % efficiency, estimated dollars, average latency, and a per-operation breakdown — with `gain --all` for daily / weekly / monthly trends. Savings are captured automatically: every `ask` and `generate` run appends a counts-only record to a dedicated local log `.context/gain.ndjson` (no file paths, source, or query text). Capture is **default-on** and privacy-safe; opt out with `--no-track`, `SIGMAP_NO_TRACK=1`, or `config.gainTracking:false`, and the legacy `usage.ndjson` / `--track` health log is untouched. New zero-dep `src/tracking/{aggregate,pricing}.js` and `src/format/gain-terminal.js` (ANSI renderer, `NO_COLOR`/non-TTY safe). "Saved" is labeled everywhere as an estimate vs the whole-file baseline. Also in this release: docs served at the sigmap.io root (#258) and a transparent Sponsor section (#257).

**Tags:** `sigmap gain` · `gain --all` · `gain --json` · `--no-track` · `gainTracking` · `.context/gain.ndjson` · `token-savings` · `privacy-safe` · `#257` · `#258` · `PR #261` · `#260`

**Impact:** users can finally quantify what SigMap saves them (tokens, %, $); zero new dependencies; default-on local-only capture; 18 new tests for the gain data layer + real CLI capture.

---

### v7.0.1 — Supply-chain hardening; importable core; wider star nudge ✓ (2026-06-14)

**Patch release — security & package hygiene.** Every `child_process.execSync` call (which runs through `/bin/sh -c`) was converted to shell-free `execFileSync` with an arguments array — several had previously interpolated values into the command string (`git diff ${range}`, `HEAD~${n}`, `printf '%s' … | ${clipCmd}`, `node -e "…http.get…"`), a real shell-injection surface. A new `src/util/git.js` (`git()`/`tryGit()`) centralizes shell-free git; the `extends` config fetch passes the URL as an argv, `compare` spawns node by argv, and clipboard copy writes via stdin. Net: **zero `execSync`/`exec`/`shell:true` in the published surface**, clearing Socket's "Shell access" capability alert (#252). Also: `package.json` `main` now points at the importable core API (`require('sigmap')` no longer runs the CLI; Bundlephobia sees the real zero-dep library), the star nudge counts plain `sigmap` runs (not just `ask`/`squeeze`) so context-only users reach it (#251), and the unused `machineId = sha256(os.hostname())` fingerprint was removed from `usage.json` (#252).

**Tags:** `shell-free` · `execFileSync` · `no-shell-access` · `src/util/git.js` · `main→core` · `star-nudge` · `no-fingerprint` · `supply-chain` · `#250` · `PR #251` · `PR #252`

**Impact:** Socket "Shell access" + "AI-detected risk" alerts removed (Supply Chain Security 75 → 100 after publish); injection vectors eliminated; importable core API; 988 tests passing.

---

### v7.0.0 — Squeeze + Star Nudge; signatures-under-budget fixed ✓ (2026-06-14)

**Major release.** **Squeeze** (#238) makes `sigmap ask` minimize pasted input before ranking — it classifies a stack trace, CI log, or JSON payload and dedupes frames, strips vendor/timestamp noise, and collapses repeated array items, while **enriching the top stack frame** with its real signature from the symbol index (the differentiator over generic log summarizers). New `sigmap squeeze <file|->` command and `--squeeze` / `--no-squeeze` / `--squeeze-threshold` flags; interactive-only prompt, never blocks pipes/CI. A one-time, race-safe **Star Nudge** appears after ≥10 runs / ≥8 successes. This default behavioral change to `ask` is why it's a major bump.

Alongside it: the **token budget now keeps full signatures** (#240) — when context exceeds `maxTokens`, low-priority files are dropped (only marginal overflow collapses to anchors) instead of every signature being gutted to a bare line pointer — and every generated context file carries **one canonical `## SigMap commands` block** (the redundant AGENTS.md `## Tools` JSON was removed). SigMap's own **`llms.txt` + `llms-full.txt`** are now generated from source of truth and CI-validated (#243); the benchmark corpus is **pinned to fixed commits** for reproducible metrics (#236); and `prdiff` symbol naming no longer emits phantom `+is`/`~is` fragments (#247).

**Tags:** `squeeze` · `star-nudge` · `symbol-enrichment` · `--squeeze` · `full-signatures-under-budget` · `llms.txt` · `pinned-benchmarks` · `BREAKING` · `PR #236` · `#238` · `#240` · `#243` · `#247`

**Impact:** flagship input-minimization (stacktrace ~85% / cilog ~89% / json ~73% reduction with 100% ground-truth preservation); context files keep real signatures; reproducible benchmarks; 984 tests passing.

---

## Current milestone — Phase 2 "buy the A+" 🚧 NEXT — Phase 1 grounding banked (G1/D8/G2); the §3.5 in-boundary backlog D1–D9 is complete (v8.12) and method-level blast-radius scoring shipped (GR2, v8.13) and the call-graph now covers Java/Go/Rust (GR1, v8.14) with the ranking boost measured and shipped dark (v8.15). Evidence Pack schema v2 shipped (v8.16). Retrieval surface-enrichment shipped measure-gated (v8.18) — every Phase-2 quality-ceiling row is now done or gate-closed. Honest Numbers shipped (v8.19): the published lift is now measured vs a grep-agent baseline, with claim-hygiene guards. Semantic Bridge I shipped (v8.20): JS/TS doc hints (Python-parity, −0.9pt on the lexical corpus, default-on per the anchors precedent) + `sigmap memory`. Semantic Bridge II shipped (v8.21): Go/Rust/Java doc hints (6 hint languages total) + the import-graph centrality blend (measured +0 → shipped dark behind `retrieval.centralityBlend`). Hard Corpus shipped (v8.22): the no-leakage hard split + leakage gate measured the vocabulary-mismatch ceiling directly (hard-split 33.3% vs grep 53.3% — grep wins when filename leakage is removed). Agent Economy I shipped (v8.23) and Trust Quick Wins I shipped (v8.24, `sigmap redact`). Agent Economy II shipped (v8.25): `sigmap tune` — the discovery stack packaged as a deterministic config optimizer (F2). Agent Economy III shipped (v8.26): `sigmap skills` — the usage-maximizer and config-optimizer playbooks installable in 5 clients' native formats (F3+F4) — **the Agent Economy pillar is complete**. Trust Quick Wins II shipped (v8.26.1): KNOWN_LIMITATIONS.md + the README extraction-honesty tier label (G1). Next: G2 SUCCESSION + org migration and G6 triage (maintainer-driven, non-code), Tokenizer Core I shipped (v8.27): the balanced scanner + JS/TS migration (G4 increment 1). Arity Guard shipped (v8.28): D1 arity-checked verification over exact JS/TS/Python params. Next: G4 increments for Go/Java + the remaining Tier-2 languages (each one extends arity coverage), then J1 structural judge and B2 repo-mined expansion aimed at the measured hard-split gap; pull-based v10 items only (enterprise, IDE plugins — built if users ask) and the no-code growth lane

**v8.0 "Evidence Pack & the Pivot" ✓ COMPLETE** — E1 Evidence Pack in v7.26.0, D3 +2 MCP tools (15→17) in v7.27.0, E3 `doctor` in v7.28.0, E4 `mcp install` in v7.29.0, and **v7.30.0** the repositioning pivot: every public surface now states *"the deterministic, verifiable grounding layer for AI code work"* (token reduction demoted to proof) plus **agent recipes** framing Claude Code, Cursor, Cline, Continue, Aider, OpenHands, and Codex CLI as consumers. The v8.0 exit gate is met: a cold user reaches a useful answer in <5 min, an agent consumes the Evidence Pack JSON with zero copy-paste, and no public surface still calls SigMap a "compression tool".

v6.0–v7.0.0 shipped graph-boosted retrieval, incremental signature cache, weights sharing, native tool instructions across all 7 adapters, MCP auto-wire, intelligent source root detection, intent-aware retrieval, cross-session context memory with impact planning, R language support, Python AST extraction, line anchors (Surgical Context), demand-driven retrieval with the `get_lines` MCP tool, the **`verify-ai-output` Hallucination Guard** (five-detector reliable MVP with closest-match suggestions + HTML report), **Memory tools** (`note`, `status`, `read_memory` — 11 MCP tools total), **v7.0.0**: **Squeeze** input minimization with symbol enrichment, full-signatures-under-budget, one canonical usage block, source-of-truth `llms.txt`, and pinned reproducible benchmarks; **v7.1.0**: the **`sigmap gain`** token-savings dashboard (cumulative tokens saved, %, est. $, daily/weekly/monthly trends; privacy-safe, local-only, default-on); and the **grounded-codegen** track — **v7.4–7.5** live-index write hooks + read-time self-heal (Layer 1), **v7.6.0** the offline grounding benchmark (the GATE), **v7.7.0** **`sigmap conventions`** (Layer 3: extract a repo's file-naming / export / test-framework conventions); **v7.8.0** **`conventions --conflicts`** (per-convention breakdown + rename suggestions); **v7.9.0** **`conventions --inject`** (CLAUDE.md convention injection — the agent now sees the house style); **v7.10.0** **`sigmap scaffold`** (Layer 4: convention-matched proposal gated by a confidence floor — closing the last root cause); **v7.11.0** **`sigmap verify-plan`** (Gap 2: plan vs live index); **v7.12.0** **`sigmap review-pr`** (Gap 2: diff audit); and **v7.13.0** **`sigmap create`** (the orchestrator that sequences all four guard stages — the grounded-creation capstone). and **v7.16.0** the **LLM A/B hallucination ablation harness** (§9 — `npm run benchmark:llm-ablation`). The grounded-codegen plan is now functionally complete: every root cause is closed, the full `create` pipeline ships, and the §9 measurement harness is built and offline-tested. and **v7.20.0** the `init` Creation-workflow CLAUDE.md block — **every item in the grounded-codegen implementation plan is now shipped** (4 root causes, the full create pipeline, the conventions flag set, scaffold persistence, and the §9 measurement harness). The §9 A/B now runs live on a real 40-task corpus (Anthropic or Gemini/AI-Studio keys); a first run measured **62.5 → 22.5 flagged errors per 100 with grounding** (v7.22.0), and **v7.22.1** hardened `verify-ai-output`'s file-path extractor so runtime/library names ("Node.js") and placeholder filenames no longer count as fake files — clearing the dominant false-positive class so the §9 delta is clean, and **v7.22.2** cleared the last two false-positive classes (camelCase placeholders + documentation-placeholder imports) — lifting the measured grounding delta from +2 to +9 per 100, and **v7.23.0** made the §9 harness statistically robust (`--runs N` mean ± range over a 100-task corpus); a 100-task run then revealed the "write an example" corpus elicited placeholder scaffolding that masked grounding's effect, so **v7.24.0** redesigned the corpus as checkable repo-fact questions (which file defines `X`?) that isolate grounding, and **v7.24.1** published the first averaged result: grounding cut fabricated file-location claims from **99.8 to 0.2 per 100** (5×100 tasks, Gemini). Next: a generative-correctness §9 variant (does grounding help the model *write* correct code, not just recall paths?), and broader provider/model coverage. Also planned: **PR verification** (`verify-plan` / `review-pr` GitHub Action), the **Interactive Context Explorer**, line anchors for the remaining extractors (9 brace languages shipped across v8.17–v8.18), and performance optimizations for very large monorepos (>50K files).

---

<div style="text-align:center;margin-top:2.5rem;padding-bottom:.5rem;font-size:0.85em;color:var(--vp-c-text-3)">
  Made in Amsterdam, Netherlands <span title="Netherlands">🇳🇱</span>
</div>
