'use strict';

/**
 * Shared balanced scanner + JS/TS migration (G4 increment 1, #526).
 * Run: node test/integration/scan-core.test.js
 */

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const { stripComments, maskCode, readBalanced } = require(path.join(ROOT, 'src/extractors/scan.js'));
const js = require(path.join(ROOT, 'src/extractors/javascript.js'));
const ts = require(path.join(ROOT, 'src/extractors/typescript.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

// ── scan.js unit ────────────────────────────────────────────────────────────

test('stripComments: blanks comments, preserves strings containing // and /*', () => {
  const src = 'const u = "https://x.dev"; // note\nconst v = \'/* keep */\'; /* gone */';
  const out = stripComments(src);
  assert.strictEqual(out.length, src.length, 'length must be preserved');
  assert.ok(out.includes('"https://x.dev"'), 'string with // corrupted');
  assert.ok(out.includes("'/* keep */'"), 'string with /* corrupted');
  assert.ok(!out.includes('// note') && !out.includes('/* gone */'), 'comments survived');
});

test('maskCode: blanks strings AND comments, length/newline-preserving', () => {
  const src = 'f("a)b", `x${y}`) // c\ng()';
  const out = maskCode(src);
  assert.strictEqual(out.length, src.length);
  assert.strictEqual((out.match(/\n/g) || []).length, (src.match(/\n/g) || []).length);
  assert.ok(!out.includes('a)b'), 'string content survived masking');
  assert.strictEqual(out.indexOf('\n'), src.indexOf('\n'));
});

test('readBalanced: nesting, masked strings, and the cap', () => {
  const masked = maskCode('f(a, g(h(x)), s = ")")');
  assert.strictEqual(readBalanced(masked, 1), masked.length - 1, 'nested + string-paren close wrong');
  assert.strictEqual(readBalanced(masked, 0), -1, 'non-open index must return -1');
  assert.strictEqual(readBalanced(maskCode('f(a'), 1), -1, 'unbalanced must return -1');
  assert.strictEqual(readBalanced(maskCode('f(' + 'x'.repeat(5000) + ')'), 1, '(', ')', 100), -1, 'cap must bound the scan');
});

// ── JS extraction ───────────────────────────────────────────────────────────

test('JS: nested-call defaults and string-paren defaults capture fully', () => {
  const sigs = js.extract('export function charge(a, b = g(x), c = ")") { return a; }\n');
  assert.ok(sigs.find((s) => s.includes('charge(a, b = g(x), c = ")")')), sigs.join('\n'));
});

test('JS: string defaults with // survive (comment-strip corruption fixed)', () => {
  const sigs = js.extract("function fetchIt(url = 'https://x.dev/a') { return url; }\n");
  assert.ok(sigs.find((s) => s.includes("fetchIt(url = 'https://x.dev/a')")), sigs.join('\n'));
});

test('JS: class member with nested parens; control keywords never become members', () => {
  const src = 'class P {\n  process(order, retries = calc(3, f(2))) {\n    if (order) { return order; }\n  }\n}\n';
  const sigs = js.extract(src);
  assert.ok(sigs.find((s) => s.includes('process(order, retries = calc(3, f(2)))')), sigs.join('\n'));
  assert.ok(!sigs.find((s) => /\bif\s*\(/.test(s)), 'control keyword leaked as member');
});

test('JS: destructuring braces in params do not break body anchors', () => {
  const src = 'export function init({ a, b }, [c]) {\n  return a;\n}\n';
  const sig = js.extract(src).find((s) => s.includes('init('));
  assert.ok(sig.includes('init({ a, b }, [c])'), sig);
  assert.ok(/:1-3/.test(sig), `anchor should span the body: ${sig}`);
});

// ── TS extraction ───────────────────────────────────────────────────────────

test('TS: nested function types in params strip cleanly; return type intact', () => {
  const sigs = ts.extract('export function retryOp(cb: (x: number) => void, m: Map<string, string[]> = new Map()): Promise<void> { return run(cb); }\n');
  const sig = sigs.find((s) => s.includes('retryOp'));
  assert.ok(sig.includes('retryOp(cb, m = new Map())'), sig);
  assert.ok(sig.includes('→ Promise<void>'), sig);
});

test('TS: string default with URL survives type stripping', () => {
  const sigs = ts.extract("class Api {\n  fetch(url = 'https://x.dev', init: RequestInit = {}) { return url; }\n}\n");
  assert.ok(sigs.find((s) => s.includes("fetch(url = 'https://x.dev', init = {})")), sigs.join('\n'));
});

test('TS: interface method with nested fn-type params captures fully', () => {
  const sigs = ts.extract('export interface Store {\n  get(key: string, fallback: (k: string) => string): string;\n}\n');
  assert.ok(sigs.find((s) => s.includes('get(key, fallback)')), sigs.join('\n'));
});

test('TS: arrow const with nested-call default is extracted (was skipped before)', () => {
  const sigs = ts.extract('export const search = (q: string, filter = mk(1, f(2))): R => doIt(q);\n');
  assert.ok(sigs.find((s) => s.includes('search = (q, filter = mk(1, f(2))) =>')), sigs.join('\n'));
});

// ── byte-identical-or-better sanity ─────────────────────────────────────────

test('simple signatures unchanged: params, doc hints, anchors byte-stable', () => {
  const src = '/**\n * Adds two numbers.\n * @returns {number}\n */\nexport function add(a, b) { return a + b; }\n';
  const sig = js.extract(src).find((s) => s.includes('add'));
  assert.strictEqual(sig, 'export function add(a, b) → number  :5-5  # Adds two numbers');
});

console.log(`\n  scan-core: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
