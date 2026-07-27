'use strict';

/**
 * Integration tests for the A3 hard-corpus tooling (v8.22).
 *
 * Tests:
 *  1.  corpus.queryLeakage — direct token overlap is flagged
 *  2.  corpus.queryLeakage — stemmed overlap is flagged (payments vs payment.js)
 *  3.  corpus.queryLeakage — camelCase basename splitting is flagged
 *  4.  corpus.queryLeakage — disjoint query/basenames is clean
 *  5.  corpus.validateTasks — leaky hard task is a violation, leaky easy task is not
 *  6.  runner.loadTasks — split field passthrough ('hard' kept, absent → 'easy')
 *  7.  corpus.sizeBucket — thresholds at 200 and 1000
 *  8.  validate-task-corpus.mjs — exits 0 on the committed corpus
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

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

const corpus = require(path.join(ROOT, 'src', 'eval', 'corpus'));
const runner = require(path.join(ROOT, 'src', 'eval', 'runner'));

console.log('[hard-corpus.test.js] A3 hard-corpus: leakage gate, splits, buckets');
console.log('');

test('queryLeakage flags direct token overlap', () => {
  const r = corpus.queryLeakage('parse time zone offsets', ['absl/time/time.h']);
  assert.strictEqual(r.clean, false);
  assert.ok(r.leaked.includes('time'), `leaked=${r.leaked}`);
});

test('queryLeakage flags stemmed overlap', () => {
  const r = corpus.queryLeakage('handle failed payments', ['lib/payment.js']);
  assert.strictEqual(r.clean, false, 'stemming should equate payments/payment');
});

test('queryLeakage flags camelCase basename tokens', () => {
  const r = corpus.queryLeakage('interceptor chains', ['lib/core/InterceptorManager.js']);
  assert.strictEqual(r.clean, false);
  assert.ok(r.leaked.includes('interceptor'), `leaked=${r.leaked}`);
});

test('queryLeakage clean when disjoint', () => {
  const r = corpus.queryLeakage('decide fulfilled or rejected based on status code', ['lib/core/settle.js']);
  assert.strictEqual(r.clean, true);
  assert.deepStrictEqual(r.leaked, []);
});

test('validateTasks: hard leak is a violation, easy leak is not', () => {
  const { results, hardViolations } = corpus.validateTasks([
    { id: 'a', query: 'session cookie', expected_files: ['sessions.py'], split: 'hard' },
    { id: 'b', query: 'session cookie', expected_files: ['sessions.py'] },
  ]);
  assert.strictEqual(results.length, 2);
  assert.strictEqual(hardViolations.length, 1);
  assert.strictEqual(hardViolations[0].id, 'a');
});

test('loadTasks passes split through, defaults to easy', () => {
  const tmp = path.join(os.tmpdir(), `sigmap-hard-corpus-${process.pid}.jsonl`);
  fs.writeFileSync(tmp, [
    JSON.stringify({ id: 't1', query: 'q one', expected_files: ['a.js'], split: 'hard' }),
    JSON.stringify({ id: 't2', query: 'q two', expected_files: ['b.js'] }),
  ].join('\n'));
  try {
    const tasks = runner.loadTasks(tmp);
    assert.strictEqual(tasks[0].split, 'hard');
    assert.strictEqual(tasks[1].split, 'easy');
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('sizeBucket thresholds', () => {
  assert.strictEqual(corpus.sizeBucket(199), 'small');
  assert.strictEqual(corpus.sizeBucket(200), 'medium');
  assert.strictEqual(corpus.sizeBucket(1000), 'medium');
  assert.strictEqual(corpus.sizeBucket(1001), 'large');
});

test('validate-task-corpus.mjs exits 0 on committed corpus', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'validate-task-corpus.mjs')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.ok(/0 hard violation/.test(r.stdout), r.stdout);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`[hard-corpus.test.js] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
