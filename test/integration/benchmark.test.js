'use strict';

/**
 * Integration tests for v2.1 benchmark & evaluation system.
 *
 * Tests:
 *  1.  scorer.hitAtK — correct file in ranked → 1
 *  2.  scorer.hitAtK — not in ranked → 0
 *  3.  scorer.reciprocalRank — rank 1 → 1.0
 *  4.  scorer.reciprocalRank — rank 2 → 0.5, not found → 0
 *  5.  scorer.aggregate — correct shape & values
 *  6.  runner.tokenize — camelCase / snake_case splitting
 *  7.  runner.loadTasks — parses JSONL, skips invalid lines
 *  8.  runner.run — returns empty result for empty task file
 *  9.  runner.run — returns metrics object with correct keys
 * 10.  CLI --benchmark --json produces valid JSON with correct fields
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
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
// Load modules directly from src/ (tests run from ROOT with src/ available)
// ---------------------------------------------------------------------------

const scorer = require(path.join(ROOT, 'src', 'eval', 'scorer'));
const runner = require(path.join(ROOT, 'src', 'eval', 'runner'));

console.log('[benchmark.test.js] v2.1 benchmark & evaluation system');
console.log('');

// ---------------------------------------------------------------------------
// 1. scorer.hitAtK — correct file in top-5 ranked → 1
// ---------------------------------------------------------------------------
test('scorer.hitAtK: correct file in top-5 → 1', () => {
  const ranked = ['src/security/scanner.js', 'src/security/patterns.js', 'src/config/loader.js'];
  const expected = ['src/security/scanner.js'];
  assert.strictEqual(scorer.hitAtK(ranked, expected, 5), 1);
});

// ---------------------------------------------------------------------------
// 2. scorer.hitAtK — file not present → 0
// ---------------------------------------------------------------------------
test('scorer.hitAtK: file not in ranked → 0', () => {
  const ranked = ['src/config/loader.js', 'src/map/import-graph.js'];
  const expected = ['src/security/scanner.js'];
  assert.strictEqual(scorer.hitAtK(ranked, expected, 5), 0);
});

// ---------------------------------------------------------------------------
// 3. scorer.reciprocalRank — first result correct → 1.0
// ---------------------------------------------------------------------------
test('scorer.reciprocalRank: rank 1 → 1.0', () => {
  const ranked = ['src/security/scanner.js', 'src/config/loader.js'];
  const expected = ['src/security/scanner.js'];
  assert.strictEqual(scorer.reciprocalRank(ranked, expected), 1.0);
});

// ---------------------------------------------------------------------------
// 4. scorer.reciprocalRank — rank 2 → 0.5; not found → 0
// ---------------------------------------------------------------------------
test('scorer.reciprocalRank: rank 2 → 0.5', () => {
  const ranked = ['src/config/loader.js', 'src/security/scanner.js'];
  const expected = ['src/security/scanner.js'];
  assert.strictEqual(scorer.reciprocalRank(ranked, expected), 0.5);
});

test('scorer.reciprocalRank: not found → 0', () => {
  const ranked = ['src/config/loader.js'];
  const expected = ['src/security/scanner.js'];
  assert.strictEqual(scorer.reciprocalRank(ranked, expected), 0);
});

// ---------------------------------------------------------------------------
// 5. scorer.aggregate — correct shape and values
// ---------------------------------------------------------------------------
test('scorer.aggregate: correct shape and values', () => {
  const results = [
    { ranked: ['src/security/scanner.js'], expected: ['src/security/scanner.js'], tokens: 200 },
    { ranked: ['src/config/loader.js'], expected: ['src/security/scanner.js'], tokens: 100 },
  ];
  const agg = scorer.aggregate(results, 5);
  assert.strictEqual(typeof agg.hitAt5, 'number');
  assert.strictEqual(typeof agg.mrr, 'number');
  assert.strictEqual(typeof agg.precisionAt5, 'number');
  assert.strictEqual(typeof agg.avgTokens, 'number');
  assert.strictEqual(agg.tasks, 2);
  assert.ok(agg.hitAt5 >= 0 && agg.hitAt5 <= 1, `hitAt5 out of range: ${agg.hitAt5}`);
  assert.ok(agg.mrr >= 0 && agg.mrr <= 1, `mrr out of range: ${agg.mrr}`);
  // 1 hit out of 2 tasks → 0.5
  assert.strictEqual(agg.hitAt5, 0.5);
  assert.strictEqual(agg.avgTokens, 150);
});

// ---------------------------------------------------------------------------
// 6. runner.tokenize — splits camelCase and snake_case; filters stop words
// ---------------------------------------------------------------------------
test('runner.tokenize: splits camelCase', () => {
  const tokens = runner.tokenize('buildSigIndex');
  assert.ok(tokens.includes('build'), `tokens: ${tokens}`);
  assert.ok(tokens.includes('sig'), `tokens: ${tokens}`);
  assert.ok(tokens.includes('index'), `tokens: ${tokens}`);
});

test('runner.tokenize: splits snake_case', () => {
  const tokens = runner.tokenize('extract_return_type');
  assert.ok(tokens.includes('extract'), `tokens: ${tokens}`);
  assert.ok(tokens.includes('return'), `tokens: ${tokens}`);
  assert.ok(tokens.includes('type'), `tokens: ${tokens}`);
});

// ---------------------------------------------------------------------------
// 7. runner.loadTasks — parses JSONL, skips invalid lines
// ---------------------------------------------------------------------------
test('runner.loadTasks: parses valid lines, skips invalid', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-bench-'));
  const tasksFile = path.join(tmp, 'tasks.jsonl');
  fs.writeFileSync(tasksFile, [
    JSON.stringify({ id: 't1', query: 'add extractor', expected_files: ['src/extractors/python.js'] }),
    'NOT VALID JSON',
    '',
    JSON.stringify({ id: 't2', query: 'secret scan', expected_files: ['src/security/scanner.js'] }),
  ].join('\n'));

  const tasks = runner.loadTasks(tasksFile);
  assert.strictEqual(tasks.length, 2, `expected 2 tasks, got ${tasks.length}`);
  assert.strictEqual(tasks[0].id, 't1');
  assert.strictEqual(tasks[1].query, 'secret scan');
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// 8. runner.run — empty task file returns empty result
// ---------------------------------------------------------------------------
test('runner.run: empty task file returns empty result', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-bench-'));
  const tasksFile = path.join(tmp, 'empty.jsonl');
  fs.writeFileSync(tasksFile, '');
  const result = runner.run(tasksFile, tmp);
  assert.strictEqual(result.tasks.length, 0);
  assert.strictEqual(result.metrics.tasks, 0);
  assert.strictEqual(result.metrics.hitAt5, 0);
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// 9. runner.run — returns metrics with correct keys against SigMap's own context
// ---------------------------------------------------------------------------
test('runner.run: returns metrics with correct keys against SigMap repo', () => {
  const tasksFile = path.join(ROOT, 'benchmarks', 'tasks', 'retrieval.jsonl');
  // Only run if context file exists (may not exist in clean CI before first gen)
  const contextFile = path.join(ROOT, '.github', 'copilot-instructions.md');
  if (!fs.existsSync(tasksFile)) {
    console.log('    (skip: retrieval.jsonl not found)');
    return;
  }
  const result = runner.run(tasksFile, ROOT);
  assert.ok(typeof result.metrics === 'object');
  assert.ok('hitAt5' in result.metrics, 'missing hitAt5');
  assert.ok('mrr' in result.metrics, 'missing mrr');
  assert.ok('precisionAt5' in result.metrics, 'missing precisionAt5');
  assert.ok('avgTokens' in result.metrics, 'missing avgTokens');
  assert.ok('tasks' in result.metrics, 'missing tasks');
  assert.ok(result.metrics.hitAt5 >= 0 && result.metrics.hitAt5 <= 1, 'hitAt5 out of range');
  assert.ok(result.metrics.mrr >= 0 && result.metrics.mrr <= 1, 'mrr out of range');
  if (fs.existsSync(contextFile)) {
    assert.ok(result.metrics.tasks > 0, 'expected at least 1 task result');
  }
});

// ---------------------------------------------------------------------------
// 10. CLI --benchmark --json produces valid JSON with required fields
// ---------------------------------------------------------------------------
test('CLI --benchmark --json: valid JSON with required fields', () => {
  const res = spawnSync('node', [SCRIPT, '--benchmark', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  assert.strictEqual(res.status, 0, `exit ${res.status}: ${res.stderr}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout.trim());
  } catch (e) {
    throw new Error(`--benchmark --json output is not valid JSON: ${res.stdout.slice(0, 200)}`);
  }
  assert.ok(typeof parsed === 'object', 'output must be object');
  assert.ok('metrics' in parsed, 'missing metrics');
  assert.ok('tasks' in parsed, 'missing tasks array');
  assert.ok(typeof parsed.metrics.hitAt5 === 'number', 'metrics.hitAt5 must be number');
  assert.ok(typeof parsed.metrics.mrr === 'number', 'metrics.mrr must be number');
  assert.ok(typeof parsed.metrics.tasks === 'number', 'metrics.tasks must be number');
  assert.ok(Array.isArray(parsed.tasks), 'tasks must be array');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`[benchmark.test.js] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
