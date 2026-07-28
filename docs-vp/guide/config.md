---
title: Config reference
description: Complete SigMap configuration reference. All 24 keys in gen-context.config.json with types, defaults, and examples. srcDirs, maxTokens, extends, strategy, outputs, secretScan and more.
head:
  - - meta
    - property: og:title
      content: "SigMap Configuration Reference — all 24 keys"
  - - meta
    - property: og:description
      content: "Every gen-context.config.json key documented with types, defaults, and examples."
  - - meta
    - property: og:url
      content: "https://sigmap.io/guide/config"
  - - meta
    - property: og:type
      content: article
  - - meta
    - name: twitter:title
      content: "SigMap Configuration Reference — all 24 keys"
  - - meta
    - name: twitter:description
      content: "Every gen-context.config.json key documented with types, defaults, and examples."
  - - meta
    - name: twitter:image:alt
      content: "SigMap Configuration Reference"
  - - meta
    - name: keywords
      content: "sigmap config, gen-context.config.json, sigmap configuration, srcDirs, maxTokens, extends, strategy, outputs, secretScan, sigmap settings"
---
# Config reference

All configuration lives in `gen-context.config.json` at the project root. Generate a starter file with:

```bash
sigmap --init
```

## Copy-paste presets

### Solo repo

```json
{
  "srcDirs": ["src", "app", "lib"],
  "strategy": "full",
  "autoMaxTokens": true,
  "outputs": ["copilot"]
}
```

### Large monorepo

```json
{
  "srcDirs": ["packages", "apps", "services"],
  "strategy": "per-module",
  "monorepo": true,
  "autoMaxTokens": true
}
```

### Claude Code, Cursor, Windsurf, or Zed with MCP

```json
{
  "srcDirs": ["src", "app", "lib"],
  "strategy": "hot-cold",
  "hotCommits": 10,
  "diffPriority": true
}
```

### Team shared base config

```json
{
  "extends": "./configs/team-base.json",
  "srcDirs": ["src", "packages"],
  "outputs": ["copilot", "claude"]
}
```

## Full example

```json
{
  "extends": "./team-base.json",
  "srcDirs": ["src", "app", "lib"],
  "outputPath": ".github/copilot-instructions.md",
  "outputs": ["copilot", "claude"],
  "autoMaxTokens": true,
  "coverageTarget": 0.80,
  "strategy": "full",
  "hotCommits": 10,
  "diffPriority": true,
  "monorepo": false,
  "watchDebounce": 300,
  "secretScan": true,
  "enrichTodos": true,
  "enrichChanges": true,
  "enrichCoverage": false,
  "retrieval": {
    "topK": 10,
    "recencyBoost": 1.5,
    "preset": "balanced"
  }
}
```

## Inheritance (v5.0)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `extends` | `string` | _(none)_ | Path to a base config JSON file (local or HTTPS URL) to inherit from before applying local overrides. |

### extends

Inherit from a shared team base config. The merge order is: **DEFAULTS → base → local config**. Every local key overrides the base.

Local file:

```json
{ "extends": "./configs/team-base.json" }
```

Remote URL (cached 1 hour in `.context/config-cache/`):

```json
{ "extends": "https://raw.githubusercontent.com/your-org/sigmap-config/main/base.json" }
```

The base file is a plain `gen-context.config.json` without an `extends` key itself.

---

## Output

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `outputPath` | `string` | `.github/copilot-instructions.md` | Path to write the primary context file. |
| `outputs` | `string[]` | `["copilot"]` | Which output files to write. Values: `"copilot"` (`.github/copilot-instructions.md`), `"claude"` (`CLAUDE.md`). |

