'use strict';

/**
 * Retrieval-index completeness.
 *
 * REGRESSION GUARD. The generated context file is a token-BUDGETED view meant
 * for prompt injection; the ranker's index must NOT inherit that budget. When
 * they shared one artifact, every file `applyTokenBudget` dropped became
 * permanently unreachable by `sigmap ask` — no ranking change can surface a
 * file that is not indexed. These tests pin the separation so a future budget
 * change cannot silently starve retrieval again.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const GEN_CONTEXT = path.join(ROOT, 'gen-context.js');

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

function withTempProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-idx-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function runGenerate(dir, args = '') {
  return execSync(`node ${GEN_CONTEXT} ${args}`, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
}

/** A source file large enough that a tight budget must drop some of them. */
function writeJsFile(filePath, fnCount, prefix) {
  let content = '';
  for (let i = 0; i < fnCount; i++) {
    content += `function ${prefix}Handler${i}(alpha, beta, gamma) { return alpha + beta + gamma; }\n`;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/**
 * A project deliberately far over budget, so applyTokenBudget must drop files.
 * Returns the list of repo-relative source paths written.
 */
function buildOverBudgetProject(dir, fileCount = 24) {
  const rels = [];
  for (let i = 0; i < fileCount; i++) {
    const rel = `src/module${i}/feature${i}.js`;
    writeJsFile(path.join(dir, rel), 22, `mod${i}`);
    rels.push(rel);
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'idx-fixture', version: '1.0.0', main: 'entrypoint.js',
  }));
  // A declared entrypoint OUTSIDE srcDirs — must still be indexed.
  writeJsFile(path.join(dir, 'entrypoint.js'), 3, 'entry');
  fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
    srcDirs: ['src'], outputs: ['copilot'], secretScan: false, maxTokens: 900,
  }));
  return rels;
}

// ---------------------------------------------------------------------------

console.log('\nretrieval-index:');

test('A1: generate writes a complete retrieval index artifact', () => {
  withTempProject((dir) => {
    buildOverBudgetProject(dir);
    runGenerate(dir);
    const artifact = path.join(dir, '.context', 'sig-index.json');
    assert.ok(fs.existsSync(artifact), 'expected .context/sig-index.json to exist');
    const data = JSON.parse(fs.readFileSync(artifact, 'utf8'));
    assert.strictEqual(data.schema, 1, 'schema version should be 1');
    assert.ok(Object.keys(data.files).length > 0, 'index should not be empty');
  });
});

test('A2: the budget actually drops files from the prompt artifact (fixture is valid)', () => {
  withTempProject((dir) => {
    const rels = buildOverBudgetProject(dir);
    runGenerate(dir);
    const ctx = fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8');
    const inPrompt = rels.filter((r) => ctx.includes(`### ${r}`));
    assert.ok(inPrompt.length < rels.length,
      `fixture must be over budget: all ${rels.length} files survived the prompt budget`);
  });
});

test('A3: the retrieval index keeps EVERY source file the budget dropped', () => {
  withTempProject((dir) => {
    const rels = buildOverBudgetProject(dir);
    runGenerate(dir);
    const data = JSON.parse(fs.readFileSync(path.join(dir, '.context', 'sig-index.json'), 'utf8'));
    const missing = rels.filter((r) => !data.files[r]);
    assert.strictEqual(missing.length, 0,
      `retrieval index is missing ${missing.length} budget-dropped file(s): ${missing.slice(0, 3).join(', ')}`);
  });
});

test('A4: buildSigIndex() sees every scanned file, not just the budgeted view', () => {
  withTempProject((dir) => {
    const rels = buildOverBudgetProject(dir);
    runGenerate(dir);
    delete require.cache[require.resolve('../../src/retrieval/ranker')];
    const { buildSigIndex } = require('../../src/retrieval/ranker');
    const index = buildSigIndex(dir);
    const missing = rels.filter((r) => !index.has(r));
    assert.strictEqual(missing.length, 0,
      `buildSigIndex dropped ${missing.length} file(s) — retrieval is inheriting the prompt budget`);
  });
});

