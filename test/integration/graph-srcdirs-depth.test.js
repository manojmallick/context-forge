'use strict';

/**
 * Regression tests for the dependency-graph walk (#560).
 *
 * `buildFromCwd` hard-coded both the source directory list and the walk depth,
 * so the graph came out empty on any repo whose sources do not sit under
 * src/app/lib (every Maven/Gradle module), and the deepest packages were
 * dropped even when the right directories were walked.
 *
 * Each acceptance criterion gets a test that fails against the pre-fix code.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const {
  buildFromCwd, _configuredSrcDirs, DEFAULT_SRC_DIRS, DEFAULT_WALK_DEPTH,
} = require('../../src/graph/builder');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); failed++; }
}

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-graph-'));
}
function write(root, rel, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return abs;
}
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });
const nodes = (g) => [...g.reverse.keys()];
const findNode = (g, name) => nodes(g).find((k) => k.toLowerCase().includes(name.toLowerCase()));
const importersOf = (g, name) => {
  const k = findNode(g, name);
  return k ? (g.reverse.get(k) || []) : null;
};

/** A Maven module whose sources sit 9 directories below the module root. */
function mavenFixture(root) {
  const pkg = 'app-core/src/main/java/com/example/app/core/service';
  write(root, `${pkg}/PaymentService.java`,
    'package com.example.app.core.service;\npublic interface PaymentService { void charge(); }\n');
  write(root, `${pkg}/impl/PaymentServiceImpl.java`,
    'package com.example.app.core.service.impl;\n' +
    'import com.example.app.core.service.PaymentService;\n' +
    'public class PaymentServiceImpl implements PaymentService { public void charge() {} }\n');
  fs.writeFileSync(path.join(root, 'gen-context.config.json'),
    JSON.stringify({ srcDirs: ['app-core'] }, null, 2));
}

// ---------------------------------------------------------------------------
// srcDirs resolution
// ---------------------------------------------------------------------------

test('srcDirs are read from gen-context.config.json when opts omits them', () => {
  const root = tmpRepo();
  mavenFixture(root);
  const g = buildFromCwd(root);
  assert.ok(nodes(g).length > 0, 'graph must not be empty on a Maven-shaped repo');
  assert.ok(findNode(g, 'PaymentService.java'), 'the interface must be indexed');
  rm(root);
});

test('explicit opts.srcDirs still wins over the config file', () => {
  const root = tmpRepo();
  mavenFixture(root);
  write(root, 'other/Thing.java', 'package other;\npublic class Thing {}\n');
  const g = buildFromCwd(root, { srcDirs: ['other'] });
  assert.ok(findNode(g, 'Thing.java'), 'the explicitly requested dir must be walked');
  assert.ok(!findNode(g, 'PaymentService.java'), 'the config dir must not be walked when opts override');
  rm(root);
});

test('with no config and no opts the historical defaults are unchanged', () => {
  const root = tmpRepo();
  write(root, 'src/a.js', "const b = require('./b');\n");
  write(root, 'src/b.js', 'module.exports = {};\n');
  assert.strictEqual(_configuredSrcDirs(root), null, 'no config → null');
  const g = buildFromCwd(root);
  assert.ok(findNode(g, 'a.js') && findNode(g, 'b.js'), 'src/ must still be walked by default');
  assert.ok(DEFAULT_SRC_DIRS.includes('src'), 'default list must still contain src');
  rm(root);
});

test('an unparsable config falls back to the defaults instead of throwing', () => {
  const root = tmpRepo();
  write(root, 'src/a.js', 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'gen-context.config.json'), '{ not json');
  assert.strictEqual(_configuredSrcDirs(root), null);
  assert.doesNotThrow(() => buildFromCwd(root));
  rm(root);
});

// ---------------------------------------------------------------------------
// Walk depth
// ---------------------------------------------------------------------------

test('files deeper than the old 8-directory ceiling are indexed', () => {
  const root = tmpRepo();
  mavenFixture(root);
  const g = buildFromCwd(root);
  const impl = findNode(g, 'PaymentServiceImpl.java');
  assert.ok(impl, 'a file 9 directories below the srcDir root must be indexed');
  rm(root);
});

test('maxDepth is honoured when supplied', () => {
  const root = tmpRepo();
  mavenFixture(root);
  const shallow = buildFromCwd(root, { maxDepth: 2 });
  assert.ok(!findNode(shallow, 'PaymentService.java'), 'a tight maxDepth must exclude deep files');
  assert.ok(DEFAULT_WALK_DEPTH > 8, 'the default must clear a standard Maven tree');
  rm(root);
});

// ---------------------------------------------------------------------------
// End to end: the reason this matters
// ---------------------------------------------------------------------------

test('Java package imports resolve to real importers', () => {
  const root = tmpRepo();
  mavenFixture(root);
  const g = buildFromCwd(root);
  const imps = importersOf(g, 'PaymentService.java');
  assert.ok(imps, 'the imported interface must be a graph node');
  assert.strictEqual(imps.length, 1, `expected 1 importer, got ${imps.length}`);
  assert.ok(imps[0].toLowerCase().includes('paymentserviceimpl'), 'the impl must be recorded as the importer');
  rm(root);
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
