'use strict';

/**
 * Hallucination Guard — deterministic core (Reliable MVP, v6.15.0).
 *
 * Given the text of an AI answer, flag claims that do not match the repo:
 *   - fake-file      : a referenced path is not on disk
 *   - fake-test-file : a referenced *test* path is not on disk (sub-type)
 *   - fake-import    : a relative import does not resolve; a bare import is
 *                      absent from package.json deps (builtins allow-listed)
 *   - fake-symbol    : a called function/class is absent from the symbol index
 *   - fake-npm-script: `npm run X` where X is not a package.json script
 *
 * Each issue carries a `confidence` (detection certainty) and, where a near
 * match exists, a heuristic `suggestion` ("Did you mean …?"). No network, no
 * LLM. Reuses SigMap primitives (buildSigIndex) but every external dependency
 * is injectable via `opts` so the core stays unit-testable.
 */

const fs = require('fs');
const path = require('path');
const parsers = require('./parsers');
const { closestMatch, buildSymbolCandidates, formatSuggestion } = require('./closest-match');
const { buildLibraryIndex } = require('./lib-index');
const { buildArityIndex, extractCallArgCounts, checkArity } = require('./arity');

// A path that looks like a test file (JS/TS spec/test, Python test_/_test, or
// a tests/__tests__ directory). Used to flag fake-test-file separately.
const TEST_PATH_RE = /(?:\.(?:test|spec)\.[mc]?[jt]sx?$)|(?:(?:^|\/)__tests__\/)|(?:(?:^|\/)test_[^/]+\.py$)|(?:_test\.py$)|(?:(?:^|\/)tests?\/)/i;
function isTestPath(p) { return TEST_PATH_RE.test(p); }

const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'util', 'events', 'stream', 'http', 'https', 'crypto',
  'child_process', 'url', 'querystring', 'assert', 'zlib', 'readline', 'net',
  'tls', 'dns', 'buffer', 'process', 'vm', 'module', 'console', 'timers',
  'string_decoder', 'perf_hooks', 'worker_threads', 'cluster', 'dgram', 'v8',
  'tty', 'repl', 'async_hooks', 'inspector', 'fs/promises', 'path/posix',
]);

const PY_BUILTINS = new Set([
  'os', 'sys', 're', 'json', 'math', 'typing', 'collections', 'itertools',
  'functools', 'datetime', 'pathlib', 'subprocess', 'abc', 'dataclasses',
  'enum', 'io', 'time', 'random', 'logging', 'argparse', 'unittest', 'asyncio',
  'copy', 'hashlib', 'threading', 'string', 'csv', 'glob', 'shutil', 'tempfile',
]);

const LANG_GLOBALS = new Set([
  // JS
  'console', 'require', 'module', 'exports', 'process', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'Promise', 'Map',
  'Set', 'WeakMap', 'WeakSet', 'RegExp', 'Error', 'Symbol', 'parseInt',
  'parseFloat', 'isNaN', 'setTimeout', 'setInterval', 'clearTimeout', 'fetch',
  'Buffer', 'Function', 'eval', 'encodeURIComponent', 'decodeURIComponent',
  // Python
  'print', 'len', 'range', 'str', 'int', 'float', 'dict', 'list', 'tuple',
  'set', 'bool', 'open', 'enumerate', 'zip', 'map', 'filter', 'sorted',
  'sum', 'min', 'max', 'abs', 'isinstance', 'super', 'type', 'getattr',
  'setattr', 'hasattr',
]);

const REL_EXTS = ['', '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.json', '.py', '.r', '.R', '.vue'];
const REL_INDEX = ['index.js', 'index.ts', 'index.tsx', 'index.jsx', '__init__.py'];

// Obvious documentation-placeholder imports the model writes in illustrative
// snippets — not real dependency claims. e.g. @scope/utils, some-module, ./local-file.
const PLACEHOLDER_IMPORT_RE = new RegExp([
  '^@(?:scope|org|your-org|my-org|company|example)(?:/|$)', // @scope/utils
  '(?:^|/)(?:some|your|my)-(?:module|package|lib|component|file|dep)(?:$|/)', // some-module
  '(?:^|/)(?:local-file|your-file|my-file|module-name|package-name|your-package|example-package)(?:$|/)',
  '(?:^|/)path/to/', // ./path/to/x
].join('|'), 'i');

