'use strict';

/**
 * Regression tests for Java receiver-typed call resolution (#562).
 *
 * `callsInRange` discarded every `receiver.method(` call — 58% of call sites in
 * a real Spring module — so controller→service edges did not exist. Plus
 * `buildCallGraph` carried its own copies of the srcDirs and depth caps fixed
 * for the dependency graph in #560.
 *
 * Fixtures use distinct caller/callee method names on purpose: when both share
 * a name, a bare-name lookup makes the caller a seed and `_bfs` filters it out
 * of its own result. That is pre-existing behaviour, not what these test.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const {
  buildCallGraph, buildTypeMap, receiverCallsInRange, extractDefs, maskJs, DEFAULT_WALK_DEPTH,
} = require('../../src/graph/call-graph');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); failed++; }
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-callgraph-'));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });
function write(root, rel, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}
const edgesOf = (g, sub) => {
  const id = [...g.forward.keys()].find((k) => k.includes(sub));
  return id ? (g.forward.get(id) || []) : [];
};

/** Spring-shaped module: controller → interface, impl 9 dirs deep. */
function springFixture(root, { typed = true } = {}) {
  const base = 'app-core/src/main/java/com/example/app/core';
  write(root, `${base}/service/PaymentService.java`,
    'package com.example.app.core.service;\n' +
    'public interface PaymentService {\n    void chargeCard(String id);\n}\n');
  write(root, `${base}/service/impl/PaymentServiceImpl.java`,
    'package com.example.app.core.service.impl;\n' +
    'import com.example.app.core.service.PaymentService;\n' +
    'public class PaymentServiceImpl implements PaymentService {\n' +
    '    public void chargeCard(String id) { }\n}\n');
  write(root, `${base}/controller/PaymentController.java`,
    'package com.example.app.core.controller;\n' +
    'import com.example.app.core.service.PaymentService;\n' +
    'public class PaymentController {\n' +
    (typed ? '    private PaymentService paymentService;\n' : '') +
    '    public void handleRequest() {\n        paymentService.chargeCard("x");\n    }\n}\n');
  fs.writeFileSync(path.join(root, 'gen-context.config.json'),
    JSON.stringify({ srcDirs: ['app-core'] }, null, 2));
}

// ---------------------------------------------------------------------------
// Extraction primitives
// ---------------------------------------------------------------------------

test('receiverCallsInRange captures receiver.method pairs', () => {
  const src = 'void f() { userService.authenticate(token); }';
  const got = receiverCallsInRange(maskJs(src), 0, src.length);
  assert.deepStrictEqual(got, [{ receiver: 'userService', method: 'authenticate' }]);
});

test('a chained or computed receiver is skipped, not guessed', () => {
  const src = 'void f() { a.b().c(); arr[0].d(); }';
  const got = receiverCallsInRange(maskJs(src), 0, src.length).map((x) => x.method);
  assert.ok(!got.includes('c'), 'chained call must not be resolved');
  assert.ok(!got.includes('d'), 'indexed receiver must not be resolved');
});

test('buildTypeMap reads field and local declarations', () => {
  const src = 'class C {\n  private UserService userService;\n  void f() { OrderRepo repo = null; }\n}';
  const tm = buildTypeMap(maskJs(src));
  assert.strictEqual(tm.get('userService'), 'UserService');
  assert.strictEqual(tm.get('repo'), 'OrderRepo');
});

test('interface method declarations are indexed as defs', () => {
  const src = 'public interface PaymentService {\n    void chargeCard(String id);\n}\n';
  const names = (extractDefs('PaymentService.java', src) || []).map((d) => d.name);
  assert.ok(names.includes('chargeCard'), 'a declaration must be a node so callers have a target');
});

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

test('srcDirs come from gen-context.config.json when opts omit them', () => {
  const root = tmp(); springFixture(root);
  const g = buildCallGraph(root);
  assert.ok(g.defs.size > 0, 'graph must not be empty on a Maven-shaped repo');
  rm(root);
});

test('files deeper than the old 8-directory ceiling are scanned', () => {
  const root = tmp(); springFixture(root);
  const g = buildCallGraph(root);
  const impl = [...g.defs.keys()].find((k) => k.includes('PaymentServiceImpl'));
  assert.ok(impl, 'a class 9 directories deep must be scanned');
  assert.ok(DEFAULT_WALK_DEPTH > 8, 'default depth must clear a Maven tree');
  rm(root);
});

test('receiver.method() produces an edge when the receiver type is declared', () => {
  const root = tmp(); springFixture(root);
  const g = buildCallGraph(root);
  const targets = edgesOf(g, 'PaymentController.java#handleRequest');
  assert.ok(targets.some((t) => t.includes('PaymentService.java#chargeCard')),
    `controller must call the service; got ${JSON.stringify(targets)}`);
  rm(root);
});

test('an undeclared receiver produces no edge — never a name-only guess', () => {
  const root = tmp(); springFixture(root, { typed: false });
  const g = buildCallGraph(root);
  const targets = edgesOf(g, 'PaymentController.java#handleRequest');
  assert.ok(!targets.some((t) => t.includes('chargeCard')),
    'without a declared type the edge must not be invented');
  rm(root);
});

test('resolved edges carry a confidence label', () => {
  const root = tmp(); springFixture(root);
  const g = buildCallGraph(root);
  assert.ok(g.edgeConfidence instanceof Map, 'edgeConfidence must be exposed');
  const vals = new Set(g.edgeConfidence.values());
  assert.ok(vals.size > 0, 'at least one labelled edge');
  for (const v of vals) assert.ok(['high', 'medium'].includes(v), `unexpected label: ${v}`);
  rm(root);
});

test('forward/reverse keep their existing shape (additive change)', () => {
  const root = tmp(); springFixture(root);
  const g = buildCallGraph(root);
  for (const v of g.forward.values()) assert.ok(Array.isArray(v), 'forward values stay arrays');
  rm(root);
});

// ---------------------------------------------------------------------------
// Other languages unaffected
// ---------------------------------------------------------------------------

test('JS edges are unchanged by receiver resolution', () => {
  const root = tmp();
  write(root, 'src/a.js', "const { helper } = require('./b');\nfunction run() { helper(); }\nmodule.exports = { run };\n");
  write(root, 'src/b.js', 'function helper() {}\nmodule.exports = { helper };\n');
  const g = buildCallGraph(root, { srcDirs: ['src'] });
  assert.ok(edgesOf(g, 'a.js#run').some((t) => t.includes('b.js#helper')), 'JS call edge must still resolve');
  rm(root);
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
