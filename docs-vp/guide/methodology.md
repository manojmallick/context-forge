---
title: Benchmark methodology
description: How SigMap benchmarks are designed, what we measure, and why. 90 real-world tasks, 18 repos, reproducible results.
head:
  - - meta
    - property: og:title
      content: "SigMap Benchmark Methodology"
  - - meta
    - property: og:description
      content: "Design and methodology behind SigMap's retrieval, quality, and task benchmarks."
  - - meta
    - property: og:url
      content: "https://sigmap.io/guide/methodology"
---

# Benchmark methodology

This page explains what we measure, how we measure it, and why we chose these metrics.

## Overview

SigMap is evaluated on **90 real-world coding tasks** across **18 open-source repositories** spanning **8 programming languages**. The benchmark answers: "Does SigMap help developers finish coding tasks with fewer retries?"

## Test set: 105 tasks across 18 repos

The benchmark includes 5 tasks per repository, distributed across multiple languages and project types:

| Language | Repos | Example projects | Tasks |
|----------|-------|------------------|-------|
| Python | 2 | Flask, FastAPI | 10 |
| JavaScript | 4 | Express, Axios, Fastify, Vue | 20 |
| Java | 3 | Spring, OkHttp, Akka | 15 |
| Go | 1 | Gin | 5 |
| Ruby | 1 | Rails | 5 |
| Rust | 1 | rust-analyzer | 5 |
| C++ | 1 | abseil-cpp | 5 |
| PHP | 1 | Laravel | 5 |
| Other | 4 | Serilog (C#), Riverpod (Dart), Vapor (Swift), Svelte (TS/JS) | 20 |
| **Total** | **18** | — | **90** |

### Task selection criteria

Each task was designed to be:
- **Representative** — common developer questions in real projects
- **Challenging** — requires understanding module architecture, not just keyword search
- **Answerable** — solution files exist in the repository
- **Language-diverse** — covers different syntax, structure, and naming patterns

Example tasks:
- "Where is the auth middleware implemented?" (locate)
- "How do I configure rate limiting?" (explain)
- "Fix the memory leak in connection pooling" (debug)
- "Refactor the request handler to support streaming" (modify)

## What we measure

### 1. Retrieval accuracy (Hit@5)

**Question:** Does SigMap find the right file in the top 5 results?

**Why:** Retrieval is a prerequisite. If the right file isn't in context, the AI can't answer correctly.

**Metric:** Hit@5 — the right file appears in the top 5 ranked results

**Baseline:** Single-shot grep agent = 44.0% hit@5 — whole-repo term scan ranked by coverage then occurrences (`npm run benchmark:honest`). The old random-selection figure (~13.6%) remains in the reports as data but is no longer the quoted comparison.

**SigMap score:** 82.2% — a measured 1.76× honest lift over the grep baseline

### 2. Task success proxy (correct rank)

**Question:** Was the right file ranked first?

**Why:** Rank 1 usually means one prompt. Rank 2-5 means follow-up. No hit = multiple retries.

**Metric:** Files ranked in positions:
- **Correct** (rank 1) — likely single prompt
- **Partial** (ranks 2-5) — likely follow-up
- **Wrong** (not in top 5) — likely multiple retries

**SigMap breakdown:**
- Correct: 64.8% of tasks
- Partial: 26.7% of tasks
- Wrong: 21.1% of tasks

### 3. Prompt reduction

**Question:** Do developers need fewer prompts with SigMap context?

**Why:** Real measure of usability. Fewer retries = faster answers.

**Metric:** Average prompts per task
- **Without SigMap:** 2.84 prompts/task (cold start, no context)
- **With SigMap:** 1.53 prompts/task
- **Reduction:** 41.0%

### 4. Token reduction

**Question:** How much context do we actually need?

**Why:** Token limits constrain what we can include. SigMap keeps answers grounded by sending less.

**Metric:** Token count of final context
- **Full repo signatures:** 12.8M tokens (before SigMap)
- **SigMap output:** 241K tokens (after ranking/filtering)
- **Reduction:** 96.8% average, 40–98% per repo

**Impact:** Without SigMap, 13 of 18 repos overflow GPT-4o's 128K context window. With SigMap, all 18 fit.

### 5. Answer usefulness (v6.9+)

**Question:** Do answers retrieved with SigMap actually help developers?

**Why:** Correct retrieval doesn't guarantee helpful answers. We measure whether context + retrieval enables correct problem-solving.

**Metric:** Usefulness tier
- **Fully useful** — context enabled correct answer
- **Partially useful** — context partially helped but needed clarification
- **Not useful** — context didn't help or was misleading

## Reproducibility

All benchmarks are reproducible:

- **Task set:** 105 tasks committed in `benchmarks/tasks/`
- **Repositories:** 18 open-source projects cloned from GitHub
- **Scripts:** Benchmark runners in `scripts/run-*.mjs`
- **Raw data:** Available in [Zenodo archive](https://zenodo.org/records/19898842)
- **Dashboard:** Self-contained HTML report in `benchmarks/reports/benchmark-report.html`

Run the benchmarks yourself:

```bash
node scripts/run-retrieval-benchmark.mjs
node scripts/run-quality-benchmark.mjs
node scripts/run-task-benchmark.mjs
node scripts/run-benchmark-matrix.mjs --save
```

## Per-repo variation

Metrics vary significantly by repository type:

| Dimension | Range | Meaning |
|-----------|-------|---------|
| Hit@5 by language | 60–100% | Python/Java typically higher, JS lower due to naming variance |
| Prompt reduction | 17–65% | Larger repos need more context reduction |
| Token reduction | 40–98% | Enterprise frameworks reduce more than utilities |

See [per-repo breakdown](retrieval-benchmark.md#per-repo-results) for details.

## Confidence and limitations

**What this benchmark covers:**
- File retrieval in well-structured open-source projects
- Common developer tasks across 8 languages
- Context quality under token constraints

**What this benchmark does NOT cover:**
- Enterprise proprietary codebases (different structure, naming)
- Real-time user study of answer quality
- Performance (latency, memory usage)
- Specialized languages (Lisp, Haskell, Niche domains)

Treat these metrics as a guide, not a guarantee. Your results may vary based on:
- Codebase size and complexity
- Project naming consistency
- Language-specific patterns
- Domain-specific terminology

---

**Questions about methodology?** Open an issue on [GitHub](https://github.com/manojmallick/sigmap/issues).

**Want to contribute tasks?** See [benchmark suite repository](https://github.com/manojmallick/sigmap-benchmark-suite).
