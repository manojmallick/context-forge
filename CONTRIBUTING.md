# Contributing to SigMap

## Adding a language extractor

1. Create `src/extractors/{language}.js` following the contract below
2. Create `test/fixtures/{language}.{ext}` with representative code
3. Run `node test/run.js --update {language}` to generate expected output
4. Review the expected output — it should contain only signatures, no bodies
5. Run `node test/run.js` — must be 21/21 PASS before opening a PR
6. Run `node test/integration/all.js` — 17/17 integration suites must pass

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

## Running tests

```bash
node test/run.js              # all languages
node test/run.js typescript   # one language
node test/run.js --update     # regenerate all expected outputs
```
