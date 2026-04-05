'use strict';

/**
 * Integration tests for v2.4 — packages/core + packages/cli refactor.
 *
 * Tests:
 *  1.  require('sigmap') exports extract, rank, buildSigIndex, scan, score
 *  2.  extract(src, 'javascript') returns array of strings
 *  3.  extract(src, 'typescript') returns array of strings
 *  4.  extract(src, 'python') returns array of strings
 *  5.  extract with file path (extension detection) works
 *  6.  extract with unknown language returns []
 *  7.  extract never throws on malformed input
 *  8.  rank(query, emptyMap) returns []
 *  9.  rank returns sorted array with correct shape
 * 10.  scan(sigs, filepath) returns { safe: [], redacted: false } for clean input
 * 11.  scan redacts AWS Access Key pattern
 * 12.  score(cwd) returns object with score and grade
 * 13.  buildSigIndex(cwd) returns a Map
 * 14.  CLI --version still returns 2.4.0 (backward compat)
 * 15.  All existing CLI flags unchanged — --help exits 0 or 1, not crash
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const CORE = path.join(ROOT, 'packages', 'core', 'index.js');
const SCRIPT = path.join(ROOT, 'gen-context.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

console.log('[core-api.test.js] v2.4 packages/core + packages/cli');
console.log('');

// Load the core module
const core = require(CORE);

// ---------------------------------------------------------------------------
// 1. Exports check
// ---------------------------------------------------------------------------
test('packages/core exports extract, rank, buildSigIndex, scan, score', () => {
  assert.strictEqual(typeof core.extract, 'function', 'extract must be a function');
  assert.strictEqual(typeof core.rank, 'function', 'rank must be a function');
  assert.strictEqual(typeof core.buildSigIndex, 'function', 'buildSigIndex must be a function');
  assert.strictEqual(typeof core.scan, 'function', 'scan must be a function');
  assert.strictEqual(typeof core.score, 'function', 'score must be a function');
});

// ---------------------------------------------------------------------------
// 2-4. extract per language
// ---------------------------------------------------------------------------
test('extract(src, "javascript") returns array of strings', () => {
  const src = `
function greet(name) { return 'Hello ' + name; }
const add = (a, b) => a + b;
module.exports = { greet, add };
`;
  const sigs = core.extract(src, 'javascript');
  assert.ok(Array.isArray(sigs), 'must return array');
  assert.ok(sigs.length > 0, 'must return at least one sig');
  assert.ok(sigs.every((s) => typeof s === 'string'), 'all sigs must be strings');
  assert.ok(sigs.some((s) => s.includes('greet')), 'must include greet function');
});

test('extract(src, "typescript") returns array of strings', () => {
  const src = `
export interface Config { debug: boolean; }
export function init(cfg: Config): void {}
export class App { start(): void {} }
`;
  const sigs = core.extract(src, 'typescript');
  assert.ok(Array.isArray(sigs), 'must return array');
  assert.ok(sigs.length > 0, 'must return at least one sig');
  assert.ok(sigs.some((s) => s.includes('Config') || s.includes('init') || s.includes('App')), 'must include named symbols');
});

test('extract(src, "python") returns array of strings', () => {
  const src = `
class Parser:
    def parse(self, text: str) -> list:
        pass

def tokenize(src):
    return src.split()
`;
  const sigs = core.extract(src, 'python');
  assert.ok(Array.isArray(sigs), 'must return array');
  assert.ok(sigs.length > 0, 'must return at least one sig');
  assert.ok(sigs.some((s) => s.includes('Parser') || s.includes('tokenize')), 'must include named symbols');
});

// ---------------------------------------------------------------------------
// 5. File path (extension detection)
// ---------------------------------------------------------------------------
test('extract with file path detects language from extension', () => {
  const src = 'function hello() { return 1; }';
  const sigsFromPath = core.extract(src, 'src/utils.js');
  const sigsFromLang = core.extract(src, 'javascript');
  assert.ok(Array.isArray(sigsFromPath), 'must return array');
  assert.deepStrictEqual(sigsFromPath, sigsFromLang, 'path and lang should produce same result');
});

// ---------------------------------------------------------------------------
// 6. Unknown language
// ---------------------------------------------------------------------------
test('extract with unknown language returns []', () => {
  const sigs = core.extract('some source', 'cobol');
  assert.deepStrictEqual(sigs, []);
});

// ---------------------------------------------------------------------------
// 7. Never throws
// ---------------------------------------------------------------------------
test('extract never throws on malformed / null input', () => {
  assert.doesNotThrow(() => core.extract(null, 'javascript'));
  assert.doesNotThrow(() => core.extract('', 'javascript'));
  assert.doesNotThrow(() => core.extract('###broken###', 'typescript'));
  assert.doesNotThrow(() => core.extract('valid source', null));
});

// ---------------------------------------------------------------------------
// 8. rank with empty map
// ---------------------------------------------------------------------------
test('rank(query, emptyMap) returns []', () => {
  const result = core.rank('some query', new Map());
  assert.deepStrictEqual(result, []);
});

// ---------------------------------------------------------------------------
// 9. rank returns sorted array with correct shape
// ---------------------------------------------------------------------------
test('rank returns sorted array with correct shape', () => {
  const index = new Map([
    ['src/extractors/python.js', ['function extract(src)', 'class Parser']],
    ['src/security/scanner.js', ['function scan(signatures, filePath)', '→ { safe, redacted }']],
    ['src/config/loader.js', ['function loadConfig(cwd)']],
  ]);
  const results = core.rank('python extractor', index, { topK: 3 });
  assert.ok(Array.isArray(results), 'must return array');
  assert.ok(results.length > 0, 'must return results');
  for (const r of results) {
    assert.ok(typeof r.file === 'string', 'each result must have file string');
    assert.ok(typeof r.score === 'number', 'each result must have score number');
    assert.ok(Array.isArray(r.sigs), 'each result must have sigs array');
    assert.ok(typeof r.tokens === 'number', 'each result must have tokens number');
  }
  // Results must be sorted by score descending
  for (let i = 0; i < results.length - 1; i++) {
    assert.ok(results[i].score >= results[i + 1].score, 'results must be sorted by score desc');
  }
  // 'python extractor' query should surface the python extractor file
  assert.ok(
    results[0].file.includes('python'),
    `top result should be python extractor, got: ${results[0].file}`,
  );
});

// ---------------------------------------------------------------------------
// 10. scan — clean input
// ---------------------------------------------------------------------------
test('scan returns { safe, redacted: false } for clean input', () => {
  const sigs = ['function extract(src)', 'class Parser', 'module.exports = { extract }'];
  const result = core.scan(sigs, 'src/extractors/python.js');
  assert.ok(typeof result === 'object', 'must return object');
  assert.ok(Array.isArray(result.safe), 'safe must be array');
  assert.strictEqual(result.redacted, false, 'redacted must be false for clean input');
  assert.deepStrictEqual(result.safe, sigs, 'safe must equal input when no secrets found');
});

// ---------------------------------------------------------------------------
// 11. scan redacts AWS Access Key
// ---------------------------------------------------------------------------
test('scan redacts AWS Access Key pattern', () => {
  const sigs = ['const KEY = "AKIAIOSFODNN7EXAMPLE"', 'function login()'];
  const result = core.scan(sigs, 'src/auth.js');
  assert.strictEqual(result.redacted, true, 'redacted must be true when secret found');
  assert.ok(
    result.safe[0].includes('REDACTED'),
    'secret sig must be replaced with REDACTED marker',
  );
  assert.ok(
    !result.safe[0].includes('AKIAIOSFODNN7EXAMPLE'),
    'raw secret must NOT appear in safe output',
  );
  assert.strictEqual(result.safe[1], 'function login()', 'clean sig must be unchanged');
});

// ---------------------------------------------------------------------------
// 12. score returns object with score and grade
// ---------------------------------------------------------------------------
test('score(cwd) returns object with score and grade', () => {
  const result = core.score(ROOT);
  assert.ok(typeof result === 'object', 'must return object');
  assert.ok(typeof result.score === 'number', 'score must be a number');
  assert.ok(result.score >= 0 && result.score <= 100, 'score must be in [0, 100]');
  assert.ok(['A', 'B', 'C', 'D'].includes(result.grade), 'grade must be A/B/C/D');
  assert.ok(typeof result.strategy === 'string', 'strategy must be a string');
});

// ---------------------------------------------------------------------------
// 13. buildSigIndex returns a Map
// ---------------------------------------------------------------------------
test('buildSigIndex(cwd) returns a Map', () => {
  const index = core.buildSigIndex(ROOT);
  assert.ok(index instanceof Map, 'must return a Map');
  // The index may be empty in CI if copilot-instructions.md not generated — that's okay
  // but all values must be arrays when present
  for (const [key, val] of index.entries()) {
    assert.ok(typeof key === 'string', 'keys must be strings');
    assert.ok(Array.isArray(val), 'values must be arrays');
  }
});

// ---------------------------------------------------------------------------
// 14. CLI --version matches package version
// ---------------------------------------------------------------------------
test('CLI --version matches package version', () => {
  const res = spawnSync('node', [SCRIPT, '--version'], { cwd: ROOT, encoding: 'utf8' });
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(
    res.stdout.includes(pkg.version),
    `expected version ${pkg.version} in output, got: ${res.stdout.trim()}`,
  );
});

// ---------------------------------------------------------------------------
// 15. CLI --help does not crash
// ---------------------------------------------------------------------------
test('CLI --help exits without a crash (exit code 0 or 1)', () => {
  const res = spawnSync('node', [SCRIPT, '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ok(
    res.status === 0 || res.status === 1,
    `--help must exit 0 or 1, got: ${res.status}`,
  );
  assert.ok(!res.error, `--help must not crash: ${res.error}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`[core-api.test.js] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
