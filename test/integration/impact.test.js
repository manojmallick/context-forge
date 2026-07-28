'use strict';

/**
 * Integration tests for v2.5 Impact layer.
 *
 * Tests:
 *  1.  builder: build() returns forward and reverse maps
 *  2.  builder: forward map contains known JS import
 *  3.  builder: reverse map correctly inverts forward map
 *  4.  builder: handles empty file list gracefully
 *  5.  builder: unknown file path does not throw
 *  6.  getImpact: returns correct shape
 *  7.  getImpact: direct importers are correct
 *  8.  getImpact: transitive importers bounded by depth limit
 *  9.  getImpact: unknown file path returns empty arrays
 * 10.  getImpact: circular deps do not infinite-loop
 * 11.  formatImpact: output is non-empty markdown
 * 12.  formatImpactJSON: has all required keys
 * 13.  CLI --impact: exits 0 and prints markdown
 * 14.  CLI --impact --json: valid JSON with correct keys
 * 15.  CLI --impact missing arg: exits 1 with usage message
 * 16.  CLI --impact unknown file: exits 0 with zero-impact message
 * 17.  MCP tools/list: returns 9 tools including get_impact
 * 18.  MCP get_impact: returns string result for known file
 * 19.  MCP get_impact: returns error for missing file arg
 * 20.  analyzeImpact: convenience wrapper returns array
 */

const assert = require('assert');
const path   = require('path');
const { spawnSync } = require('child_process');

const ROOT   = path.resolve(__dirname, '../..');
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function mcpCall(msg) {
  const res = spawnSync(process.execPath, [SCRIPT, '--mcp'], {
    input: JSON.stringify(msg) + '\n',
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
  return res.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Load modules directly
// ---------------------------------------------------------------------------
const { build, buildFromCwd, normalizePath }                        = require(path.join(ROOT, 'src', 'graph', 'builder'));
const { getImpact, analyzeImpact, formatImpact, formatImpactJSON } = require(path.join(ROOT, 'src', 'graph', 'impact'));

console.log('[impact.test.js] v2.5 impact layer');
console.log('');

// Known file used throughout: src/security/scanner.js imports src/security/patterns.js
const SCANNER_ABS  = path.join(ROOT, 'src', 'security', 'scanner.js');
const PATTERNS_ABS = path.join(ROOT, 'src', 'security', 'patterns.js');
const SCANNER_NORM = normalizePath(SCANNER_ABS);
const PATTERNS_NORM = normalizePath(PATTERNS_ABS);

// ---------------------------------------------------------------------------
// builder tests
// ---------------------------------------------------------------------------

test('builder: build() returns forward and reverse maps', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  assert.ok(g.forward instanceof Map, 'forward should be a Map');
  assert.ok(g.reverse instanceof Map, 'reverse should be a Map');
});

test('builder: forward map contains known JS import', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  // scanner.js requires patterns.js — forward[scanner] should include patterns
  const deps = g.forward.get(SCANNER_NORM) || [];
  assert.ok(deps.includes(PATTERNS_NORM), `expected patterns.js in forward deps of scanner.js, got: ${deps}`);
});

test('builder: reverse map correctly inverts forward map', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  // reverse[patterns] should include scanner
  const importers = g.reverse.get(PATTERNS_NORM) || [];
  assert.ok(importers.includes(SCANNER_NORM), `expected scanner.js in reverse of patterns.js, got: ${importers}`);
});

test('builder: handles empty file list gracefully', () => {
  const g = build([], ROOT);
  assert.ok(g.forward instanceof Map, 'should return forward map');
  assert.ok(g.reverse instanceof Map, 'should return reverse map');
  assert.strictEqual(g.forward.size, 0, 'forward map should be empty');
});

test('builder: unknown file path does not throw', () => {
  let threw = false;
  try {
    build(['/nonexistent/file.js'], ROOT);
  } catch (_) {
    threw = true;
  }
  assert.ok(!threw, 'build() must not throw for non-existent files');
});

// ---------------------------------------------------------------------------
// getImpact tests
// ---------------------------------------------------------------------------