/**
 * Build the set of known symbol identifiers from the SigMap signature index,
 * plus `{ name, file, line }` candidates (for closest-match suggestions).
 */
function buildSymbolSet(cwd) {
  const set = new Set();
  let fileKeys = [];
  let symbolCandidates = [];
  let sigIndex = null;
  try {
    const { buildSigIndex } = require('../retrieval/ranker');
    const idx = buildSigIndex(cwd);
    sigIndex = idx;
    fileKeys = [...idx.keys()];
    for (const sigs of idx.values()) {
      for (const sig of sigs) {
        const cleaned = String(sig).replace(/\s*:\d+(?:-\d+)?\s*$/, '');
        const ids = cleaned.match(/[A-Za-z_$][\w$]*/g) || [];
        for (const id of ids) set.add(id);
      }
    }
    symbolCandidates = buildSymbolCandidates(idx);
  } catch (_) {}
  return { set, fileKeys, symbolCandidates, sigIndex };
}

/** Load declared dependency names from package.json. */
function loadDeps(cwd) {
  const deps = new Set();
  let hasPkg = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    hasPkg = true;
    for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      if (pkg[k] && typeof pkg[k] === 'object') {
        for (const name of Object.keys(pkg[k])) deps.add(name);
      }
    }
  } catch (_) {}
  return { deps, hasPkg };
}

/** Load the set of npm script names declared in package.json. */
function loadScripts(cwd) {
  const scripts = new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      for (const name of Object.keys(pkg.scripts)) scripts.add(name);
    }
  } catch (_) {}
  return scripts;
}

