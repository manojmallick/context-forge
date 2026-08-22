'use strict';

/**
 * #532 — Python absolute imports resolve through ANY ancestor source root,
 * not just the importing file's dir + one parent. A silent zero-importer
 * result from get_impact is a false "safe to change" signal.
 * Run: node test/integration/py-absolute-imports.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const { buildFromCwd } = require(path.join(ROOT, 'src/graph/builder.js'));
const { analyzeImpact } = require(path.join(ROOT, 'src/graph/impact.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-py532-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}
const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const importersOf = (graph, needle) => {
  for (const [k, v] of graph.reverse) if (k.includes(needle)) return v;
  return [];
};

test('issue repro: src/ layout, importer two levels below the source root', () => {
  const dir = repo({
    'src/a/b/target.py': 'def hello():\n    return 1\n',
    'src/a/b/consumer.py': 'from a.b.target import hello\n\ndef use():\n    return hello()\n',
  });
  const importers = importersOf(buildFromCwd(dir), 'target.py');
  assert.strictEqual(importers.length, 1, `expected 1 importer, got ${importers.length}`);
  assert.ok(importers[0].endsWith('consumer.py'));
  rm(dir);
});

test('deeper nesting and package __init__ imports resolve through the root', () => {
  const dir = repo({
    'src/pkg/sub/deep/leaf.py': 'from pkg.util.helpers import fmt\n',
    'src/pkg/util/helpers.py': 'def fmt(x):\n    return x\n',
    'src/pkg/other/importer.py': 'from pkg.util import helpers\n',
    'src/pkg/util/__init__.py': '',
  });
  const g = buildFromCwd(dir);
  const helperImporters = importersOf(g, 'helpers.py');
  assert.ok(helperImporters.some((f) => f.endsWith('leaf.py')), 'deep leaf import missing');
  const initImporters = importersOf(g, path.join('util', '__init__.py'));
  assert.ok(initImporters.some((f) => f.endsWith('importer.py')), 'package __init__ import missing');
  rm(dir);
});

test('nearest-first: a same-dir module still wins over a root-level name clash', () => {
  const dir = repo({
    'src/app/config.py': 'VALUE = 1\n',
    'config.py': 'VALUE = 2\n',
    'src/app/main.py': 'from config import VALUE\n',
  });
  const g = buildFromCwd(dir);
  let mainDeps = [];
  for (const [k, v] of g.forward) if (k.endsWith('main.py')) mainDeps = v;
  assert.strictEqual(mainDeps.length, 1);
  assert.ok(mainDeps[0].includes(path.join('app', 'config.py').replace(/\\/g, '/')) || mainDeps[0].includes('app'), `nearest module must win: ${mainDeps[0]}`);
  rm(dir);
});

test('get_impact no longer reports zero importers for the repro layout', () => {
  const dir = repo({
    'src/a/b/target.py': 'def hello():\n    return 1\n',
    'src/a/b/consumer.py': 'from a.b.target import hello\n',
  });
  const res = analyzeImpact([path.join('src', 'a', 'b', 'target.py')], dir, {});
  const direct = res[0] && res[0].impact ? (res[0].impact.direct || []) : [];
  assert.ok(direct.some((f) => String(f).includes('consumer.py')), `consumer.py missing from impact: ${JSON.stringify(res[0] && res[0].impact)}`);
  rm(dir);
});

console.log(`\n  py-absolute-imports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