test('getImpact: returns correct shape', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  const result = getImpact(PATTERNS_ABS, g, { cwd: ROOT });
  assert.ok('changed'     in result, 'should have changed');
  assert.ok('direct'      in result, 'should have direct');
  assert.ok('transitive'  in result, 'should have transitive');
  assert.ok('tests'       in result, 'should have tests');
  assert.ok('routes'      in result, 'should have routes');
  assert.ok('totalImpact' in result, 'should have totalImpact');
  assert.ok(Array.isArray(result.direct),     'direct should be array');
  assert.ok(Array.isArray(result.transitive), 'transitive should be array');
});

test('getImpact: direct importers are correct', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  const result = getImpact(PATTERNS_ABS, g, { cwd: ROOT });
  const directRels = result.direct;
  const hasScanner = directRels.some((f) => f.includes('scanner'));
  assert.ok(hasScanner, `expected scanner.js in direct importers of patterns.js, got: ${directRels}`);
});

test('getImpact: transitive importers bounded by depth limit', () => {
  // Build a small 3-level chain: a → b → c
  const fs = require('fs');
  const os = require('os');
  const tmp = require('os').tmpdir();
  const dir = path.join(tmp, 'sigmap-impact-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.js'), "const b = require('./b');");
  fs.writeFileSync(path.join(dir, 'b.js'), "const c = require('./c');");
  fs.writeFileSync(path.join(dir, 'c.js'), "module.exports = 42;");

  const files = ['a.js', 'b.js', 'c.js'].map((f) => path.join(dir, f));
  const g = build(files, dir);
  const cAbs = path.join(dir, 'c.js');

  // depth=1 → only b.js should appear in direct; a.js should not appear
  const result1 = getImpact(cAbs, g, { depth: 1, cwd: dir });
  const allImpacted1 = [...result1.direct, ...result1.transitive];
  const hasA1 = allImpacted1.some((f) => f.includes('a.js'));
  assert.ok(!hasA1, `depth=1 should not surface a.js, got: ${allImpacted1}`);

  // depth=0 (unlimited) → both b.js and a.js should appear
  const result0 = getImpact(cAbs, g, { depth: 0, cwd: dir });
  const allImpacted0 = [...result0.direct, ...result0.transitive];
  const hasB0 = allImpacted0.some((f) => f.includes('b.js'));
  const hasA0 = allImpacted0.some((f) => f.includes('a.js'));
  assert.ok(hasB0, `depth=0 should surface b.js, got: ${allImpacted0}`);
  assert.ok(hasA0, `depth=0 should surface a.js, got: ${allImpacted0}`);

  // Cleanup
  fs.rmSync(dir, { recursive: true, force: true });
});

test('getImpact: unknown file path returns empty arrays', () => {
  const g = build([], ROOT);
  const result = getImpact('/totally/nonexistent/file.js', g, { cwd: ROOT });
  assert.deepStrictEqual(result.direct,     [], 'direct should be []');
  assert.deepStrictEqual(result.transitive, [], 'transitive should be []');
  assert.strictEqual(result.totalImpact, 0, 'totalImpact should be 0');
});

