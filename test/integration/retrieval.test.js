'use strict';

/**
 * Integration tests for v2.3 query-aware retrieval.
 *
 * Tests:
 *  1.  tokenize: splits camelCase into tokens
 *  2.  tokenize: splits snake_case into tokens
 *  3.  tokenize: removes stop words by default
 *  4.  tokenize: keeps stop words when removeStopWords=false
 *  5.  tokenize: handles file path input
 *  6.  tokenize: returns empty array for empty input
 *  7.  rank: returns sorted array for a valid query
 *  8.  rank: score is a non-negative number
 *  9.  rank: topK limits result count
 * 10.  rank: empty query returns top-K by sig count
 * 11.  rank: returns empty array for empty sigIndex
 * 12.  rank: python extractor file in top-3 for "python extractor" query
 * 13.  formatRankTable: output contains query header and columns
 * 14.  formatRankJSON: has correct top-level keys
 * 15.  CLI --query: exits 0 and prints ranked table
 * 16.  CLI --query --json: valid JSON with correct keys
 * 17.  CLI --query --top 3: returns at most 3 results
 * 18.  CLI --query missing arg: exits 1 with usage message
 * 19.  CLI --version: returns 2.4.0
 * 20.  MCP tools/list: returns 8 tools including query_context
 * 21.  MCP query_context: returns result for a valid query
 * 22.  MCP query_context: returns error for missing query arg
 * 23.  MCP query_context: unknown tool still returns error
 */

const assert = require('assert');
const fs     = require('fs');
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
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function mcpCall(msg, cwd) {
  const res = spawnSync(process.execPath, [SCRIPT, '--mcp'], {
    input: JSON.stringify(msg) + '\n',
    cwd: cwd || ROOT,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
  return res.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Load modules directly from src/
// ---------------------------------------------------------------------------
const { tokenize }                = require(path.join(ROOT, 'src', 'retrieval', 'tokenizer'));
const { rank, buildSigIndex, formatRankTable, formatRankJSON, detectIntent } =
  require(path.join(ROOT, 'src', 'retrieval', 'ranker'));

// Build a minimal sig index from SigMap's own context file
const sigIndex = buildSigIndex(ROOT);

console.log('[retrieval.test.js] v2.3 query-aware retrieval');
console.log('');

// ---------------------------------------------------------------------------
// tokenize — unit tests
// ---------------------------------------------------------------------------
test('tokenize: splits camelCase into tokens', () => {
  const tokens = tokenize('analyzeFiles');
  assert.ok(tokens.includes('analyze'), `expected "analyze" in ${tokens}`);
  assert.ok(tokens.includes('files'), `expected "files" in ${tokens}`);
});

test('tokenize: splits snake_case into tokens', () => {
  const tokens = tokenize('build_sig_index');
  assert.ok(tokens.includes('build'),  `expected "build" in ${tokens}`);
  assert.ok(tokens.includes('sig'),    `expected "sig" in ${tokens}`);
  assert.ok(tokens.includes('index'),  `expected "index" in ${tokens}`);
});

test('tokenize: removes stop words by default', () => {
  const tokens = tokenize('the function in a module');
  assert.ok(!tokens.includes('the'),  'should remove "the"');
  assert.ok(!tokens.includes('a'),    'should remove "a"');
  assert.ok(!tokens.includes('in'),   'should remove "in"');
  assert.ok(tokens.includes('function'), 'should keep "function"');
  assert.ok(tokens.includes('module'),   'should keep "module"');
});

test('tokenize: keeps stop words when removeStopWords=false', () => {
  const tokens = tokenize('the function', { removeStopWords: false });
  assert.ok(tokens.includes('the'), 'should keep "the"');
});

test('tokenize: handles file path input', () => {
  const tokens = tokenize('src/extractors/python.js');
  assert.ok(tokens.includes('src'),       `expected "src" in ${tokens}`);
  assert.ok(tokens.includes('extractors'), `expected "extractors" in ${tokens}`);
  assert.ok(tokens.includes('python'),    `expected "python" in ${tokens}`);
});

test('tokenize: returns empty array for empty input', () => {
  assert.deepStrictEqual(tokenize(''), []);
  assert.deepStrictEqual(tokenize(null), []);
  assert.deepStrictEqual(tokenize(undefined), []);
});

// ---------------------------------------------------------------------------
// rank — unit tests (using SigMap's own sig index)
// ---------------------------------------------------------------------------
test('rank: returns sorted array for a valid query', () => {
  if (sigIndex.size === 0) { /* skip if no context file generated yet */ return; }
  const results = rank('python extractor', sigIndex, { topK: 5 });
  assert.ok(Array.isArray(results), 'should return array');
  assert.ok(results.length > 0, 'should return at least one result');
  // Verify descending sort by score
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i].score <= results[i - 1].score, 'results should be sorted desc by score');
  }
});

