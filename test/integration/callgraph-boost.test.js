'use strict';

/**
 * Integration tests for the call-graph ranking boost (#474, opt-in).
 *
 * Covers: file-level edge derivation (bidirectional, deterministic, present
 * where the import graph has no edge — Go same-package), the rank() boost and
 * its isolation (default-off output unchanged), and the config-gated wiring
 * through the --query CLI path.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawnSync } = require('child_process');

const GEN_CONTEXT = path.resolve(__dirname, '../../gen-context.js');
const { buildCallFileGraph } = require('../../src/graph/call-graph');
const { graphKey } = require('../../src/graph/path-key');
const { buildFromCwd } = require('../../src/graph/builder');
const { rank, buildSigIndex } = require('../../src/retrieval/ranker');

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

/** Go same-package fixture: app.go calls util.go's Helper with NO import. */
function withGoProject(fn, config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-cgboost-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'util.go'),
      'package main\n\nfunc Helper(x int) int {\n\treturn x + 1\n}\n');
    fs.writeFileSync(path.join(dir, 'src', 'app.go'),
      'package main\n\nfunc RunServer(port int) int {\n\treturn Helper(port)\n}\n');
    if (config) {
      fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify(config, null, 2));
    }
    const gen = spawnSync(process.execPath, [GEN_CONTEXT], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(gen.status, 0, gen.stderr);
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── edge derivation ─────────────────────────────────────────────────────────

test('buildCallFileGraph: bidirectional file edge where the import graph has none', () => {
  withGoProject((dir) => {
    const cg = buildCallFileGraph(dir);
    // Both graphs key nodes through the one shared convention (src/graph/path-key.js).
    // This used to read cg.forward.get(<case-preserving path>) and ig.forward.get(x)
    // || ig.forward.get(x.toLowerCase()) — a dual probe on one graph only, which is
    // what a silent divergence between two builders looks like from the test side.
    const app = graphKey(path.resolve(dir, 'src/app.go'));
    const util = graphKey(path.resolve(dir, 'src/util.go'));
    assert.deepStrictEqual(cg.forward.get(app), [util], 'app→util edge missing');
    assert.deepStrictEqual(cg.forward.get(util), [app], 'util→app (reverse) edge missing');
    const ig = buildFromCwd(dir);
    const igNeighbors = ig.forward.get(app) || [];
    assert.strictEqual(igNeighbors.length, 0, 'import graph unexpectedly has the edge — fixture invalid');
  });
});

test('buildCallFileGraph is deterministic across runs', () => {
  withGoProject((dir) => {
    const a = buildCallFileGraph(dir);
    const b = buildCallFileGraph(dir);
    assert.deepStrictEqual([...a.forward.entries()], [...b.forward.entries()]);
  });
});

// ── rank() boost + isolation ────────────────────────────────────────────────

test('rank(): callGraph boosts the call-connected sibling; without it, no boost', () => {
  withGoProject((dir) => {
    const index = buildSigIndex(dir);
    const query = 'run server port';
    const plain = rank(query, index, { topK: 5, cwd: dir });
    const utilPlain = plain.find((r) => r.file.endsWith('util.go'));
    assert.ok(utilPlain, 'util.go missing from results');
    assert.strictEqual(utilPlain.signals.callGraphBoost, undefined, 'boost leaked into default path');

    const callGraph = buildCallFileGraph(dir);
    const boosted = rank(query, index, { topK: 5, cwd: dir, callGraph });
    const utilBoosted = boosted.find((r) => r.file.endsWith('util.go'));
    assert.ok(utilBoosted.signals.callGraphBoost > 0, 'callGraphBoost signal missing');
    assert.ok(utilBoosted.score > utilPlain.score, `score did not increase (${utilPlain.score} → ${utilBoosted.score})`);
  });
});

test('rank(): default-off output is unchanged (callGraph null === absent)', () => {
  withGoProject((dir) => {
    const index = buildSigIndex(dir);
    const query = 'run server port';
    const a = rank(query, index, { topK: 5, cwd: dir });
    const b = rank(query, index, { topK: 5, cwd: dir, callGraph: null });
    assert.deepStrictEqual(
      a.map((r) => [r.file, r.score]),
      b.map((r) => [r.file, r.score])
    );
  });
});

// ── config-gated CLI wiring ─────────────────────────────────────────────────

test('--query: callGraphBoost signal appears only when retrieval.callGraphBoost is on', () => {
  withGoProject((dir) => {
    const off = spawnSync(process.execPath, [GEN_CONTEXT, '--query', 'run server port', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(off.status, 0, off.stderr);
    assert.ok(!off.stdout.includes('callGraphBoost'), 'boost active without config');
  });
  withGoProject((dir) => {
    const on = spawnSync(process.execPath, [GEN_CONTEXT, '--query', 'run server port', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(on.status, 0, on.stderr);
    assert.ok(on.stdout.includes('callGraphBoost'), 'boost signal missing with config on');
  }, { retrieval: { callGraphBoost: true } });
});

console.log(`\ncallgraph-boost: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
