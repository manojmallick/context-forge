---
title: Quality benchmark
description: What token reduction means operationally in v8.31.0. 16/21 repos overflow GPT-4o without SigMap, 5,200+ files would be hidden, and input-cost savings reach $9,900+/month (GPT-4o), $11,900+ (Claude Sonnet), or $3,900+ (Claude Haiku) at 10 calls/day.
head:
  - - meta
    - property: og:title
      content: "SigMap quality benchmark — overflow, hidden files, and cost"
  - - meta
    - property: og:description
      content: "16/21 repos overflow GPT-4o without SigMap. 5,200+ files would be hidden. Input-cost savings: $9,900+/mo GPT-4o, $11,900+ Claude Sonnet, $3,900+ Claude Haiku at 10 calls/day."
  - - meta
    - property: og:url
      content: "https://sigmap.io/guide/quality-benchmark"
---

# Quality benchmark

::: info Official v8.31.0 benchmark snapshot
**Benchmark ID:** sigmap-v8.31-main &nbsp;·&nbsp; **Date:** 2026-09-08 (with R language)

| Metric | Value |
|---|---:|
| Hit@5 | **82%** vs 44.0% single-shot grep baseline |
| Honest lift (vs grep agent) | **1.73×** |
| Prompt reduction | **45.7%** (2.84 → 1.54) |
| Task success proxy | **64.8%** |
| Overall token reduction | **96.8%** |
| GPT-4o overflow (without → with) | **16/21 → 0/21** |
:::

Token reduction is the mechanism. This benchmark shows the operational consequence:

- does the repo fit inside model limits?
- how much code would be hidden without SigMap?
- what does that mean for API cost?

Latest saved run: **2026-09-08 (v8.31.0)**

## Headline numbers

| Metric | Without SigMap | With SigMap |
|---|:---:|:---:|
| GPT-4o overflow repos | **16 / 21** | 0 / 21 |
| Hidden files | **5,200+** | 0 |
| Grounded symbols surfaced | 0 | **16,500+** |
| Monthly input savings (10 calls/day) | — | **$9,900+** GPT-4o · **$11,900+** Sonnet · **$3,900+** Haiku |

## 1. Context window fit

Raw repository content overflows GPT-4o's 128K window in **16 of 21** benchmark repos. It overflows Claude's 200K window in many of 21 repos.

That means a tool has to omit or truncate content before the model answers. SigMap avoids this by staying inside the budgeted context envelope.

| Repo class | Without SigMap | With SigMap |
|---|---:|---:|
| GPT-4o fits | 5 / 21 | 21 / 21 |
| Claude 200K fits | 9 / 21 | 21 / 21 |
| Gemini 1M fits | 14 / 21 | 21 / 21 |

## 2. Hidden-file risk

Across the benchmark repos, **5,200+** files would be hidden from the model in the raw-flow scenario.

This is the clearest explanation for why "just send the repo" is unreliable:

- some files never reach the model
- which files get dropped depends on the tool
- the omission is easy to miss until the answer is already wrong

SigMap changes that by surfacing compact signatures for the project structure ahead of time.

## 3. Grounded symbols

The latest saved run surfaced **16,500+** grounded symbols across the benchmark repos. That is the structural map the model can actually reason over.

Without SigMap, the same benchmark set leaves symbols effectively dark or unreachable to the model.

## 4. Cost impact

At 10 calls per day across the benchmark set. Token reduction is model-agnostic; the **dollar** figure scales with each model's input rate, so the same reduction saves different amounts per model. Pricing is per 1M input tokens, verified 2026-07 (GPT-4o [$2.50](https://openai.com/api/pricing/); Claude Sonnet 5/4.6 [$3.00](https://platform.claude.com/docs/en/about-claude/pricing) and Haiku 4.5 [$1.00](https://platform.claude.com/docs/en/about-claude/pricing)):

| Model | Input $/1M | Saved / day | Saved / month |
|---|:---:|---:|---:|
| GPT-4o | $2.50 | **$330+** | **$9,900+** |
| Claude Sonnet | $3.00 | **$390+** | **$11,900+** |
| Claude Haiku | $1.00 | **$130+** | **$3,900+** |

This is why the benchmark story is not just "smaller output." It directly affects the latency and cost profile of daily AI-assisted work — across whichever model you run.

## Reproduce

```bash
node scripts/run-benchmark.mjs --save --skip-clone
node scripts/run-quality-benchmark.mjs --save
node scripts/run-benchmark-matrix.mjs --save --skip-clone
```

Open the HTML dashboard for the full saved snapshot:

```bash
open benchmarks/reports/benchmark-report.html
```