## Token budget

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoMaxTokens` | `boolean` | `true` | Auto-scale the token budget based on repo size. Set `false` to use a fixed `maxTokens`. |
| `coverageTarget` | `number` | `0.80` | Target fraction of source files to include (0.0–1.0). Default: 80%. |
| `modelContextLimit` | `number` | `128000` | Model context window size in tokens. Hard cap = `modelContextLimit × maxTokensHeadroom`. |
| `maxTokensHeadroom` | `number` | `0.20` | Fraction of the model context reserved for SigMap output. Default 0.20 = 25 600-token cap for 128K models. |
| `maxTokens` | `number` | `6000` | Used only when `autoMaxTokens: false`, or as a minimum floor. |

**Formula:** `effective = clamp(ceil(totalSigTokens × coverageTarget), 4000, floor(modelContextLimit × maxTokensHeadroom))`

When the hard cap prevents hitting the coverage target by more than 10 percentage points, SigMap prints a warning and suggests switching to `strategy: "per-module"`.

To pin a fixed budget (v4.0 behaviour):
```json
{ "autoMaxTokens": false, "maxTokens": 6000 }
```

## Source scanning

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `srcDirs` | `string[]` | `["src", "app", "lib"]` | Directories to scan for source files. Relative to the project root. |
| `monorepo` | `boolean` | `false` | When true, generates a separate context section per package under `packages/`, `apps/`, or `services/`. |

## Strategy

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `strategy` | `"full" \| "per-module" \| "hot-cold"` | `"full"` | Context output strategy. `full` = one file, all signatures. `per-module` = one file per source directory. `hot-cold` = recently changed files auto-injected; everything else in a cold file for MCP retrieval. See [Strategies](/guide/strategies). |
| `hotCommits` | `number` | `10` | Number of recent commits to include in the hot set when `strategy` is `"hot-cold"`. |
| `diffPriority` | `boolean` | `false` | When true, files changed in the current git diff are ranked highest in the output. |

## Features

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `secretScan` | `boolean` | `true` | Scan output for 10 credential patterns before writing. Matching content is replaced with `[REDACTED]`. Patterns: AWS keys, GitHub tokens, JWTs, database URLs, SSH keys, GCP keys, Stripe keys, Twilio keys, generic passwords/api_keys. |
| `monorepo` | `boolean` | `false` | See Source scanning above. |
| `sigCache` | `boolean` | `false` | Enable incremental signature cache. When true, caches extracted signatures with mtime-based validation. Cache is automatically busted on version changes. Skips re-extraction of unchanged files for faster subsequent runs. |
| `sessionBudgetTokens` | `number\|null` | `null` | Opt-in per-session budget for **estimated SigMap-emitted tokens** (chars/4). When set, [`sigmap budget`](/guide/cli#budget) and the MCP `get_budget` tool report remaining tokens, percent used, and an over-budget flag. Counts only what SigMap outputs — not the host chat's total spend. |
| `contextTtlDays` | `number\|null` | `null` | Opt-in staleness threshold: when the newest generated context file is older than this many days, `budget`/`get_budget` flag it `STALE` and advise re-running sigmap. |
| `gainTracking` | `boolean` | `true` | Capture per-operation token savings to `.context/gain.ndjson` for the [`sigmap gain`](/guide/cli#gain) dashboard. Counts only — no file paths, source, or query text — and never leaves the machine. Set `false` to disable (equivalent to passing `--no-track` or `SIGMAP_NO_TRACK=1`). Independent of the legacy `tracking` / `--track` health log. |

## Watch

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `watchDebounce` | `number` | `300` | Debounce delay in milliseconds for file watcher events. Increase if you see multiple regenerations for a single save. |

## Enrichment

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enrichTodos` | `boolean` | `true` | Append a TODO/FIXME/HACK section extracted from inline comments. |
| `enrichChanges` | `boolean` | `true` | Append a recent git log summary showing files changed in the last 10 commits. |
| `versionPins` | `boolean` | `true` | Append a `## versions (installed direct deps)` section listing `name@version` for the installed direct dependencies (JS from `node_modules`, Python from the venv `site-packages`). Grounds agents against what is actually installed. See [versionPins](#versionpins). |
| `terse` | `boolean` | `false` | Deterministic terse encoding of the signature block (`function `→`fn `, tightened params/arrows/exports). Line anchors and doc hints are preserved byte-exactly. Measured −16.1% signature tokens on the SigMap repo (`npm run benchmark:terse`). Also available at runtime as the `--terse` flag. See [terse](#terse). |
| `enrichCoverage` | `boolean` | `false` | Append a coverage gaps section listing source files that have no corresponding test file. |
| `testCoverage` | `boolean` | `false` | Annotate each function signature with `✓` (tested) or `✗` (untested). Can also be set at runtime via the `--coverage` flag without editing this file. |
| `testDirs` | `string[]` | `["test","tests","__tests__","spec"]` | Directories scanned to build the test index when `testCoverage` is enabled. |
| `retrieval.topK` | `number` | `10` | Number of top-ranked files returned by `--query` and the `query_context` MCP tool. |
| `retrieval.recencyBoost` | `number` | `1.5` | Multiplier applied to recently committed files during TF-IDF ranking. |
| `retrieval.preset` | `"precision" \| "balanced" \| "recall"` | `"balanced"` | Weight preset for the ranking algorithm. `precision` minimises false positives. `recall` maximises coverage. |
| `retrieval.callGraphBoost` | `boolean` | `false` | **v8.15.0, opt-in.** Boost files call-graph-connected to query matches in `ask`/`--query`/`query_context` — catches Go/Java same-package relations that have no import edge. Measured on the 90-task A/B: **+0 hit@5 delta**, so it stays off by default; enable it on call-topology-heavy repos and check the `callGraphBoost` signal in `--query --json`. Re-measure with `npm run benchmark:callgraph-boost`. |
| `retrieval.surfaceEnrichment` | `boolean` | `false` | **v8.18.0, opt-in.** Append `route METHOD /path` pseudo-signatures to the rankable index so route-worded queries can match controllers whose signatures never mention the path (Express/Fastify/NestJS/Flask/FastAPI/Gin/Spring). Measured on the 90-task A/B: **+0 delta** (the corpus never asks route-worded questions), so it stays off by default; enable it on API-heavy repos. Re-measure with `npm run benchmark:surface-enrichment`. |
| `retrieval.centralityBlend` | `boolean` | `false` | **v8.21.0, opt-in.** Blend import-graph centrality (zero-dep power iteration over the forward dependency graph) into `ask`/`--query`/`query_context` ranking as a small additive prior (`0.3 × centrality`) on positively-scored files only — heavily-referenced files break ties above one-off helpers, and non-matching files are never surfaced. Measured on the 90-task A/B: **+0 delta** (both arms 77.8% hit@5), so it stays off by default; enable it on hub-and-spoke architectures and check the `centrality` signal in `--query --json`. Re-measure with `npm run benchmark:centrality-blend`. |

### sigCache

Enable incremental signature caching with mtime-based validation. When enabled, caches extracted signatures in `.sigmap-cache.json` and skips re-extraction of unchanged files. Cache is automatically busted on version changes.

```json
{
  "sigCache": true
}
```

### versionPins

**v8.6.0+ (D8).** Emit a compact `## versions (installed direct deps)` block in the generated context header, listing the installed version of each **direct** dependency as `name@version` — resolved from `node_modules` (JS/TS) and the venv `site-packages` (Python), versions only, no symbol parsing. This lets an agent reading `CLAUDE.md`/`AGENTS.md` ground its suggestions against the libraries **actually installed here** (it compounds with the [installed-library grounding](/guide/verify-ai-output) moat — e.g. "`foo()` doesn't exist in `lodash@4.17` installed here"). Byte-stable given a fixed installed tree; the list is sorted and capped. Set `false` to omit the section.

```json
{
  "versionPins": true
}
```

### terse

**v8.11.0+ (D7).** Opt-in deterministic compaction of the generated signature block: `function `→`fn `, `async function `→`async fn `, tightened parameter/arrow/exports spacing. The `:start-end` line anchor and any trailing doc hint are preserved **byte-exactly**, so `get_lines`, evidence packs, and symbol extraction keep working, and the ranker parses terse context files unchanged. When off (the default), output is byte-identical to previous releases. The reduction is measured, not claimed: `npm run benchmark:terse` reported **−16.1%** signature tokens on the SigMap repo itself (10,232 → 8,580 across 143 files).

```json
{
  "terse": true
}
```

```
### src/app.js
exports={fetchUser,formatUser}  :7-7
async fn fetchUser(id,opts={})  :1-3
fn formatUser(user,style)  :4-6
```

Check cache health with:

```bash
sigmap --health
```

Output will include cache stats:
```
sig-cache       : 142 entries, 1.2 KB
```

Use `sigCache: true` for large repositories where signature extraction is slow, or when you run generation frequently.

## .contextignore

Use a `.contextignore` file (gitignore syntax) to exclude files and directories from the index. Run `sigmap --init` to generate a starter file.

```bash
# test files
**/*.test.*
**/*.spec.*
*_test.*

# build output
dist/
build/
src/generated/
coverage/
node_modules/

# generated files
*.pb.*
*.generated.*
```

The `.contextignore` file uses the same gitignore syntax as `.repomixignore`. Symlink them to share a single exclusion list:

```bash
ln -s .contextignore .repomixignore
```


---

<div style="text-align:center;margin-top:2.5rem;padding-bottom:.5rem;font-size:0.85em;color:var(--vp-c-text-3)">
  Made in Amsterdam, Netherlands <span title="Netherlands">🇳🇱</span>
</div>