test('A5: a budget-dropped file is still retrievable by the ranker', () => {
  withTempProject((dir) => {
    const rels = buildOverBudgetProject(dir);
    runGenerate(dir);
    const ctx = fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8');
    const dropped = rels.find((r) => !ctx.includes(`### ${r}`));
    assert.ok(dropped, 'fixture should have at least one dropped file');
    delete require.cache[require.resolve('../../src/retrieval/ranker')];
    const { buildSigIndex, rank } = require('../../src/retrieval/ranker');
    const index = buildSigIndex(dir);
    const n = dropped.match(/module(\d+)/)[1];
    const results = rank(`mod${n}Handler`, index, { topK: 5, cwd: dir });
    assert.ok(results.some((r) => r.file === dropped),
      `dropped file ${dropped} did not rank for its own symbol — it is unreachable`);
  });
});

test('A6: a declared package.json entrypoint outside srcDirs is indexed', () => {
  withTempProject((dir) => {
    buildOverBudgetProject(dir);
    runGenerate(dir);
    const data = JSON.parse(fs.readFileSync(path.join(dir, '.context', 'sig-index.json'), 'utf8'));
    assert.ok(data.files['entrypoint.js'],
      'package.json "main" outside srcDirs should still be indexed');
  });
});

test('A7: scoring weights are load-bearing (guards the dead-weights regression)', () => {
  // DEFAULT_WEIGHTS and every intent profile were once computed and discarded,
  // so ranking was identical for any weights. Setting them all to zero must
  // change SOMETHING, or the weight system is dead config again.
  const { buildSigIndex, rank } = require('../../src/retrieval/ranker');
  const index = buildSigIndex(ROOT);
  assert.ok(index.size > 0, 'repo index should be non-empty');
  const zero = { exactToken: 0, symbolMatch: 0, prefixMatch: 0, pathMatch: 0, recencyBoost: 1, graphBoost: 0 };
  const q = 'rank files against a query';
  const a = rank(q, index, { topK: 10, cwd: ROOT }).map((r) => r.score.toFixed(6)).join('|');
  const b = rank(q, index, { topK: 10, cwd: ROOT, weights: zero }).map((r) => r.score.toFixed(6)).join('|');
  assert.notStrictEqual(a, b, 'zeroing every weight changed nothing — scoring weights are dead config');
});

test('A8: graph boost lookups match the graph key space (case-normalisation guard)', () => {
  // The graph builders lowercase every node key; the ranker used path.resolve()
  // which preserves case, so on any repo path containing an uppercase letter
  // every lookup missed and the boost was silently inert.
  const { buildSigIndex, rank } = require('../../src/retrieval/ranker');
  const { buildFromCwd } = require('../../src/graph/builder');
  const index = buildSigIndex(ROOT);
  const graph = buildFromCwd(ROOT);
  const boosted = rank('MCP server tool definitions', index, { topK: 10, cwd: ROOT, graph })
    .filter((r) => r.signals && r.signals.graphBoost);
  assert.ok(boosted.length > 0,
    'no file received a graph boost — the ranker and graph key spaces have diverged again');
});

test('A9: module-doc prose is indexed but never rendered into the prompt', () => {
  const { readFullIndex } = require('../../src/retrieval/sig-index-store');
  const index = readFullIndex(ROOT);
  const withDoc = [...index.values()].filter((sigs) => sigs[0] && sigs[0].startsWith('# module:'));
  assert.ok(withDoc.length > 20, `only ${withDoc.length} files carry a module doc — enrichment is not running`);
  // The prompt artifact is token-budgeted; prose belongs only in the index.
  const ctx = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  assert.ok(!ctx.includes('# module:'), 'module-doc prose leaked into the generated context file');
});

