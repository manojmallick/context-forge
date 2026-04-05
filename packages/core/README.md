# sigmap-core

Programmatic API for [SigMap](https://manojmallick.github.io/sigmap/) — zero-dependency code signature extraction, ranked retrieval, secret scanning, and project health scoring.

## Installation

```bash
npm install sigmap        # installs the full package (CLI + core)
```

`require('sigmap')` resolves to this library via the root `exports` field.

## Quick start

```js
const { extract, rank, buildSigIndex, scan, score } = require('sigmap');

// 1. Extract signatures from any source file
const sigs = extract('function hello() { return "world"; }', 'javascript');
// → ['function hello()']

// 2. Scan for secrets before storing signatures
const { safe, redacted } = scan(sigs, 'src/utils.js');

// 3. Build an index from the generated context file
const index = buildSigIndex('/path/to/your/project');

// 4. Rank files against a query
const results = rank('add a new language extractor', index, { topK: 5 });
// → [{ file: 'src/extractors/python.js', score: 3.5, sigs: [...], tokens: 42 }, ...]

// 5. Check project health
const health = score('/path/to/your/project');
// → { score: 92, grade: 'A', strategy: 'full', ... }
```

## API reference

### `extract(src, language)` → `string[]`

Extract code signatures from source text.

| Param | Type | Description |
|---|---|---|
| `src` | `string` | Raw file content |
| `language` | `string` | Language name (`'typescript'`, `'python'`, etc.) **or** a file path/name with a recognised extension |

Returns an array of signature strings. Never throws — returns `[]` on any error.

**Supported languages:** typescript, javascript, python, java, kotlin, go, rust, csharp, cpp, ruby, php, swift, dart, scala, vue, svelte, html, css, yaml, shell, dockerfile (21 total)

```js
// By language name
extract(src, 'python');

// By file path (extension is used to detect language)
extract(src, 'src/server.ts');
extract(src, 'Dockerfile');
```

---

### `rank(query, sigIndex, opts?)` → `Result[]`

Rank all files in a signature index against a natural-language query.

| Param | Type | Description |
|---|---|---|
| `query` | `string` | Natural language or keyword query |
| `sigIndex` | `Map<string, string[]>` | File → signatures map (from `buildSigIndex`) |
| `opts.topK` | `number` | Max files to return (default: `10`) |
| `opts.weights` | `object` | Override default scoring weights |
| `opts.recencySet` | `Set<string>` | Files to boost with `recencyBoost` multiplier |

Each result: `{ file: string, score: number, sigs: string[], tokens: number }`

---

### `buildSigIndex(cwd)` → `Map<string, string[]>`

Build a file→signatures map from the generated `.github/copilot-instructions.md`.
Requires `node gen-context.js` to have been run first.

```js
const index = buildSigIndex('/path/to/project');
// → Map { 'src/extractors/python.js' => ['class Extractor', '  def extract(src)'], ... }
```

---

### `scan(sigs, filePath)` → `{ safe: string[], redacted: boolean }`

Scan signature strings for secrets (AWS keys, GitHub tokens, DB connection strings, etc.) and redact any matches.

```js
const { safe, redacted } = scan(
  ['const SECRET = "ghp_abc123xyz..."'],
  'src/config.ts'
);
// safe → ['[REDACTED — GitHub Token detected in src/config.ts]']
// redacted → true
```

**Detected patterns:** AWS Access Key, AWS Secret Key, GCP API Key, GitHub Token, JWT Token, DB Connection String, SSH Private Key, Stripe Key, Twilio Key, Generic Secret

---

### `score(cwd)` → `HealthResult`

Compute a composite health score for the SigMap installation in a project.

```js
const health = score('/path/to/project');
// {
//   score: 92,
//   grade: 'A',           // A ≥90 | B ≥75 | C ≥60 | D <60
//   strategy: 'full',
//   tokenReductionPct: 97.2,
//   daysSinceRegen: 0.1,
//   totalRuns: 48,
//   overBudgetRuns: 0,
// }
```

## Migration from v2.3 and earlier

`require('sigmap')` was not available before v2.4. The programmatic API is new — no migration needed for CLI usage.

All existing CLI flags (`--generate`, `--watch`, `--mcp`, `--query`, `--analyze`, `--benchmark`, `--health`, …) are unchanged.

## What's next — v2.10

v2.10 adds reporting charts and advanced metrics for benchmark visibility. This milestone focuses on chart-ready report output, precision@K/recall@K/MRR trends, and CI-friendly metrics artifacts. See [issue #25](https://github.com/manojmallick/sigmap/issues/25).

See the full [roadmap](https://manojmallick.github.io/sigmap/roadmap.html).

## Zero dependencies

This package has zero runtime npm dependencies. It uses only Node.js built-ins: `fs`, `path`.
