'use strict';

/**
 * Integration tests for the LLM A/B ablation harness (IMPL §9).
 *   buildGrounding · scoreAnswer · runAblation (injected completer) · script skip
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'run-llm-ablation.mjs');
const { buildGrounding, scoreAnswer, scoreAnswerDetail, runAblation, aggregateRuns } = require(path.join(ROOT, 'src/eval/llm-ablation'));
const { resolvePrice, listModels } = require(path.join(ROOT, 'src/tracking/pricing'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (err) { console.error(`  FAIL  ${name}`); console.error(`        ${err.message}`); failed++; }
}

// A repo with one real symbol + a generated index, so verify() can flag fakes.
function withRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablation-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'core.js'),
      'function realCoreFn(x){ return x; }\nmodule.exports = { realCoreFn };\n');
    execFileSync(process.execPath, [path.join(ROOT, 'gen-context.js')], { cwd: dir, stdio: 'ignore' });
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── buildGrounding ──────────────────────────────────────────────────────────
test('buildGrounding: non-empty, includes conventions + exact signatures', () => {
  withRepo((dir) => {
    const g = buildGrounding(dir);
    assert.ok(g.length > 0, 'grounding is non-empty');
    assert.ok(/Conventions/.test(g), 'has conventions block');
    assert.ok(/Exact signatures/.test(g), 'has the exact-signatures section');
    assert.ok(/realCoreFn/.test(g), 'includes the real symbol signature');
  });
});
test('buildGrounding: maxSignatures bounds the signature lines', () => {
  withRepo((dir) => {
    const g = buildGrounding(dir, { maxSignatures: 1 });
    // only one signature line beyond the section header
    const sigLines = g.split('\n').filter((l) => /^(module\.exports|function|class|def|const|async)/.test(l.trim()));
    assert.ok(sigLines.length <= 1, `expected ≤1 sig line, got ${sigLines.length}`);
  });
});

// ── scoreAnswer / scoreAnswerDetail ─────────────────────────────────────────
test('scoreAnswer: flags a fake symbol, clears a real one', () => {
  withRepo((dir) => {
    const fake = scoreAnswer('Call `totallyFakeSymbol(...)` in `src/ghost.js`.', dir);
    const real = scoreAnswer('Use `realCoreFn(...)`.', dir);
    assert.ok(fake > 0, `fake answer should flag, got ${fake}`);
    assert.ok(fake > real, `fake (${fake}) should flag more than real (${real})`);
  });
});
test('scoreAnswerDetail: returns total + issue objects', () => {
  withRepo((dir) => {
    const d = scoreAnswerDetail('Call `totallyFakeSymbol(...)` in `src/ghost.js`.', dir);
    assert.strictEqual(typeof d.total, 'number');
    assert.ok(Array.isArray(d.issues), 'issues is an array');
    assert.strictEqual(d.issues.length, d.total, 'issue count matches total');
    assert.ok(d.issues.some((i) => i.type && i.message), 'issues have type + message');
  });
});

// ── runAblation ─────────────────────────────────────────────────────────────
test('runAblation: injected completer; aggregate has the A/B shape', () => {
  withRepo((dir) => {
    const tasks = [{ id: 't1', prompt: 'write code' }];
    // completer ignores grounding, always real → both arms clean
    const complete = () => 'Use `realCoreFn(...)`.';
    const r = runAblation(tasks, dir, complete);
    assert.strictEqual(r.tasks.length, 1);
    for (const k of ['n', 'withoutFlagged', 'withFlagged', 'delta', 'withoutPer100', 'withPer100']) {
      assert.ok(k in r.aggregate, `aggregate has ${k}`);
    }
    assert.strictEqual(r.aggregate.n, 1);
    assert.ok(!('aIssues' in r.tasks[0]), 'no issues attached without collectIssues');
  });
});
test('runAblation: collectIssues attaches per-arm issue lists', () => {
  withRepo((dir) => {
    const complete = (prompt) => (/realCoreFn/.test(prompt) ? 'Use `realCoreFn(...)`.' : 'Call `madeUpSym(...)` in `src/none.js`.');
    const r = runAblation([{ id: 't1', prompt: 'P' }], dir, complete, { collectIssues: true });
    const row = r.tasks[0];
    assert.ok(Array.isArray(row.aIssues) && Array.isArray(row.bIssues), 'both arms have issue arrays');
    assert.ok(row.aIssues.length >= 1, 'ungrounded arm has flagged issues');
  });
});
test('runAblation: grounding reduces flagged errors (delta > 0)', () => {
  withRepo((dir) => {
    const tasks = [{ id: 't1', prompt: 'P1' }, { id: 't2', prompt: 'P2' }];
    // Hallucinate ONLY when the prompt lacks the grounding marker (a known symbol).
    const complete = (prompt) => (/realCoreFn/.test(prompt)
      ? 'Use `realCoreFn(...)`.'                       // grounded → real
      : 'Call `madeUpSymbolXyz(...)` in `src/none.js`.'); // ungrounded → 2 fakes
    const r = runAblation(tasks, dir, complete);
    assert.ok(r.aggregate.withoutFlagged > 0, 'ungrounded arm flags errors');
    assert.strictEqual(r.aggregate.withFlagged, 0, 'grounded arm is clean');
    assert.ok(r.aggregate.delta > 0, `delta should be positive, got ${r.aggregate.delta}`);
  });
});
test('runAblation: calls completer twice per task (ungrounded + grounded)', () => {
  withRepo((dir) => {
    let calls = 0;
    const complete = () => { calls++; return 'Use `realCoreFn(...)`.'; };
    runAblation([{ id: 'a', prompt: 'x' }, { id: 'b', prompt: 'y' }], dir, complete, { grounding: 'G' });
    assert.strictEqual(calls, 4, 'two tasks × two arms = 4 calls');
  });
});

// ── aggregateRuns ───────────────────────────────────────────────────────────
test('aggregateRuns: mean/min/max across runs for without, with, and delta', () => {
  const runs = [
    { n: 40, withoutPer100: 13, withPer100: 3 },  // delta 10
    { n: 40, withoutPer100: 15, withPer100: 5 },  // delta 10
    { n: 40, withoutPer100: 11, withPer100: 2 },  // delta 9
  ];
  const a = aggregateRuns(runs);
  assert.strictEqual(a.runs, 3);
  assert.strictEqual(a.n, 40);
  assert.strictEqual(a.withoutPer100.mean, 13);
  assert.strictEqual(a.withoutPer100.min, 11);
  assert.strictEqual(a.withoutPer100.max, 15);
  assert.strictEqual(a.withPer100.mean, (3 + 5 + 2) / 3);
  assert.strictEqual(a.deltaPer100.min, 9);
  assert.strictEqual(a.deltaPer100.max, 10);
});
test('aggregateRuns: empty input is zeroed, not NaN', () => {
  const a = aggregateRuns([]);
  assert.strictEqual(a.runs, 0);
  assert.strictEqual(a.n, 0);
  for (const k of ['withoutPer100', 'withPer100', 'deltaPer100']) {
    assert.strictEqual(a[k].mean, 0);
    assert.strictEqual(a[k].min, 0);
    assert.strictEqual(a[k].max, 0);
  }
});
test('aggregateRuns: single run mean equals that run', () => {
  const a = aggregateRuns([{ n: 100, withoutPer100: 13, withPer100: 3 }]);
  assert.strictEqual(a.runs, 1);
  assert.strictEqual(a.withoutPer100.mean, 13);
  assert.strictEqual(a.withPer100.mean, 3);
  assert.strictEqual(a.deltaPer100.mean, 10);
});

// ── MiniMax provider metadata ──────────────────────────────────────────────
test('MiniMax models: target input pricing is registered', () => {
  assert.ok(listModels().includes('minimax-m3'));
  assert.ok(listModels().includes('minimax-m2.7'));
  assert.strictEqual(resolvePrice('MiniMax-M3').perMtok, 0.6);
  assert.strictEqual(resolvePrice('MiniMax-M2.7').perMtok, 0.3);
});

// ── corpus shape (fact questions, not code-writing) ─────────────────────────
test('corpus: checkable repo-fact questions — no example-code tasks', () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks', 'llm-ablation-tasks.json'), 'utf8'));
  const tasks = corpus.tasks || [];
  assert.ok(tasks.length >= 40, `expected a sizeable corpus, got ${tasks.length}`);
  assert.ok(tasks.every((t) => /^fact-/.test(t.id)), 'all ids use the fact- prefix');
  assert.ok(tasks.every((t) => /full repository path/.test(t.prompt)), 'every prompt asks for the file path (a checkable claim)');
  assert.ok(tasks.every((t) => /do not write illustrative or example code/.test(t.prompt)), 'every prompt forbids example scaffolding');
  assert.ok(!tasks.some((t) => /requires .* and calls its/.test(t.prompt)), 'no legacy "write an example" tasks remain');
});

// ── script (skip path) ──────────────────────────────────────────────────────
test('script: exits 0 with guidance when no API key is set', () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.GEMINI_API_KEY;
  delete env.GOOGLE_API_KEY;
  delete env.MINIMAX_API_KEY;
  const res = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8', env });
  assert.strictEqual(res.status, 0, res.stderr);
  assert.ok(/No API key set/.test(res.stdout), 'prints skip guidance');
  assert.ok(/harness is ready/.test(res.stdout));
  assert.ok(/GEMINI_API_KEY/.test(res.stdout), 'mentions the Gemini provider');
  assert.ok(/MINIMAX_API_KEY/.test(res.stdout), 'mentions the MiniMax provider');
});

console.log(`\nllm-ablation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