/** Default file-existence check: resolve a referenced path against cwd. */
function defaultFileExists(cwd, ref) {
  const clean = ref.replace(/^\.\//, '');
  for (const c of [path.resolve(cwd, clean), path.resolve(cwd, ref)]) {
    try {
      if (fs.existsSync(c)) return true;
    } catch (_) {}
  }
  return false;
}

/** Default relative-import resolver: fs candidates + basename match in index. */
function defaultRelativeResolvable(cwd, mod, fileBasenames) {
  const base = path.resolve(cwd, mod);
  for (const e of REL_EXTS) {
    try {
      if (fs.existsSync(base + e)) return true;
    } catch (_) {}
  }
  for (const idx of REL_INDEX) {
    try {
      if (fs.existsSync(path.join(base, idx))) return true;
    } catch (_) {}
  }
  // Fall back to basename match against the indexed file set (the answer's
  // import is relative to a file we cannot know, so a name match is enough
  // to avoid false positives).
  const wantBase = path.basename(mod).replace(/\.[^.]+$/, '').toLowerCase();
  return fileBasenames.has(wantBase);
}

/**
 * Verify an AI answer against the repository.
 *
 * Each issue has the shape:
 *   { type, value, line, location, message, confidence, suggestion }
 * where `confidence` is the *detection* certainty ('high' for path/dep/script
 * checks, 'medium' for symbol checks) and `suggestion` is a heuristic
 * closest-match hint (or null).
 *
 * @param {string} answerText
 * @param {string} cwd
 * @param {object} [opts]
 * @param {Set<string>} [opts.symbolSet]      override known symbols
 * @param {Array}       [opts.symbolCandidates] override { name, file, line } list
 * @param {Array<string>} [opts.fileCandidates]  override repo file paths (suggestions)
 * @param {Set<string>} [opts.deps]           override package deps
 * @param {Set<string>} [opts.scripts]        override package.json script names
 * @param {boolean}     [opts.hasPkg]         whether a package.json exists
 * @param {(ref: string) => boolean} [opts.fileExists]          override file check
 * @param {(mod: string) => boolean} [opts.relativeResolvable]  override rel-import check
 * @returns {{ issues: object[], summary: object }}
 */
function verify(answerText, cwd, opts = {}) {
  let symbolSet = opts.symbolSet;
  let fileBasenames = opts.fileBasenames;
  let symbolCandidates = opts.symbolCandidates || [];
  let fileCandidates = opts.fileCandidates || [];
  let arityIndex = opts.arityIndex || null;
  if (!symbolSet) {
    const built = buildSymbolSet(cwd);
    symbolSet = built.set;
    fileBasenames = new Set(built.fileKeys.map(
      (k) => path.basename(k).replace(/\.[^.]+$/, '').toLowerCase()
    ));
    symbolCandidates = built.symbolCandidates;
    fileCandidates = built.fileKeys;
    if (!arityIndex && built.sigIndex) {
      try { arityIndex = buildArityIndex(built.sigIndex); } catch (_) {}
    }
  }
  if (!fileBasenames) fileBasenames = new Set();

  // Installed-library grounding (G5/D5, the moat): union the exported symbols of
  // the libraries actually installed in node_modules, so genuine library calls
  // stop false-flagging as fake-symbol and the summary can pin the versions the
  // answer was verified against. Auto-runs only when the caller did not override
  // the symbol set (keeps hermetic callers unchanged); disable with libIndex:false.
  let libraries = opts.libraries || [];
  {
    let libSyms = opts.libSymbols;
    if (!libSyms && opts.libIndex !== false && !opts.symbolSet) {
      try {
        const li = buildLibraryIndex(cwd, { version: opts.version });
        libSyms = li.symbols;
        if (!opts.libraries) libraries = li.libraries;
      } catch (_) { libSyms = null; }
    }
    if (libSyms && libSyms.size) {
      const merged = new Set(symbolSet);
      for (const s of libSyms) merged.add(s);
      symbolSet = merged;
    }
  }

  let deps = opts.deps;
  let hasPkg = opts.hasPkg;
  if (!deps) {
    const loaded = loadDeps(cwd);
    deps = loaded.deps;
    if (hasPkg === undefined) hasPkg = loaded.hasPkg;
  }
  const scripts = opts.scripts || (hasPkg ? loadScripts(cwd) : new Set());

  const fileExists = opts.fileExists || ((ref) => defaultFileExists(cwd, ref));
  const relativeResolvable = opts.relativeResolvable
    || ((mod) => defaultRelativeResolvable(cwd, mod, fileBasenames));

  // Pre-derive basename candidates for file suggestions (compare on basename so
  // a wrong directory still surfaces the right file).
  const fileBasenameCandidates = fileCandidates.map((f) => ({ name: path.basename(f), file: f }));

  const issues = [];
  const dedupe = new Set();
  const add = (issue) => {
    const key = `${issue.type}::${issue.value}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);
    if (!('suggestion' in issue)) issue.suggestion = null;
    issue.location = `L${issue.line}`;
    issues.push(issue);
  };

  // 1. fake-file / fake-test-file
  for (const { path: p, line } of parsers.extractFilePaths(answerText)) {
    if (fileExists(p)) continue;
    const isTest = isTestPath(p);
    const match = closestMatch(path.basename(p), fileBasenameCandidates, { minLen: 4 });
    add({
      type: isTest ? 'fake-test-file' : 'fake-file',
      value: p,
      line,
      message: `${isTest ? 'Test file' : 'File'} not found on disk: ${p}`,
      confidence: 'high',
      suggestion: match ? formatSuggestion(match, false) : null,
    });
  }

  // 2. fake-import
  for (const imp of parsers.extractImports(answerText)) {
    if (PLACEHOLDER_IMPORT_RE.test(imp.module)) continue;
    if (imp.relative) {
      if (!relativeResolvable(imp.module)) {
        add({ type: 'fake-import', value: imp.module, line: imp.line, message: `Import does not resolve: ${imp.module}`, confidence: 'high' });
      }
      continue;
    }
    // Bare module — only verifiable for JS when a package.json exists.
    const top = imp.module.split('/')[0];
    if (imp.kind === 'js') {
      if (!hasPkg) continue;
      if (NODE_BUILTINS.has(imp.module) || NODE_BUILTINS.has(top)) continue;
      if (top.startsWith('@')) {
        const scoped = imp.module.split('/').slice(0, 2).join('/');
        if (deps.has(scoped) || deps.has(imp.module)) continue;
      } else if (deps.has(top) || deps.has(imp.module)) {
        continue;
      }
      const match = closestMatch(top, [...deps], { minLen: 3 });
      add({
        type: 'fake-import',
        value: imp.module,
        line: imp.line,
        message: `Package not in dependencies: ${imp.module}`,
        confidence: 'high',
        suggestion: match ? formatSuggestion({ name: match.name }, false) : null,
      });
    }
    // Python bare imports: stdlib is unbounded offline — skip to keep precision.
  }

  // 3. fake-symbol
  if (symbolSet.size > 0) {
    for (const { name, line } of parsers.extractSymbols(answerText)) {
      if (symbolSet.has(name)) continue;
      if (LANG_GLOBALS.has(name) || NODE_BUILTINS.has(name) || PY_BUILTINS.has(name)) continue;
      const match = closestMatch(name, symbolCandidates, { minLen: 4 });
      add({
        type: 'fake-symbol',
        value: name,
        line,
        message: `Symbol not found in repo index: ${name}()`,
        confidence: 'medium',
        suggestion: match ? formatSuggestion(match, true) : null,
      });
    }
  }

  // 3b. arity-mismatch (D1, #529) — a call to a KNOWN repo function whose
  // argument count falls outside the signature's [min, max]. Conservative by
  // construction: only uniquely-resolved, top-level functions from
  // exact-param languages (JS/TS via the balanced scanner, Python via AST);
  // variadic signatures only flag too-few; dotted calls never flag.
  if (arityIndex && arityIndex.size > 0) {
    for (const block of parsers.extractCodeBlocks(answerText)) {
      if (block.lang && !/^(js|jsx|ts|tsx|javascript|typescript|python|py)$/i.test(block.lang)) continue;
      for (const call of extractCallArgCounts(block.content)) {
        if (!symbolSet.has(call.name)) continue; // unknown symbols stay fake-symbol territory
        const entry = checkArity(call.name, call.args, arityIndex);
        if (!entry) continue;
        const range = entry.variadic ? `at least ${entry.min}`
          : (entry.min === entry.max ? String(entry.max) : `${entry.min}–${entry.max}`);
        add({
          type: 'arity-mismatch',
          value: `${call.name}(${call.args} args)`,
          line: block.line + call.line - 1,
          message: `${call.name}() called with ${call.args} argument(s) — repo signature takes ${range}`,
          confidence: 'medium',
          suggestion: `${entry.sig}  (${entry.file})`,
        });
      }
    }
  }

  // 4. fake-npm-script
  if (hasPkg && scripts.size > 0) {
    for (const { name, line } of parsers.extractNpmScripts(answerText)) {
      if (scripts.has(name)) continue;
      const match = closestMatch(name, [...scripts], { minLen: 2 });
      add({
        type: 'fake-npm-script',
        value: name,
        line,
        message: `npm script not in package.json: ${name}`,
        confidence: 'high',
        suggestion: match ? formatSuggestion({ name: match.name }, false) : null,
      });
    }
  }

  issues.sort((a, b) => a.line - b.line);

  const byType = {
    'fake-file': 0, 'fake-test-file': 0, 'fake-import': 0,
    'fake-symbol': 0, 'fake-npm-script': 0,
  };
  for (const i of issues) byType[i.type] = (byType[i.type] || 0) + 1;

  const summary = {
    total: issues.length,
    byType,
    clean: issues.length === 0,
    symbolsIndexed: symbolSet.size,
    withSuggestion: issues.filter((i) => i.suggestion).length,
    librariesIndexed: libraries.length,
    libraries: libraries.map((l) => ({ name: l.name, version: l.version, symbols: l.symbols, typed: l.typed })),
  };

  return { issues, summary };
}

module.exports = { verify, buildSymbolSet, loadDeps, loadScripts, isTestPath };
