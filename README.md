<div align="center">

<img src="assets/logo.png" alt="SigMap logo" width="80" height="80" />

# ⚡ SigMap

**SigMap is the deterministic, verifiable grounding layer for AI code work.**

[![npm version](https://img.shields.io/npm/v/sigmap?color=7c6af7&label=latest&logo=npm)](https://www.npmjs.com/package/sigmap)
[![npm downloads](https://img.shields.io/npm/dt/sigmap?color=22c55e&label=downloads&logo=npm)](https://www.npmjs.com/package/sigmap)
[![CI](https://github.com/manojmallick/sigmap/actions/workflows/ci.yml/badge.svg)](https://github.com/manojmallick/sigmap/actions/workflows/ci.yml)
[![Zero deps](https://img.shields.io/badge/dependencies-zero-22c55e)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-7c6af7.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/manojmallick/sigmap?style=flat&color=f59e0b&logo=github)](https://github.com/manojmallick/sigmap/stargazers)
[![Stargazer map](https://img.shields.io/badge/StarMapper-view%20star%20map-7c6af7?logo=googlemaps&logoColor=white)](https://starmapper.bruniaux.com/manojmallick/sigmap)
[![Discover on ShyPD](https://img.shields.io/badge/ShyPD-Discover-7c6af7?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iOCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=&logoColor=7c6af7)](https://shypd.ai/tools/sigmap)

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/manojmallick-sigmap-badge.png)](https://mseep.ai/app/manojmallick-sigmap)
[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/193cd37f-1ef3-43c3-80bc-86e23fd12924)

</div>

---

## Try it now

**No install required.** Run instantly on any machine:

```bash
npx sigmap
npx sigmap ask "Where is auth handled?"
```

Zero config. Zero dependencies. Under 10 seconds.

---

## What is SigMap?

SigMap builds a **deterministic, auditable signature-and-evidence map** of your codebase — no LLM calls, no embeddings, byte-stable output — so AI agents, CI, and reviewers can *trust and verify* which files and symbols are real before acting. Same repo in, same map out, every time.

That map is exactly what agentic grep is worst at: reproducible, auditable context an agent can consume without a copy-paste, and a grounding check that proves an AI answer is anchored to real signatures and line numbers. Token reduction comes for free — but trust is the point.

**Model-agnostic.** Works with:
- **Cloud LLMs:** Claude, GPT-4, Copilot, Gemini
- **Open-source agents:** OpenCode, Aider, OpenHands, Cline
- **Local LLMs:** Ollama, llama.cpp, vLLM (no API keys, full privacy)
- **Any editor:** VS Code, Cursor, Windsurf, Neovim, JetBrains
- **Any model:** Use what you want, no vendor lock-in

---

## Why SigMap?

**Deterministic and verifiable — the two things an agentic-grep loop can't give you:**
- **Deterministic** — no LLM calls, no agent loop; the same repo always produces a byte-identical map you can diff, cache, and gate in CI.
- **Auditable & grounded** — every file and symbol traces to a real line anchor; `sigmap verify` flags any AI claim that isn't.
- **Zero dependencies** — `npx sigmap` on any machine; no embeddings, no vector DB, no hosted service, fully offline.

**Proof it pays off** (full benchmark below):
<!--SM:whyMetrics-->
- **82.2% hit@5** — right file in top 5 results (vs 44.0% single-shot grep baseline — 1.87× lift)
- **96.8% token reduction** — average across 21 real repos
- **64.8% task-success proxy** — modeled from retrieval tiers, not measured LLM sessions
- **1.53 prompts per task** — down from 2.84 (46.1% fewer retries, modeled)
<!--/SM:whyMetrics-->
- **<!--SM:languages-->33<!--/SM:languages--> languages supported** — TypeScript, Python, Go, Rust, Java, R, and more
- **No vendor lock-in** — works with any AI assistant or local LLM
- **No API costs** — use local models (Ollama, llama.cpp, vLLM) with zero token fees
- **Full privacy** — keep your code and context on your machine

---

## 🔒 `sigmap verify` — the grounding flagship

The one thing no agentic-grep loop, and no competitor, gives you: **prove an AI answer is anchored to real signatures and line numbers before you trust it.** Deterministic, offline, no LLM — SigMap indexes your repo *plus the libraries actually installed here* and flags every fabricated file, import, symbol, test, or npm script.

```bash
sigmap verify answer.md                 # ✓ grounded, or a line-by-line list of fabrications
sigmap verify answer.md --json          # machine-readable report; exits 1 if any issue (CI gate)
sigmap verify answer.md --report        # standalone red/amber/green HTML report
```

```text
[sigmap] ✗ answer.md — 2 issues found
  fake-file: 1  fake-test-file: 0  fake-import: 0  fake-symbol: 1  fake-npm-script: 0

  L12  [Fake file]    src/auth/session-store.js does not exist
  L27  [Fake symbol]  authorize() — did you mean authenticate()?
```

`verify` is the flagship; `verify-ai-output` remains as the full command name. Pair it with `sigmap verify-plan` (check a plan before execution) and the `verify_suggestion` MCP tool (verify AI code against repo + private + installed-library symbols mid-session).

---

## Replace this with SigMap

| Without SigMap | With SigMap |
|---|---|
| ❌ Non-reproducible agent guesses | ✅ Deterministic map — same input, same output, every time |
| ❌ "Trust me" AI answers | ✅ Grounded — right file in context <!--SM:hitWhole-->82%<!--/SM:hitWhole--> of the time, every symbol on a real line anchor |
| ❌ Embeddings / vector DB required | ✅ Zero deps, no infra, fully offline |

---

## How it works

```
Ask → Rank → Context → Validate → Judge → Learn
```

1. **Ask** — `sigmap ask "Where is auth handled?"` — ranked file list
2. **Rank** — TF-IDF scores every file against your query
3. **Context** — writes compact signatures to your AI's context file
4. **Validate** — `sigmap validate` — confirms right files are in scope
5. **Judge** — `sigmap judge` — scores answer groundedness against context
6. **Learn** — `sigmap weights` — boosts files that keep solving your tasks

---

## Benchmark

<!--SM:benchmarkBlock-->
```
Benchmark : sigmap-v8.26-main (21 repositories, including R language)
Date      : 2026-08-17

Hit@5          : 82.2%   (grep-agent baseline 44.0%  — 1.87× lift)
Token reduction: 96.8%   (across 21 repos)
Prompt reduction : 46.1% (2.84 → 1.53 prompts per task, modeled)
Task success   : 64.8%   (proxy — modeled from retrieval tiers)
Repos tested   : 21 (JavaScript, Python, Go, Rust, Java, R, C++, C#, Dart, Swift, Ruby, PHP, Scala, Kotlin, and more)
```
<!--/SM:benchmarkBlock-->

<sub>All numbers above are generated from `benchmarks/latest.json` (`npm run metrics:sync`) — never hand-typed.</sub>

Measured on 90 coding tasks across 18 real public repos. No LLM API — fully reproducible.

**Resources:**
- [Full methodology →](https://sigmap.io/guide/benchmark.html)
- [Benchmark suite (GitHub)](https://github.com/manojmallick/sigmap-benchmark-suite) — scripts, tasks, and raw data
- [Benchmark data (Zenodo)](https://zenodo.org/records/19898842) — archived results for reproducibility

<div align="center">
<img src="docs/comparison-chart.svg" alt="SigMap benchmark — before vs after across 3 RAG quality metrics" width="700" />
</div>

---

## Install

**Try without installing:**

```bash
npx sigmap
```

**Install globally:**

```bash
npm install -g sigmap
```

**Install per-project:**

```bash
npm install --save-dev sigmap
```

**Standalone binary** — no Node.js required:

| Platform | Download |
|---|---|
| macOS Apple Silicon | [`sigmap-darwin-arm64`](https://github.com/manojmallick/sigmap/releases/latest/download/sigmap-darwin-arm64) |
| macOS Intel | [`sigmap-darwin-x64`](https://github.com/manojmallick/sigmap/releases/latest/download/sigmap-darwin-x64) |
| Linux x64 | [`sigmap-linux-x64`](https://github.com/manojmallick/sigmap/releases/latest/download/sigmap-linux-x64) |
| Windows x64 | [`sigmap-win32-x64.exe`](https://github.com/manojmallick/sigmap/releases/latest/download/sigmap-win32-x64.exe) |

Each binary ships with a `.sha256` checksum. [Verify a binary →](docs/readmes/binaries.md)

**Volta:**

```bash
volta install sigmap
```

---

## Integrations

**AI assistants — one run, all of them:**

| Adapter | Output file | Used by |
|---|---|---|
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot, OpenCode |
| `claude` | `CLAUDE.md` | Claude / Claude Code |
| `cursor` | `.cursorrules` | Cursor, Cline |
| `windsurf` | `.windsurfrules` | Windsurf |
| `openai` | `.github/openai-context.md` | OpenAI API, Aider, local Ollama/llama.cpp |
| `gemini` | `.github/gemini-context.md` | Google Gemini |
| `codex` | `AGENTS.md` | OpenAI Codex (legacy) |
| `willow` | _Willow MCP store (HTTP POST — no file)_ | [Willow](https://github.com/rudi193-cmd/willow-1.9) knowledge store |

```bash
sigmap --adapter copilot   # default — works with Copilot, OpenCode
sigmap --adapter openai    # works with Ollama, llama.cpp, vLLM, Aider
sigmap --adapter claude    # works with Claude Code
```

**Open-source agents & local LLMs:**

Use SigMap with open-source tools and fully self-hosted setups:
- **[Open-source agents guide →](https://sigmap.io/guide/agents)** — OpenCode, Aider, OpenHands, Cline
- **[Local LLMs guide →](https://sigmap.io/guide/local-llms)** — Ollama, llama.cpp, vLLM (no API keys, full privacy)

**IDE extensions:**

| IDE | Install | Source | Features |
|-----|---------|--------|----------|
| **VS Code** | [Marketplace](https://marketplace.visualstudio.com/items?itemName=manojmallick.sigmap) · [Open VSX](https://open-vsx.org/extension/manojmallick/sigmap) | [github.com/manojmallick/sigmap-vscode](https://github.com/manojmallick/sigmap-vscode) | Status bar health grade, stale context alerts, one-click regen |
| **JetBrains** | [Marketplace](https://plugins.jetbrains.com/plugin/31109-sigmap--ai-context-engine/) | [github.com/manojmallick/sigmap-jetbrains](https://github.com/manojmallick/sigmap-jetbrains) | IntelliJ IDEA, WebStorm, PyCharm, GoLand — tool window + actions |
| **Neovim** | lazy.nvim / packer / vim-plug | [github.com/manojmallick/sigmap.nvim](https://github.com/manojmallick/sigmap.nvim) | `:SigMap`, `:SigMapQuery` float window, statusline widget |

**MCP server** — 21 on-demand tools for Claude Code and Cursor:

```bash
sigmap --mcp
```

Tools: `read_context`, `search_signatures`, `get_map`, `create_checkpoint`, `get_routing`, `explain_file`, `list_modules`, `query_context`, `get_method_impact` (per-symbol blast radius), `get_impact`, `get_lines`, `read_memory`, `get_callee_signatures`, `get_diff_context` (changed files + signatures + blast radius), `get_architecture_overview` (modules, hub files, cycles), `verify_suggestion` (ground AI code against repo + installed libraries), `squeeze_output` (compress noisy tool/log/JSON output mid-session), plus the live-index notifications `sigmap_notify_file_created`, `sigmap_notify_symbol_added`, and `sigmap_notify_file_deleted`. Full reference: [llms-full.txt](llms-full.txt).

SigMap doesn't compete with your agent's live search — it's what the live loop **calls for grounding**: grep finds the file; `query_context` → `get_callee_signatures` → `get_lines` → `verify_suggestion` → `get_method_impact` prove the symbols, lines, calls, and blast radius — deterministically. See [the agent live-loop guide](https://sigmap.io/guide/mcp#your-agents-live-loop).

---

## Grounded creation & guardrails

Verify AI work against the live index instead of trusting it blind:

```bash
sigmap conventions                  # extract the repo's file-naming / export / test conventions
sigmap scaffold "<name>"            # propose a convention-matched file/dir (refuses if conventions conflict)
sigmap verify-plan <plan.md>        # check a plan: do the files/symbols exist? blast radius? scope?
sigmap verify-ai-output <answer.md> # flag fabricated files/imports/symbols/tests in an AI answer
sigmap review-pr                    # audit a diff: scope drift, god-node edits, missing tests, security files
sigmap create "<task>"             # run the whole pipeline: scaffold → verify-plan → verify-ai-output → review-pr
```

---

## Evidence Pack & diagnostics

The **Evidence Pack** is the consumable, machine-readable replacement for "paste this into your prompt" — a deterministic JSON artifact (with a Markdown handoff mode) that an agent or CI step reads directly, with zero copy-paste:

```bash
sigmap evidence "how does auth work"            # → .context/evidence-pack.json (deterministic, byte-stable)
sigmap evidence "how does auth work" --markdown # Markdown handoff to stdout
sigmap doctor                                   # diagnose config, index, freshness, coverage, MCP wiring — with fixes
```

Each pack carries the ranked files, the symbols and line anchors that justify them, the token budget, the dropped files (and why), and the grounding summary — so a consumer can trust and audit the context instead of guessing.

---

## Agent recipes

SigMap treats coding agents as **consumers, not competitors**: it hands them a deterministic, auditable map the agent can read on demand. Wire any of them up once, then let the agent pull context or consume an Evidence Pack.

| Agent | One-time setup | How it consumes SigMap |
|---|---|---|
| **Claude Code** | `sigmap mcp install claude` | 21 MCP tools (`search_signatures`, `get_lines`, `get_diff_context`, `squeeze_output`…) |
| **Cursor** | `sigmap mcp install cursor` | MCP tools, plus the `cursor` adapter writes `.cursorrules` |
| **Cline** | `sigmap mcp install cursor` | Reads `.cursorrules`; same MCP server |
| **Continue** | `sigmap mcp install vscode` | MCP tools inside the Continue extension |
| **Aider** | `sigmap --adapter openai` | Reads `.github/openai-context.md` before a session |
| **OpenHands** | `sigmap evidence "<task>"` | Consumes `.context/evidence-pack.json` directly |
| **Codex CLI** | `sigmap mcp install codex` | MCP tools, plus the `codex` adapter writes `AGENTS.md` |

```bash
# Pattern 1 — give the agent live, on-demand access (MCP)
sigmap mcp install claude        # one of: claude|cursor|windsurf|vscode|zed|codex|gemini|opencode|mcp
                                 # add --global for a user-level install

# Pattern 2 — hand the agent a deterministic Evidence Pack (no MCP, no copy-paste)
sigmap evidence "implement rate limiting" --markdown   # or read .context/evidence-pack.json
```

See [`sigmap mcp list`](https://sigmap.io/guide/cli.html) for every supported client.

---

## Try it

```bash
# 1. Generate context for your project
npx sigmap

# 2. Ask a question — get ranked files
sigmap ask "Where is auth handled?"

# 3. Validate — confirm the right files are in scope
sigmap validate --query "auth login token"

# 4. Judge — score your AI's answer for groundedness
sigmap judge --response response.txt --context .context/query-context.md

# 5. Inspect health
sigmap --health
```

---

## Start guide

| Who | Start here |
|---|---|
| 👶 **New** | [Quick start guide](docs/readmes/GETTING_STARTED.md) — setup in 60 seconds |
| ⚡ **Daily** | `sigmap ask` / `sigmap validate` / `sigmap judge` |
| 🧠 **Advanced** | [Context strategies](docs/readmes/CONTEXT_STRATEGIES.md) · [MCP setup](docs/readmes/MCP_SETUP.md) |
| 🏢 **Teams** | [Config reference](https://sigmap.io/guide/config.html) · [CI setup](docs/readmes/ENTERPRISE_SETUP.md) |

---

## Docs

**[sigmap.io](https://sigmap.io)**

| Section | Link |
|---|---|
| CLI reference (32 commands) | [cli.html](https://sigmap.io/guide/cli.html) |
| Benchmark methodology | [benchmark.html](https://sigmap.io/guide/benchmark.html) |
| Config reference | [config.html](https://sigmap.io/guide/config.html) |
| Roadmap | [roadmap.html](https://sigmap.io/guide/roadmap.html) |
| <!--SM:languages-->33<!--/SM:languages--> languages | [generalization.html](https://sigmap.io/guide/generalization.html) |

---

## Support

If SigMap saves you context or API spend, a ⭐ on [GitHub](https://github.com/manojmallick/sigmap) helps others find it.

🌍 See where SigMap's stargazers are around the world on the **[StarMapper star map →](https://starmapper.bruniaux.com/manojmallick/sigmap)**.

📈 Watch SigMap's growth on the **[Star History chart →](https://star-history.com/#manojmallick/sigmap&Date)**.

[Report an issue](https://github.com/manojmallick/sigmap/issues) · [Changelog](CHANGELOG.md)

---

## Sponsor

SigMap is built and maintained by one developer, kept **zero-dependency**, offline, and free. If it saves your team context or API spend, sponsoring keeps it that way — and funds the benchmark CI, the `sigmap.io` domain, and ongoing supply-chain hardening.

💜 **[Become a sponsor →](https://github.com/sponsors/manojmallick)** · see **[SPONSOR.md](SPONSOR.md)** for tiers and exactly where your support goes. Any amount helps — even $1/mo — and a ⭐ or a share counts too.

---

## Contributing

SigMap welcomes contributions! 

**Before submitting a PR:**
1. Read [CONTRIBUTING.md](CONTRIBUTING.md)
2. Check [Discussions → Announcements](../../discussions) for workflow setup
3. Target the `develop` branch (not main)
4. Follow the [contributor checklist](.github/CONTRIBUTOR_CHECKLIST.txt)

See [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) for the PR checklist. All contributors are credited in the CHANGELOG and release notes.

---

## Why not embeddings?

| | Embeddings | SigMap |
|---|:---:|:---:|
| Vector DB required | ✅ | ❌ |
| Infrastructure to run | ✅ | ❌ |
| Drift over time | ✅ | ❌ |
| Deterministic results | ❌ | ✅ |
| Zero-config setup | ❌ | ✅ |
| Works offline | ❌ | ✅ |

- **No vector DB** — signatures are plain text files committed to your repo
- **No infra** — runs locally, zero cloud dependencies
- **No drift** — regenerating is `npx sigmap`, not a reindex pipeline
- **Deterministic** — same input always produces same ranked output
- **Faster** — TF-IDF ranking runs in milliseconds, no embeddings to compute

---

## <!--SM:languages-->33<!--/SM:languages--> languages

TypeScript · JavaScript · Python · Java · Kotlin · Go · Rust · C# · C/C++ · Ruby · PHP · Swift · Dart · Scala · Vue · Svelte · HTML · CSS/SCSS · YAML · Shell · SQL · GraphQL · Terraform · Protobuf · Dockerfile · TOML · XML · Properties · Markdown · R · GDScript

All implemented with zero external dependencies.

[Full language table →](https://sigmap.io/guide/generalization.html)

### Extraction honesty

Not all 33 languages get the same depth — and we say so plainly:

| Tier | Coverage | Depth |
|------|----------|-------|
| **AST** | Python (`python3` on PATH; regex fallback without) | Full parse |
| **Anchored regex** | 11 brace languages (JS, TS, Go, Rust, Java, Kotlin, Swift, PHP, Scala, Dart, C#) | Declarations + `:start-end` line anchors; doc hints on 6 |
| **Pattern/heuristic** | Everything else + generic fallback | Line-oriented patterns |

Caps: 25 signatures/file · 8 members/block. Full details, known regex gaps, and what they mean for `verify`: **[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)**.

---

## License

MIT © 2026 [Manoj Mallick](https://github.com/manojmallick) · Made in Amsterdam

---

<div align="center">

**[Docs](https://sigmap.io) · [Changelog](CHANGELOG.md) · [Roadmap](https://sigmap.io/roadmap.html) · [npm](https://www.npmjs.com/package/sigmap)**

⭐ [Star on GitHub](https://github.com/manojmallick/sigmap) if SigMap saves you tokens.

</div>