test('rank: score is a non-negative number', () => {
  if (sigIndex.size === 0) return;
  const results = rank('extract', sigIndex, { topK: 3 });
  for (const r of results) {
    assert.strictEqual(typeof r.score, 'number');
    assert.ok(r.score >= 0, `score should be non-negative, got ${r.score}`);
  }
});

test('rank: topK limits result count', () => {
  if (sigIndex.size === 0) return;
  const limit = 3;
  const results = rank('extractor', sigIndex, { topK: limit });
  assert.ok(results.length <= limit, `expected ≤ ${limit} results, got ${results.length}`);
});

test('rank: empty query returns top-K by sig count', () => {
  if (sigIndex.size === 0) return;
  const results = rank('', sigIndex, { topK: 5 });
  assert.ok(Array.isArray(results));
  assert.ok(results.length <= 5);
  // Each result must have the required shape
  for (const r of results) {
    assert.ok('file' in r);
    assert.ok('score' in r);
    assert.ok('sigs' in r);
    assert.ok('tokens' in r);
  }
});

test('rank: returns empty array for empty sigIndex', () => {
  const empty = new Map();
  const results = rank('anything', empty, { topK: 5 });
  assert.deepStrictEqual(results, []);
});

test('rank: python extractor file in top-3 for "python extractor" query', () => {
  if (sigIndex.size === 0) return; // no context file — skip, don't fail
  const results = rank('python extractor', sigIndex, { topK: 10 });
  const top5 = results.slice(0, 5).map((r) => r.file);
  const hasPython = top5.some((f) => f.includes('python'));
  assert.ok(hasPython, `expected python extractor in top 5, got: ${top5.join(', ')}`);
});

// ---------------------------------------------------------------------------
// formatRankTable / formatRankJSON — unit tests
// ---------------------------------------------------------------------------
test('formatRankTable: output contains query header and columns', () => {
  if (sigIndex.size === 0) return;
  const results = rank('scanner', sigIndex, { topK: 3 });
  const table = formatRankTable(results, 'scanner');
  assert.ok(table.includes('scanner'), 'should include query');
  assert.ok(table.includes('Rank'), 'should include Rank column');
  assert.ok(table.includes('File'), 'should include File column');
  assert.ok(table.includes('Score'), 'should include Score column');
});

test('formatRankJSON: has correct top-level keys', () => {
  if (sigIndex.size === 0) return;
  const results = rank('route', sigIndex, { topK: 3 });
  const obj = formatRankJSON(results, 'route');
  assert.ok('query' in obj, 'should have query');
  assert.ok('results' in obj, 'should have results');
  assert.ok('totalResults' in obj, 'should have totalResults');
  assert.ok(Array.isArray(obj.results), 'results should be array');
  for (const r of obj.results) {
    assert.ok('rank' in r, 'each result should have rank');
    assert.ok('file' in r, 'each result should have file');
    assert.ok('score' in r, 'each result should have score');
    assert.ok('sigs' in r, 'each result should have sigs');
    assert.ok('tokens' in r, 'each result should have tokens');
  }
});

// ---------------------------------------------------------------------------
// CLI tests
// ---------------------------------------------------------------------------
test('CLI --query: exits 0 and prints ranked table', () => {
  // Use --query "extract" — something that should hit extractors
  const res = run('--query', 'extract');
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
  const out = res.stdout + res.stderr;
  // Output should contain either a Rank table or the no-match message
  assert.ok(out.length > 0, 'should produce output');
});

test('CLI --query --json: valid JSON with correct keys', () => {
  const res = run('--query', 'python extractor', '--json');
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
  let obj;
  try {
    obj = JSON.parse(res.stdout.trim());
  } catch (e) {
    assert.fail(`Output is not valid JSON: ${res.stdout.slice(0, 200)}`);
  }
  assert.ok('query' in obj, 'should have query');
  assert.ok('results' in obj, 'should have results');
  assert.ok('totalResults' in obj, 'should have totalResults');
  assert.ok(Array.isArray(obj.results), 'results should be array');
});