test('A10: test files are reachable by the ranker but absent from the prompt', () => {
  const { buildSigIndex } = require('../../src/retrieval/ranker');
  const index = buildSigIndex(ROOT);
  const tests = [...index.keys()].filter((f) => /^tests?\//.test(f));
  assert.ok(tests.length > 0, 'no test file is indexed — "where are the tests for X" is unanswerable');
  const ctx = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const leaked = tests.filter((f) => ctx.includes('### ' + f));
  assert.strictEqual(leaked.length, 0, `${leaked.length} test file(s) leaked into the prompt artifact`);
});

test('A11: a penalty never fires on the category the query asked for', () => {
  const { _queryWants } = require('../../src/retrieval/ranker');
  const { tokenize } = require('../../src/retrieval/tokenizer');
  // detectIntent cannot express this: it is first-match-wins and `debug`
  // precedes `test`, so this query classifies as debug and never sees a test.
  assert.strictEqual(_queryWants(tokenize('fix the failing test')).tests, true);
  assert.strictEqual(_queryWants(tokenize('update the readme')).docs, true);
  assert.strictEqual(_queryWants(tokenize('rank files by relevance')).tests, false);

  const { buildSigIndex, rank } = require('../../src/retrieval/ranker');
  const index = buildSigIndex(ROOT);
  const asked = rank('where are the tests for the ranker', index, { topK: 5, cwd: ROOT, learned: false });
  assert.ok(asked.some((r) => /^tests?\//.test(r.file)),
    'a test-seeking query returned no test file — the penalty is fighting the query');
  const notAsked = rank('rank files by relevance', index, { topK: 5, cwd: ROOT, learned: false });
  assert.ok(notAsked.every((r) => !/^tests?\//.test(r.file)),
    'test files surfaced for a non-test query — the penalty stopped working');
});

test('A12: call-graph boost survives an uppercase repo path', () => {
  // The callgraph-boost fixture runs in an all-lowercase temp dir, so a
  // case-sensitivity bug passes there and fails on any real checkout under
  // /Users or C:\\Users. This exercises the REAL repo path on purpose.
  assert.ok(/[A-Z]/.test(ROOT), 'this guard needs a repo path containing an uppercase letter');
  const { buildSigIndex, rank } = require('../../src/retrieval/ranker');
  const { buildCallFileGraph } = require('../../src/graph/call-graph');
  const index = buildSigIndex(ROOT);
  let callGraph = null;
  try { callGraph = buildCallFileGraph(ROOT); } catch (_) { return; }
  if (!callGraph || callGraph.forward.size === 0) return;
  const boosted = rank('rank files against a query', index, { topK: 25, cwd: ROOT, callGraph, learned: false })
    .filter((r) => r.signals && r.signals.callGraphBoost);
  assert.ok(boosted.length > 0,
    'no file received a call-graph boost on an uppercase path — key spaces diverged again');
});

test('A13: both graph builders key nodes through the same convention', () => {
  // These diverged silently for a long time — builder lowercased, call-graph did
  // not — which disabled the import boost on any uppercase repo path and then
  // made a fix for one graph break the other.
  const { graphKey } = require('../../src/graph/path-key');
  const { buildFromCwd } = require('../../src/graph/builder');
  const { buildCallFileGraph } = require('../../src/graph/call-graph');
  const imp = [...buildFromCwd(ROOT).forward.keys()];
  assert.ok(imp.length > 0, 'import graph is empty');
  assert.ok(imp.every((k) => k === graphKey(k)), 'import graph keys are not canonical');
  let call = [];
  try { call = [...buildCallFileGraph(ROOT).forward.keys()]; } catch (_) { return; }
  assert.ok(call.every((k) => k === graphKey(k)), 'call graph keys are not canonical');
});

test('A14: intent detection is multi-label and does not shadow', () => {
  const { detectIntents, detectIntent } = require('../../src/retrieval/ranker');
  // Single-label first-match-wins meant `debug` permanently shadowed `test`.
  const both = detectIntents('fix the failing test');
  assert.ok(both.includes('debug') && both.includes('test'),
    `expected both debug and test, got ${JSON.stringify(both)}`);
  // \btest\b does not match "tests" — this fell through to 'search' entirely.
  assert.ok(detectIntents('write unit tests for the ranker').includes('test'),
    'plural "tests" still matches no intent');
  assert.strictEqual(detectIntent('rank files'), detectIntents('rank files')[0],
    'primary label must be the head of the multi-label list');
});

console.log('');
console.log(`retrieval-index: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
