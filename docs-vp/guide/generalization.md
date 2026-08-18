---
title: Generalization — SigMap across languages, domains & repo sizes
description: SigMap generalizes across 21 repos, 33 languages, and multiple domains with 81.1% hit@5 in the latest saved v8.26.0 retrieval run.
head:
  - - meta
    - property: og:title
      content: "SigMap Generalization — 81.1% hit@5 across 33 languages with R support"
  - - meta
    - property: og:description
      content: "SigMap's latest public snapshot spans 18 repos, 13 languages, and 9 domains without per-repo tuning."
  - - meta
    - property: og:url
      content: "https://sigmap.io/guide/generalization"
---

# Generalization

::: info Why this matters
SigMap was not tuned for one repo. This benchmark matters because it shows the same workflow transfers across different languages, repo sizes, and architectures without manual tuning.
:::

::: info Official v8.26.0 benchmark snapshot
**Benchmark ID:** sigmap-v8.27-main &nbsp;·&nbsp; **Date:** 2026-08-18 (with R language)

| Metric | Value |
|---|---:|
| Hit@5 | **82%** vs 44.0% single-shot grep baseline |
| Honest lift (vs grep agent) | **1.73×** |
| Prompt reduction | **45.7%** (2.84 → 1.54) |
| Task success proxy | **64.8%** |
| Overall token reduction | **96.8%** |
| GPT-4o overflow (without → with) | **16/21 → 0/21** |
:::

The important part of SigMap's benchmark story is not just the topline score. It is that the same retrieval approach works across a mixed set of repos rather than one curated demo project.

::: info What "generalization" means here
SigMap's signature extractors are hand-written regex patterns, not ML models. Generalization
means: *do the patterns hold up on codebases the authors never inspected?* The answer across
these 105 tasks is yes — 81.1% hit@5 with no per-repo tuning in the latest saved v8.26.0 run.
:::

- **21 repos** (including 3 R language repos)
- **33 languages** (added R and GDScript)
- **multiple domains**
- **81.1%** overall hit@5
- **no per-repo tuning**

That snapshot is shared with the [retrieval benchmark](/guide/retrieval-benchmark) and the [task benchmark](/guide/task-benchmark), so the public docs now use one release number set instead of mixing older runs.

## Why this matters

SigMap uses hand-written extractors and lightweight ranking rather than a hosted retrieval stack. The strongest proof of generalization is therefore breadth:

- frameworks and application repos
- libraries and dev tools
- small, medium, and large codebases
- languages with very different syntax shapes

## Representative coverage

| Category | Example repos |
|---|---|
| Web frameworks | `express`, `flask`, `gin`, `rails`, `laravel`, `fastapi`, `fastify`, `vapor` |
| Libraries / tooling | `axios`, `okhttp`, `serilog`, `riverpod`, `rust-analyzer`, `abseil-cpp`, `akka` |
| UI frameworks | `vue-core`, `svelte` |

## Practical takeaway

If you want one number to carry into launch messaging, use the shared `v8.26.0` snapshot rather than an older per-page variant:

| Domain | Repos | Hit@5 | Example repo |
|---|---|---|---|
| Dev tools | 1 | **100%** | rust-analyzer |
| Systems lib | 1 | **100%** | abseil-cpp |
| State management | 1 | **100%** | riverpod |
| Concurrency | 1 | **100%** | akka |
| UI framework | 2 | **100%** | vue-core, svelte |
| Web app | 1 | **100%** | spring-petclinic |
| HTTP client | 2 | **90%** | axios, okhttp |
| Web framework | 8 | **83%** | express, rails, gin, laravel, flask, vapor, fastify, fastapi |
| Logging | 1 | **20%** | serilog |

Most domains land at or near 100%. The two low outliers — `serilog` (logging) and `vapor`
(web framework) — are files whose signatures genuinely lack the query vocabulary; those need
semantic retrieval and are the known residual misses. The variation is explained by repo
structure (fragmented vs modular signatures) rather than language or domain category.

---

## By repo size — small to 1,533 files

| Size | File count | Repos | Avg hit@5 |
|---|---|---|---|
| Small | ≤25 files | 5 | 96% |
| Medium | 26–200 files | 5 | 56% |
| Large | >200 files | 8 | **100%** |

**Large repos benefit most.** Without SigMap, the random baseline for a 1,000-file repo
is effectively 0% (5/1000 = 0.5%). SigMap's ranked retrieval closes that gap entirely,
scoring 100% hit@5 on rails (1,179 files) and laravel (1,533 files).

---

## Anti-overfitting evidence

SigMap's extractors use **hand-written regex patterns** per language — not ML models, not embeddings.
They were written against a small set of internal fixtures. The 18 benchmark repos were never
inspected during development.

Key signals that the results are not overfit:

- **Zero per-repo tuning** — the same `gen-context.js` command with default config ran on all 18 repos
- **Blind selection** — repos were chosen by GitHub star count and language diversity, not by testing which ones scored well
- **Failure modes are honest** — C#/serilog 20%, Swift/vapor 0%, TypeScript/axios 80%, JS/fastify 80% — genuine weak spots, not massaged away
- **Large repos score *higher*** — if the extractor patterns were memorized, they'd degrade on unseen large codebases; instead they improve (100% vs 96% for small repos)

---

## Repo inventory

| Repo | Language | Domain | Files | Hit@5 |
|---|---|---|---|---|
| express | JavaScript | Web framework | 6 | 100% |
| flask | Python | Web framework | 19 | 100% |
| gin | Go | Web framework | 107 | 100% |
| spring-petclinic | Java | Web app | 13 | 100% |
| rails | Ruby | Web framework | 1,179 | 100% |
| axios | TypeScript | HTTP client | 25 | 80% |
| rust-analyzer | Rust | Dev tools | 635 | 100% |
| abseil-cpp | C++ | Systems lib | 700 | 100% |
| serilog | C# | Logging | 99 | 20% |
| riverpod | Dart | State management | 446 | 100% |
| okhttp | Kotlin | HTTP client | 18 | 100% |
| laravel | PHP | Web framework | 1,533 | 100% |
| akka | Scala | Concurrency | 211 | 100% |
| vapor | Swift | Web framework | 131 | 0% |
| vue-core | Vue | UI framework | 232 | 100% |
| svelte | Svelte | UI framework | 370 | 100% |
| fastify | JavaScript | Web framework | 31 | 80% |
| fastapi | Python | Web framework | 48 | 80% |


---

<div style="text-align:center;margin-top:2.5rem;padding-bottom:.5rem;font-size:0.85em;color:var(--vp-c-text-3)">
  Made in Amsterdam, Netherlands <span title="Netherlands">🇳🇱</span>
</div>