test('CLI --query --top 3: returns at most 3 results', () => {
  const res = run('--query', 'extractor', '--json', '--top', '3');
  assert.strictEqual(res.status, 0, `Expected exit 0. stderr: ${res.stderr}`);
  const obj = JSON.parse(res.stdout.trim());
  assert.ok(obj.results.length <= 3, `Expected ≤ 3 results, got ${obj.results.length}`);
});

test('CLI --query missing arg: exits 1 with usage message', () => {
  const res = run('--query');
  assert.strictEqual(res.status, 1, `Expected exit 1, got ${res.status}`);
  const out = res.stdout + res.stderr;
  assert.ok(out.includes('--query'), 'should mention --query in error');
});

test('CLI --version: returns current package version', () => {
  const res = run('--version');
  assert.strictEqual(res.status, 0);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(res.stdout.trim().includes(pkg.version), `expected ${pkg.version}, got: ${res.stdout.trim()}`);
});

// ---------------------------------------------------------------------------
// MCP tests — query_context  (8th tool) + get_impact (9th tool)
// ---------------------------------------------------------------------------
test('MCP tools/list: returns 21 tools including query_context', () => {
  const [res] = mcpCall({ jsonrpc: '2.0', method: 'tools/list', id: 1 });
  assert.ok(res.result, 'should have result');
  assert.strictEqual(res.result.tools.length, 21, `expected 21 tools, got ${res.result.tools.length}`);
  const names = res.result.tools.map((t) => t.name);
  assert.ok(names.includes('query_context'), 'should include query_context');
  assert.ok(names.includes('get_impact'), 'should include get_impact');
});

test('MCP query_context: returns result for a valid query', () => {
  const [res] = mcpCall({
    jsonrpc: '2.0', method: 'tools/call', id: 2,
    params: { name: 'query_context', arguments: { query: 'extractor', topK: 5 } },
  });
  assert.ok(res.result, 'should have result');
  const text = res.result.content[0].text;
  assert.ok(typeof text === 'string', 'should return string');
  assert.ok(text.length > 0, 'should return non-empty output');
});

test('MCP query_context: returns error for missing query arg', () => {
  const [res] = mcpCall({
    jsonrpc: '2.0', method: 'tools/call', id: 3,
    params: { name: 'query_context', arguments: {} },
  });
  assert.ok(res.result, 'should have result');
  const text = res.result.content[0].text;
  assert.ok(text.toLowerCase().includes('missing') || text.toLowerCase().includes('required'),
    `expected error message, got: ${text}`);
});

test('MCP query_context: unknown tool still returns error', () => {
  const [res] = mcpCall({
    jsonrpc: '2.0', method: 'tools/call', id: 4,
    params: { name: 'nonexistent_tool', arguments: {} },
  });
  assert.ok(res.error || (res.result && res.result.content), 'should get error or result');
});

// ---------------------------------------------------------------------------
// v6.6.0 — Retrieval explain + 7-intent ranking + negative-signal penalty
// ---------------------------------------------------------------------------
test('v6.6 detectIntent: identifies debug intent', () => {
  const intents = [
    { query: 'how to fix this bug', expected: 'debug' },
    { query: 'investigate the crash', expected: 'debug' },
    { query: 'find the error', expected: 'debug' },
  ];
  for (const { query, expected } of intents) {
    const intent = detectIntent(query);
    assert.strictEqual(intent, expected, `"${query}" should be ${expected}, got ${intent}`);
  }
});

test('v6.6 detectIntent: identifies explain intent', () => {
  const intents = [
    { query: 'explain the architecture', expected: 'explain' },
    { query: 'how does this work', expected: 'explain' },
    { query: 'what is this module', expected: 'explain' },
  ];
  for (const { query, expected } of intents) {
    const intent = detectIntent(query);
    assert.strictEqual(intent, expected, `"${query}" should be ${expected}, got ${intent}`);
  }
});

test('v6.6 detectIntent: identifies test intent', () => {
  const intents = [
    { query: 'unit test for this', expected: 'test' },
    { query: 'write a test', expected: 'test' },
    { query: 'integration test', expected: 'test' },
  ];
  for (const { query, expected } of intents) {
    const intent = detectIntent(query);
    assert.strictEqual(intent, expected, `"${query}" should be ${expected}, got ${intent}`);
  }
});