test('getImpact: circular deps do not infinite-loop', () => {
  const fs = require('fs');
  const tmp  = require('os').tmpdir();
  const dir = path.join(tmp, 'sigmap-circ-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  // a → b → a (cycle)
  fs.writeFileSync(path.join(dir, 'a.js'), "const b = require('./b');");
  fs.writeFileSync(path.join(dir, 'b.js'), "const a = require('./a');");

  const files = ['a.js', 'b.js'].map((f) => path.join(dir, f));
  const g = build(files, dir);
  const aAbs = path.join(dir, 'a.js');

  let result;
  let threw = false;
  try {
    result = getImpact(aAbs, g, { depth: 0, cwd: dir });
  } catch (_) {
    threw = true;
  }
  assert.ok(!threw, 'getImpact must not throw on circular deps');
  assert.ok(typeof result.totalImpact === 'number', 'totalImpact must be a number');

  // Cleanup
  fs.rmSync(dir, { recursive: true, force: true });
});

test('builder: Python absolute imports are detected', () => {
  const fs = require('fs');
  const tmp  = require('os').tmpdir();
  const dir = path.join(tmp, 'sigmap-py-abs-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'core'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'services'), { recursive: true });

  // core/base.py — no imports
  fs.writeFileSync(path.join(dir, 'core', 'base.py'), 'class Base:\n  pass\n');

  // services/calculator.py — imports from core using absolute import
  fs.writeFileSync(
    path.join(dir, 'services', 'calculator.py'),
    'from core.base import Base\n\nclass Calculator(Base):\n  pass\n'
  );

  const files = [
    path.join(dir, 'core', 'base.py'),
    path.join(dir, 'services', 'calculator.py'),
  ];
  const g = build(files, dir);
  const basePath = path.join(dir, 'core', 'base.py');
  const calcPath = path.join(dir, 'services', 'calculator.py');

  // base.py is imported by calculator.py (via absolute import from core.base)
  const basePathNorm = normalizePath(basePath);
  const calcPathNorm = normalizePath(calcPath);
  const reverseOfBase = g.reverse.get(basePathNorm) || [];
  assert.ok(
    reverseOfBase.includes(calcPathNorm),
    `expected calculator.py in reverse of base.py (absolute import), got: ${reverseOfBase}`
  );

  // Cleanup
  fs.rmSync(dir, { recursive: true, force: true });
});

test('builder: normalizes paths for case-insensitive Windows lookups', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  // All keys in forward map should be lowercase for Windows compatibility
  for (const key of g.forward.keys()) {
    assert.ok(key === key.toLowerCase(), `path "${key}" should be lowercase`);
  }
  for (const key of g.reverse.keys()) {
    assert.ok(key === key.toLowerCase(), `path "${key}" should be lowercase`);
  }
});

test('getImpact: works with normalized paths on case-sensitive systems', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  // getImpact should normalize the input path and find the entry in the graph
  const result = getImpact(PATTERNS_ABS, g, { cwd: ROOT });
  assert.ok(result.direct.length > 0, 'should find direct importers');
  const hasScanner = result.direct.some((f) => f.includes('scanner'));
  assert.ok(hasScanner, `expected scanner.js in direct importers, got: ${result.direct}`);
});

// ---------------------------------------------------------------------------
// format helpers
// ---------------------------------------------------------------------------

test('formatImpact: output is non-empty markdown', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  const result = getImpact(PATTERNS_ABS, g, { cwd: ROOT });
  const md = formatImpact(result);
  assert.ok(typeof md === 'string',   'should return string');
  assert.ok(md.length > 0,            'should be non-empty');
  assert.ok(md.includes('## Impact'), 'should have Impact header');
});

test('formatImpactJSON: has all required keys', () => {
  const g = build([SCANNER_ABS, PATTERNS_ABS], ROOT);
  const result = getImpact(PATTERNS_ABS, g, { cwd: ROOT });
  const json = formatImpactJSON(result);
  for (const key of ['changed', 'direct', 'transitive', 'tests', 'routes', 'totalImpact']) {
    assert.ok(key in json, `JSON should have key: ${key}`);
  }
  assert.ok(Array.isArray(json.direct),     'direct should be array');
  assert.ok(Array.isArray(json.transitive), 'transitive should be array');
  assert.ok(typeof json.totalImpact === 'number', 'totalImpact should be number');
});

// ---------------------------------------------------------------------------
// CLI tests
// ---------------------------------------------------------------------------

test('CLI --impact: exits 0 and prints markdown', () => {
  const res = run('--impact', 'src/security/patterns.js');
  assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
  assert.ok(res.stdout.includes('## Impact'), `expected Impact header in output, got: ${res.stdout.slice(0, 200)}`);
});

test('CLI --impact --json: valid JSON with correct keys', () => {
  const res = run('--impact', 'src/security/patterns.js', '--json');
  assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
  let data;
  try {
    data = JSON.parse(res.stdout.trim());
  } catch (e) {
    assert.fail(`expected valid JSON, got: ${res.stdout.slice(0, 300)}`);
  }
  for (const key of ['changed', 'direct', 'transitive', 'tests', 'routes', 'totalImpact']) {
    assert.ok(key in data, `JSON should have key: ${key}`);
  }
});

