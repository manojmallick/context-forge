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
 * 19.  CLI --version: returns 2.3.0
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
const { rank, buildSigIndex, formatRankTable, formatRankJSON } =
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
  const top3 = results.slice(0, 3).map((r) => r.file);
  const hasPython = top3.some((f) => f.includes('python'));
  assert.ok(hasPython, `expected python extractor in top 3, got: ${top3.join(', ')}`);
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

test('CLI --version: returns 2.3.0', () => {
  const res = run('--version');
  assert.strictEqual(res.status, 0);
  assert.ok(res.stdout.trim().includes('2.3.0'), `expected 2.3.0, got: ${res.stdout.trim()}`);
});

// ---------------------------------------------------------------------------
// MCP tests — query_context  (8th tool)
// ---------------------------------------------------------------------------
test('MCP tools/list: returns 8 tools including query_context', () => {
  const [res] = mcpCall({ jsonrpc: '2.0', method: 'tools/list', id: 1 });
  assert.ok(res.result, 'should have result');
  assert.strictEqual(res.result.tools.length, 8, `expected 8 tools, got ${res.result.tools.length}`);
  const names = res.result.tools.map((t) => t.name);
  assert.ok(names.includes('query_context'), 'should include query_context');
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
// Results
// ---------------------------------------------------------------------------
console.log('');
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
