---
title: Task benchmark
description: Latest saved task benchmark for SigMap v8.31.0. 64.8% correct, 45.7% fewer prompts, 81.1% hit@5 across 105 tasks, with R language support.
head:
  - - meta
    - property: og:title
      content: "SigMap task benchmark — fewer retries, better context (with R language)"
  - - meta
    - property: og:description
      content: "Latest saved run: 64.8% correct, 1.53 prompts per task, 45.7% prompt reduction, 105 tasks, 18+ repos with R support."
  - - meta
    - property: og:url
      content: "https://sigmap.io/guide/task-benchmark"
---

# Task benchmark

::: info Official v8.31.0 benchmark snapshot
**Benchmark ID:** sigmap-v8.31-main &nbsp;·&nbsp; **Date:** 2026-09-08 (with R language)

| Metric | Value |
|---|---:|
| Hit@5 | **82%** vs 44.0% single-shot grep baseline |
| Graph-boosted hit@5 | **88%** |
| Honest lift (vs grep agent) | **1.73×** |
| Prompt reduction | **45.7%** (2.84 → 1.54) |
| Task success proxy | **64.8%** |
| Token reduction (21 repos) | **96.8%** |
| GPT-4o overflow (without → with) | **16/21 → 0/21** |
:::

Latest saved run: **2026-09-08 (v8.31.0)** — Now includes R language support (ggplot2, dplyr, shiny)

This page answers the question people care about most:

> does SigMap help the developer finish the task with fewer retries?

## Headline result

| Metric | Without SigMap | With SigMap |
|---|:---:|:---:|
| Task success proxy | 10% | **64.8%** |
| Prompts per task | 2.84 | **1.54** |
| Prompt reduction | — | **48%** |
| Retrieval hit@5 | 13.6% | **88%** |
| Token reduction | — | **96.8%** |

## Why the task benchmark exists

Retrieval is a prerequisite, but not the whole story. Developers feel the difference as:

- fewer prompt retries
- fewer "can you share more files?" loops
- fewer answers grounded in the wrong module

The task benchmark models that outcome from the ranked file quality tiers:

- rank 1 hit → likely one prompt
- rank 2–5 hit → likely follow-up prompt
- miss → likely multiple retries

## Current saved score card

| Tier | Meaning | Tasks | Share |
|---|---|---:|---:|
| Correct | Right file was ranked first | 61 | **64.8%** |
| Partial | Right file was present but not first | 17 | **18.9%** |
| Wrong | Right file never surfaced in top 5 | 13 | **14.4%** |

## Prompt model summary

| Metric | Value |
|---|---:|
| Average prompts without SigMap | 2.84 |
| Average prompts with SigMap | **1.54** |
| Reduction | **48%** |
| Honest hit@5 lift | **1.73x** vs single-shot grep baseline (per-repo random lifts remain in the report as data) |

## What changed in the v5 story

The earlier SigMap story was mostly "smaller context." The v5 story is more useful:

- use [ask](/guide/ask) to build the focused context
- use [validate](/guide/validate) to make sure coverage is healthy
- use [judge](/guide/judge) to check whether the answer was actually grounded
- use [learning](/guide/learning) when the same files repeatedly help or hurt

That makes the benchmark more than a marketing claim. It maps onto the actual daily workflow.

## Benchmark snapshot by repo

| Repo | Prompt reduction | Correct / Partial / Wrong |
|---|---:|---:|
| flask | 64.8% | 5 / 0 / 0 |
| gin | 43.7% | 3 / 1 / 1 |
| rails | 47.2% | 2 / 1 / 2 |
| rust-analyzer | 64.8% | 4 / 1 / 0 |
| serilog | 26.1% | 0 / 2 / 3 |
| laravel | 64.7% | 2 / 3 / 0 |
| vapor | 17.7% | 1 / 1 / 3 |
| fastapi | 48.9% | 4 / 0 / 1 |

These rows show why the task benchmark matters. Some repos have great retrieval lift but still need workflow help around validation and judge-based trust.

## Reproduce

```bash
node scripts/run-task-benchmark.mjs --save
node scripts/run-task-benchmark.mjs --json
```

For the full multi-benchmark dashboard:

```bash
node scripts/run-benchmark-matrix.mjs --save --skip-clone
open benchmarks/reports/benchmark-report.html
```