test('CLI --impact missing arg: exits 1 with usage message', () => {
  const res = run('--impact');
  assert.strictEqual(res.status, 1, `expected exit 1, got ${res.status}`);
  const combined = res.stdout + res.stderr;
  assert.ok(combined.includes('--impact') || combined.includes('file'), `expected usage hint, got: ${combined.slice(0, 200)}`);
});

test('CLI --impact unknown file: exits 0 with zero-impact message or valid output', () => {
  const res = run('--impact', 'totally/nonexistent/file.js');
  // Should exit 0 — never crash for unknown files
  assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
});

// ---------------------------------------------------------------------------
// MCP tests
// ---------------------------------------------------------------------------

test('MCP tools/list: returns 21 tools including get_impact', () => {
  const msgs = mcpCall({ jsonrpc: '2.0', method: 'tools/list', id: 1 });
  assert.ok(msgs.length > 0, 'should get at least one response');
  const res = msgs[0];
  assert.ok(res.result && Array.isArray(res.result.tools), 'should have tools array');
  const names = res.result.tools.map((t) => t.name);
  assert.ok(names.includes('get_impact'), `expected get_impact in tools, got: ${names}`);
  assert.strictEqual(names.length, 21, `expected 21 tools, got ${names.length}: ${names}`);
});

test('MCP get_impact: returns string result for known file', () => {
  const msgs = mcpCall({
    jsonrpc: '2.0', method: 'tools/call', id: 2,
    params: { name: 'get_impact', arguments: { file: 'src/security/patterns.js' } },
  });
  assert.ok(msgs.length > 0, 'should get response');
  const res = msgs[0];
  assert.ok(res.result, 'should have result');
  const text = res.result.content[0].text;
  assert.ok(typeof text === 'string', 'text should be string');
  assert.ok(text.length > 0, 'text should be non-empty');
});

test('MCP get_impact: returns error for missing file arg', () => {
  const msgs = mcpCall({
    jsonrpc: '2.0', method: 'tools/call', id: 3,
    params: { name: 'get_impact', arguments: {} },
  });
  assert.ok(msgs.length > 0, 'should get response');
  const res = msgs[0];
  assert.ok(res.result, 'should have result');
  const text = res.result.content[0].text;
  assert.ok(
    text.toLowerCase().includes('missing') || text.toLowerCase().includes('required'),
    `expected error message, got: ${text}`
  );
});

// ---------------------------------------------------------------------------
// analyzeImpact convenience wrapper
// ---------------------------------------------------------------------------

test('analyzeImpact: convenience wrapper returns array', () => {
  const results = analyzeImpact('src/security/patterns.js', ROOT, { depth: 2 });
  assert.ok(Array.isArray(results), 'should return array');
  assert.strictEqual(results.length, 1, 'should have one result for one file');
  assert.ok('file'   in results[0], 'each result should have file');
  assert.ok('impact' in results[0], 'each result should have impact');
});

// ---------------------------------------------------------------------------
// Windows path normalization (case-insensitive lookup)
// ---------------------------------------------------------------------------

test('builder: normalizes paths for case-insensitive Windows lookups', () => {
  const { build } = require(SCRIPT.replace('gen-context.js', 'src/graph/builder.js'));
  const files = [
    path.resolve(ROOT, 'src/security/patterns.js'),
    path.resolve(ROOT, 'src/security/env.js'),
  ];
  const graph = build(files, ROOT);
  assert.ok(graph.forward instanceof Map, 'forward should be Map');
  assert.ok(graph.reverse instanceof Map, 'reverse should be Map');
  // Check that all keys are lowercase (for case-insensitive comparison)
  for (const key of graph.forward.keys()) {
    assert.strictEqual(key, key.toLowerCase(), `path "${key}" should be lowercase`);
  }
});

test('getImpact: works with normalized paths on case-sensitive systems', () => {
  const results = analyzeImpact('src/security/patterns.js', ROOT, { depth: 2 });
  assert.strictEqual(results.length, 1, 'should return one result');
  const impact = results[0].impact;
  // This test verifies that path lookup works even if there were case differences
  assert.ok('totalImpact' in impact, 'impact should have totalImpact');
  assert.ok(typeof impact.totalImpact === 'number', 'totalImpact should be number');
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
console.log('');
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