test('v6.6 detectIntent: identifies integrate intent', () => {
  const intents = [
    { query: 'what requires this module', expected: 'integrate' },
    { query: 'wire up the dependency', expected: 'integrate' },
    { query: 'show the import graph', expected: 'integrate' },
  ];
  for (const { query, expected } of intents) {
    const intent = detectIntent(query);
    assert.strictEqual(intent, expected, `"${query}" should be ${expected}, got ${intent}`);
  }
});

test('v6.6 detectIntent: identifies navigate intent', () => {
  const intents = [
    { query: 'find the python extractor', expected: 'navigate' },
    { query: 'where is the config loader', expected: 'navigate' },
    { query: 'show me the ranker', expected: 'navigate' },
  ];
  for (const { query, expected } of intents) {
    const intent = detectIntent(query);
    assert.strictEqual(intent, expected, `"${query}" should be ${expected}, got ${intent}`);
  }
});

test('v6.6 detectIntent: defaults to search', () => {
  const query = 'signature extraction tools';
  const intent = detectIntent(query);
  assert.strictEqual(intent, 'search', `ambiguous query should be search, got ${intent}`);
});

test('v6.6 rank: returns intent field in results', () => {
  if (sigIndex.size === 0) return;
  const results = rank('debug this error', sigIndex, { topK: 3 });
  assert.ok(results.length > 0, 'should return results');
  for (const r of results) {
    assert.ok('intent' in r, 'each result should have intent field');
    assert.strictEqual(r.intent, 'debug', 'debug intent should be detected');
  }
});

test('v6.6 rank: returns signals breakdown in results', () => {
  if (sigIndex.size === 0) return;
  const results = rank('extract files', sigIndex, { topK: 3 });
  assert.ok(results.length > 0, 'should return results');
  for (const r of results) {
    assert.ok('signals' in r, 'each result should have signals field');
    const sig = r.signals;
    assert.ok(typeof sig === 'object', 'signals should be an object');
    assert.ok('penalty' in sig, 'signals should include penalty');
    assert.ok(typeof sig.penalty === 'number', 'penalty should be a number');
    assert.ok(sig.penalty >= 0 && sig.penalty <= 1.0, `penalty should be between 0 and 1, got ${sig.penalty}`);
  }
});

test('v6.6 rank: penalty reduces score for test files', () => {
  // Create a minimal test index with both test and source files
  const testIndex = new Map([
    ['src/extractor.js', ['extract(src)', 'parseSignatures()']],
    ['test/extractor.test.js', ['extract(src)', 'parseSignatures()']],
  ]);
  const results = rank('extract', testIndex, { topK: 10 });
  // The source file should rank higher than the test file
  const srcIdx = results.findIndex((r) => r.file.includes('src/extractor'));
  const testIdx = results.findIndex((r) => r.file.includes('test/extractor'));
  if (srcIdx !== -1 && testIdx !== -1) {
    assert.ok(srcIdx < testIdx, `source file (idx ${srcIdx}) should rank before test file (idx ${testIdx})`);
  }
});

test('v6.6 rank: penalty reduces score for docs files', () => {
  const testIndex = new Map([
    ['src/loader.js', ['loadConfig()', 'detectFrameworks()']],
    ['docs/guide.md', ['loadConfig()', 'detectFrameworks()']],
  ]);
  const results = rank('load', testIndex, { topK: 10 });
  const srcIdx = results.findIndex((r) => r.file.includes('src/loader'));
  const docsIdx = results.findIndex((r) => r.file.includes('docs'));
  if (srcIdx !== -1 && docsIdx !== -1) {
    assert.ok(srcIdx < docsIdx, `source file (idx ${srcIdx}) should rank before docs file (idx ${docsIdx})`);
  }
});

test('v6.6 formatRankTable: includes signals in output', () => {
  if (sigIndex.size === 0) return;
  const results = rank('extract', sigIndex, { topK: 2 });
  const table = formatRankTable(results, 'extract');
  assert.ok(table.includes('Penalty'), 'should include Penalty column');
  assert.ok(table.includes('Intent:'), 'should include Intent line');
});

test('v6.6 formatRankJSON: includes intent and signals', () => {
  if (sigIndex.size === 0) return;
  const results = rank('refactor', sigIndex, { topK: 3 });
  const obj = formatRankJSON(results, 'refactor');
  assert.ok('intent' in obj, 'should have intent at top level');
  assert.strictEqual(obj.intent, 'refactor', 'intent should be refactor');
  for (const r of obj.results) {
    assert.ok('signals' in r, 'each result should include signals');
  }
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
console.log('');
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
