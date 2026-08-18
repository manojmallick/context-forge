# Known limitations

SigMap's benchmark claims are honesty-audited (measured grep-agent baseline, retrieval-tier proxies labeled as proxies, leakage-gated hard corpus). This page extends the same standard to the **extraction layer**: what each extractor tier actually does, where it truncates, and what that means for verification. Every claim here is checkable against the code.

Currently: **43 extractor modules covering 33 languages**. Counts are guarded against drift by `test/integration/known-limitations.test.js` (they must match `version.json`).

## Extractor tiers

| Tier | Languages | How it works | What it can miss |
|------|-----------|--------------|------------------|
| **1 — AST** | Python | Native CPython AST parse via `src/extractors/python_ast.py` when `python3` is on PATH; falls back to Tier-2-style regex when it is not | With the fallback active: same gaps as Tier 2 |
| **2 — anchored regex** | JavaScript, TypeScript, Go, Rust, Java, Kotlin, Swift, PHP, Scala, Dart, C# (11) | Newline-preserving comment strip → declaration regexes → brace-depth block matching. Signatures carry `:start-end` line anchors; 6 languages (Python, JS, TS, Go, Rust, Java) also carry first-sentence doc-comment hints | Exotic declaration syntax the regexes don't cover (see gaps below); no type resolution — signatures are textual |
| **3 — pattern/heuristic** | Everything else — Ruby, C/C++, GDScript, Vue/Svelte SFCs, SQL, GraphQL, Terraform, Protobuf, shell, config formats (YAML/TOML/XML/HTML/CSS/Markdown/properties/Dockerfile), and a generic fallback | Line-oriented pattern matching tuned per format | Anything structurally nested or syntactically unusual; no anchors, no doc hints |

All tiers are **deterministic** (same input → byte-identical output) and zero-dependency at runtime. There is no tree-sitter and no language server — that is a design constraint, not an accident, and it is exactly why the tiers above exist.

## Truncation caps

- **25 signatures per file** — files with more symbols are cut with a `… +N more signatures` notice; the least-informative entries fall off first.
- **8 members per class/impl/interface block** — same notice pattern (`… +N more methods`).

Large god-files are therefore **under-represented by design**: the caps are what keep the whole-repo map inside a model's context window.

## Known regex gaps (Tier 2)

- **Nested parentheses in parameter lists truncate at the first `)`** — `function f(a, b = g(x))` captures `(a, b = g(x` incorrectly. **Fixed for JavaScript and TypeScript** by the shared balanced scanner (`src/extractors/scan.js`, G4 increment 1): params are depth-matched over string/comment-masked text, string defaults (including `)` or `//` inside quotes) survive intact, and TS type annotations strip depth-aware. The remaining Tier-2 languages (Go, Rust, Java, Kotlin, Swift, PHP, Scala, Dart, C#) still truncate — they migrate in later G4 increments, which remain the precondition for the arity-check verifier (D1).
- Multi-line declaration headers that break between the name and the parameter list can be missed entirely.
- Generic/type-parameter soup (deeply nested `<>`) is normalized textually, not parsed.

## What this means for `verify` / `verify_suggestion`

The Hallucination Guard builds its symbol index **from extracted signatures**. A real symbol that fell to the caps or slipped past a Tier-2/3 regex is absent from the index, so verifying code that references it produces a **`fake-symbol` flag at medium confidence** — a conservative false positive, not a silent pass. Mitigations already in place: language/runtime builtin allowlists, closest-match suggestions on every flag, and confidence capped at `medium` for exactly this class of miss. Treat medium-confidence symbol flags on very large files as "check the file" rather than "the AI hallucinated".

Since the balanced scanner (v8.27) made JS/TS params exact, `verify` also runs **arity checks** (`arity-mismatch`, medium confidence) — but only where they can be trusted: uniquely-resolved top-level functions from exact-param languages (JS/TS + Python), non-variadic signatures, undotted calls. Method calls, ambiguous names, `...rest`/`*args` signatures, and every other Tier-2/3 language are deliberately not checked yet.

## Not limitations (frequently asked)

- **Byte-stability** — regenerating on an unchanged repo produces byte-identical output; drift is a bug, not an expectation.
- **Offline** — nothing here calls a network or an LLM.
- **Secret redaction** — signatures, `get_lines` output, evidence packs, and `sigmap redact` all pass through the same 10-pattern scanner; patterns are listed in the [CLI reference](https://sigmap.io/guide/cli#redact).

<sub>Maintained alongside the code — if you find a claim here that the code contradicts, that is a bug: [open an issue](https://github.com/manojmallick/sigmap/issues).</sub>
