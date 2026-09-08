'use strict';

/**
 * Spring interface → implementation resolution (#564).
 *
 * After #562 a Spring call site resolves to the interface method, which is what
 * the source names. But blast radius on the class that owns the code was empty,
 * so an implementation looked safe to change. These tests cover the added hop
 * and, just as importantly, that ambiguous polymorphism is NOT guessed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const { buildCallGraph, javaTypeDecl, maskJs } = require('../../src/graph/call-graph');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); failed++; }
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-spring-'));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });
function write(root, rel, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}
const callersOf = (g, sub) => {
  const id = [...g.defs.keys()].find((k) => k.includes(sub));
  return id ? (g.reverse.get(id) || []) : null;
};

const BASE = 'app/src/main/java/com/example/app';

/** Controller → interface, with `impls` implementations of that interface. */
function springFixture(root, impls) {
  write(root, `${BASE}/service/PaymentService.java`,
    'package com.example.app.service;\npublic interface PaymentService {\n    void chargeCard(String id);\n}\n');
  for (const { name, annotations = '@Service' } of impls) {
    write(root, `${BASE}/service/impl/${name}.java`,
      'package com.example.app.service.impl;\n' +
      'import com.example.app.service.PaymentService;\n' +
      `${annotations}\npublic class ${name} implements PaymentService {\n` +
      '    public void chargeCard(String id) { }\n}\n');
  }
  write(root, `${BASE}/controller/PaymentController.java`,
    'package com.example.app.controller;\n' +
    'import com.example.app.service.PaymentService;\n' +
    'public class PaymentController {\n' +
    '    private PaymentService paymentService;\n' +
    '    public void handleRequest() {\n        paymentService.chargeCard("x");\n    }\n}\n');
  fs.writeFileSync(path.join(root, 'gen-context.config.json'), JSON.stringify({ srcDirs: ['app'] }));
}

// ---------------------------------------------------------------------------
// Type declaration extraction
// ---------------------------------------------------------------------------

test('implements and extends are extracted', () => {
  const d = javaTypeDecl(maskJs('public class P extends Base implements I, J {'));
  assert.ok(d.supers.includes('I') && d.supers.includes('J') && d.supers.includes('Base'));
});

test('generic arguments are stripped, not mistaken for interfaces', () => {
  const d = javaTypeDecl(maskJs('public class V implements ConstraintValidator<FlagValidator, Integer>, Other {'));
  assert.deepStrictEqual(d.supers, ['ConstraintValidator', 'Other'],
    `generic args must not leak into the list; got ${JSON.stringify(d.supers)}`);
});

test('a package-qualified supertype is reduced to its simple name', () => {
  const d = javaTypeDecl(maskJs('public class A implements com.example.other.Thing {'));
  assert.deepStrictEqual(d.supers, ['Thing']);
});

test('Spring bean and @Primary annotations are detected', () => {
  assert.strictEqual(javaTypeDecl(maskJs('@Service\npublic class A implements I {')).isBean, true);
  assert.strictEqual(javaTypeDecl(maskJs('@Primary\n@Service\npublic class A implements I {')).isPrimary, true);
  assert.strictEqual(javaTypeDecl(maskJs('public class A implements I {')).isBean, false);
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

test('a single implementation receives the caller', () => {
  const root = tmp(); springFixture(root, [{ name: 'PaymentServiceImpl' }]);
  const g = buildCallGraph(root);
  const c = callersOf(g, 'PaymentServiceImpl.java#chargeCard');
  assert.ok(c && c.length === 1, `impl must have the controller as a caller; got ${JSON.stringify(c)}`);
  assert.ok(c[0].includes('PaymentController'), c[0]);
  rm(root);
});

test('the interface edge from #562 is retained', () => {
  const root = tmp(); springFixture(root, [{ name: 'PaymentServiceImpl' }]);
  const g = buildCallGraph(root);
  const c = callersOf(g, 'PaymentService.java#chargeCard');
  assert.ok(c && c.length === 1, 'the source really does name the interface — that edge stays');
  rm(root);
});

test('several implementations with no @Primary produce NO impl edge', () => {
  const root = tmp();
  springFixture(root, [{ name: 'CardPaymentImpl' }, { name: 'MockPaymentImpl' }]);
  const g = buildCallGraph(root);
  for (const n of ['CardPaymentImpl.java#chargeCard', 'MockPaymentImpl.java#chargeCard']) {
    const c = callersOf(g, n);
    assert.ok(!c || c.length === 0, `ambiguous polymorphism must not be guessed: ${n} got ${JSON.stringify(c)}`);
  }
  assert.ok(callersOf(g, 'PaymentService.java#chargeCard').length === 1, 'the interface edge still holds');
  rm(root);
});

test('@Primary disambiguates several implementations', () => {
  const root = tmp();
  springFixture(root, [
    { name: 'CardPaymentImpl', annotations: '@Primary\n@Service' },
    { name: 'MockPaymentImpl' },
  ]);
  const g = buildCallGraph(root);
  const primary = callersOf(g, 'CardPaymentImpl.java#chargeCard');
  const other = callersOf(g, 'MockPaymentImpl.java#chargeCard');
  assert.ok(primary && primary.length === 1, '@Primary must win');
  assert.ok(!other || other.length === 0, 'the non-primary impl must not receive the edge');
  rm(root);
});

test('resolved implementation edges carry a confidence label', () => {
  const root = tmp(); springFixture(root, [{ name: 'PaymentServiceImpl' }]);
  const g = buildCallGraph(root);
  for (const v of g.edgeConfidence.values()) assert.ok(['high', 'medium'].includes(v), v);
  rm(root);
});

test('JS behaviour is unchanged', () => {
  const root = tmp();
  write(root, 'src/a.js', "const { helper } = require('./b');\nfunction run() { helper(); }\n");
  write(root, 'src/b.js', 'function helper() {}\nmodule.exports = { helper };\n');
  const g = buildCallGraph(root, { srcDirs: ['src'] });
  assert.ok(callersOf(g, 'b.js#helper').length === 1, 'JS edges must be unaffected');
  rm(root);
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
