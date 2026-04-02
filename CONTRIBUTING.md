# Contributing to ContextForge

## Adding a language extractor

1. Create `src/extractors/{language}.js` following the contract below
2. Create `test/fixtures/{language}.{ext}` with representative code
3. Run `node test/run.js --update {language}` to generate expected output
4. Review the expected output — it should contain only signatures, no bodies
5. Run `node test/run.js` — must be 177/177 PASS (21 extractor + 156 integration) before opening a PR

## Extractor contract

```javascript
'use strict';

function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];
  // ... regex extraction only — no npm packages ...
  return sigs.slice(0, 25);
}

module.exports = { extract };
```

Rules:
- Never throw — return `[]` on any error
- Never exceed 25 signatures per file
- Strip all bodies — nothing after opening `{`
- Strip all comments
- Indent methods 2 spaces inside their class/struct
- Return `[]` for empty or unparseable input
- Use only Node.js built-ins (`fs`, `path`, etc.) — no npm packages

## Commit format

```
type(scope): short description (under 72 chars)

Types: feat / fix / docs / test / chore / refactor / perf
Scopes: core / extractor / mcp / security / config / map / ci / docs / test
```

## Adding an integration test

1. Create `test/integration/<area>.test.js` following the existing test files.
2. Use only Node.js built-ins — no Jest, no Mocha, no external test frameworks.
3. Export a `run()` function that returns `{ passed, failed, total }`.
4. Register it in `test/run.js` by requiring it in the integration suite array.
5. Run `node test/run.js` — the new suite appears in the count.

## Bundling

The repository ships two forms of the main entry point:

- `src/` — modular source files (edit these)
- `gen-context.js` — standalone bundle (generated; checked in for zero-install use)

After changing anything in `src/`:

```bash
node scripts/bundle.js
# Writes gen-context.js (overwrites)
# Prints: lines, KB, modules inlined
```

`scripts/bundle.js` works by:

1. Collecting every `.js` file under `src/` and assigning each a canonical key
   (e.g. `./src/config/loader`).
2. Rewriting internal `require('./...')` calls to `__require('./src/...')`.
3. Wrapping each module in a factory function stored in `__factories`.
4. Prepending a tiny `__require` loader that evaluates factories on first call
   and caches exports — behaviorally identical to Node's module system.
5. Appending the main entry with its requires patched to the same loader.

**Never edit `gen-context.js` directly.** Changes there will be overwritten the
next time `scripts/bundle.js` runs. The `src/` tree is the source of truth.

## Running tests

```bash
node test/run.js              # all languages
node test/run.js typescript   # one language
node test/run.js --update     # regenerate all expected outputs
```
