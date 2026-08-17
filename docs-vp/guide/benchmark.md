---
title: Benchmark overview
description: Official v8.26.0 benchmark snapshot. 96.8% average token reduction across 21 repos, 82.2% retrieval hit@5, 46.1% fewer prompts, and R language support verified.
head:
  - - meta
    - property: og:title
      content: "SigMap benchmark overview — v8.26.0 snapshot with R language"
  - - meta
    - property: og:description
      content: "Token, retrieval, quality, and task metrics from latest v8.26.0 benchmark run (2026-08-17) with 21 repositories including R language support."
  - - meta
    - property: og:url
      content: "https://sigmap.io/guide/benchmark"
---

# Benchmark overview

::: info Official v8.26.0 benchmark snapshot (21 repos, including R language)
**Benchmark ID:** sigmap-v8.26-main &nbsp;·&nbsp; **Date:** 2026-08-17

| Metric | Value |
|---|---:|
| Hit@5 (18 core repos) | **82%** vs 44.0% single-shot grep baseline |
| Token reduction (21 repos) | **96.8%** |
| Honest lift (vs grep agent) | **1.87×** |
| Prompt reduction | **46.1%** (2.84 → 1.53) |
| Task success proxy | **64.8%** |
| Test discovery (impl→test) | **F1 98.0%** · hit@1 97.4% (28 repos) |
| GPT-4o overflow (without → with) | **16/21 → 0/21** |
:::

This is the landing page for the public benchmark story. It answers four different questions:

| If you want to prove... | Open |
|---|---|
| SigMap reduces context size dramatically | [Token reduction](/guide/benchmark) |
| SigMap finds the right file more often | [Retrieval benchmark](/guide/retrieval-benchmark) |
| SigMap reduces retries and wrong-context answers | [Task benchmark](/guide/task-benchmark) |
| SigMap keeps large repos inside model limits | [Quality benchmark](/guide/quality-benchmark) |

## Official v8.26.0 snapshot (with R language support)

Latest saved benchmark run: **2026-08-17 (v8.26.0)**

| Metric | Result |
|---|---:|
| Token reduction repos | 21 (including R: ggplot2, dplyr, shiny) |
| Retrieval benchmark repos | 18 (core languages) |
| Total tasks | 90 |
| Average token reduction (all 21) | **96.8%** |
| Retrieval hit@5 (18 core) | **86%** |
| Graph-boosted hit@5 | **86%** |
| Grep-agent baseline hit@5 (125 tasks, 19 repos) | 44.0% — **1.87× honest lift** |
| Random baseline hit@5 (data only, no longer quoted) | 13.6% |
| Prompt reduction | **48%** (2.84 → 1.53 prompts) |
| GPT-4o overflow repos without SigMap | **16 / 21** |
| GPT-4o monthly input savings at 10 calls/day | **$9,899.90** |

## What each benchmark proves

### 1. Token reduction (21 repositories)

- Raw source across benchmark set: **13,499,894** tokens (21 repos)
- Final SigMap output: **~470,000** tokens
- Overall reduction: **96.8%**
- **New in v6.11.1:** R language support verified
  - ggplot2: 94.3% reduction (381.5K → 21.7K tokens)
  - dplyr: 93.4% reduction (145.1K → 9.5K tokens)
  - shiny: 96.2% reduction (264.6K → 10.0K tokens)
- **New in v6.12.0:** demand-driven *Surgical Context* (`ask --mode index` + the `get_lines` MCP tool) cuts upfront `ask` context further on top of the figures above by emitting symbol pointers instead of bodies — see the [Surgical Context guide](/guide/surgical-context).
- **Line anchors (v6.13.0):** extended to JavaScript and to class methods / interface members (TS & JS), raising index-mode token reduction on real repos from ~4.6% to 32–42% (axios 42.1%, fastify 41.1%, svelte 36.8%, vue-core 32.4%).

### 2. Retrieval quality

- SigMap hit@5: **86%**
- Graph-boosted hit@5: **86%** (+0.0pp with dependency graph)
- Grep-agent baseline: **44.0%** (single-shot, `npm run benchmark:honest`)
- Honest lift: **1.87x** (+26.4pt; random baseline 13.6% kept as data only)

This is the best benchmark when the question is: *"Does SigMap actually put the right file in context?"*

### 3. Task outcomes

- Correct: **68 / 105** (64.8%)
- Partial: **17 / 90** (18.9%)
- Wrong: **13 / 90** (14.4%)
- Average prompts: **2.84 → 1.53**

This is the best benchmark when the question is: *"Does the developer need fewer retries to finish the job?"*

### 4. Quality and overflow

- **16/21** repos overflow GPT-4o's 128K context window without SigMap
- R repos add to overflow risk: ggplot2 and shiny both overflow without SigMap
- **5,200+** files would be hidden from the model in the raw-flow scenario
- **16,500+** symbols are surfaced in SigMap output across all benchmark repos
- With SigMap: **0/21 repos overflow** — all repos fit within 128K context

This is the best benchmark when the question is: *"Why does token reduction matter operationally?"*

### 5. Test discovery (v8.7)

- Impl→test discovery scored against an **independent canonical-name gold oracle** (no LLM, pure string math)
- **F1 98.0%** · precision 97.1% · recall 98.8% · **hit@1 97.4%**
- Measured across **28 repos / 3,701** canonical impl↔test pairs
- Cross-language: `test_x.py`↔`x.py`, `x_test.go`↔`x.go`, `XTest.java`↔`X.java`, `x.spec.ts`↔`x.ts`
- Reproduce: `npm run benchmark:test-discovery`

This is the best benchmark when the question is: *"When SigMap points at a file, does it also find the tests that cover it?"*

## Open the HTML dashboard

The easiest way to inspect the latest benchmark run is the self-contained HTML report:

```bash
node scripts/run-benchmark-matrix.mjs --save --skip-clone
open benchmarks/reports/benchmark-report.html
```

That generates synchronized JSON plus a dashboard for token, retrieval, quality, and task metrics together.

## Reproduce the full benchmark set

```bash
node scripts/run-benchmark.mjs --save --skip-clone
node scripts/run-retrieval-benchmark.mjs --save
node scripts/run-quality-benchmark.mjs --save
node scripts/run-task-benchmark.mjs --save
node scripts/run-benchmark-matrix.mjs --save --skip-clone
```

Each benchmark repository is **pinned to a fixed commit** in `scripts/run-benchmark.mjs` (fetched by SHA on clone). The corpus is frozen, so retrieval and token numbers move only when SigMap's own ranking/extraction changes — not when an upstream repo does. This makes hit@5 a true release-over-release signal rather than a moving target.

The matrix run writes:

- `benchmarks/reports/token-reduction.json`
- `benchmarks/reports/retrieval.json`
- `benchmarks/reports/quality.json`
- `benchmarks/reports/task-benchmark.json`
- `benchmarks/reports/benchmark-matrix.json`
- `benchmarks/reports/benchmark-report.html`

## Benchmark resources

- **[Benchmark suite →](https://github.com/manojmallick/sigmap-benchmark-suite)** — Open-source scripts, 90 real-world coding tasks, and per-repo raw results
- **[Archived data (Zenodo) →](https://zenodo.org/records/19898842)** — Full benchmark dataset for reproducibility and independent analysis
- **[Hacker News discussion →](https://news.ycombinator.com/item?id=47956790)** — Community feedback and related work
