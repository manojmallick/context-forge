'use strict';

/**
 * Regression tests for the Java extractor's hard-coded caps (#551).
 *
 * Each acceptance criterion from the issue gets at least one test:
 *  - class members are no longer capped at 8, and omissions are disclosed
 *  - the per-file signature cap no longer shadows the configured maxSigsPerFile
 *  - class bodies larger than 5,000 chars are no longer truncated
 *
 * Every assertion below fails against the pre-fix implementation.
 */

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const { extract } = require(path.join(ROOT, 'src', 'extractors', 'java'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}

/**
 * A POJO with `count` getter/setter pairs, mimicking a generated entity.
 * `pad` grows each method body with real statements — not comments, which
 * `extract()` strips before scanning and which therefore would not exercise
 * the class-body scan cap at all.
 */
function entity(className, count, { pad = 0 } = {}) {
  const body = [];
  for (let i = 0; i < count; i++) {
    body.push(`    public String getField${i}() {`);
    if (pad) body.push(`        String pad${i} = "${'x'.repeat(pad)}";`);
    body.push(`        return field${i};`);
    body.push('    }');
    body.push(`    public void setField${i}(String field${i}) {`);
    body.push(`        this.field${i} = field${i};`);
    body.push('    }');
  }
  return `package com.example;\n\npublic class ${className} {\n${body.join('\n')}\n}\n`;
}

const memberText = (sigs) => sigs.filter((s) => s.startsWith('  '));

// ---------------------------------------------------------------------------
// 1. Member cap
// ---------------------------------------------------------------------------

test('class with more than 8 methods yields more than 8 signatures', () => {
  const sigs = extract(entity('Wide', 20));
  const members = memberText(sigs);
  assert.ok(members.length > 8, `expected >8 members, got ${members.length}`);
});

test('a method past the old 8-member cap is indexed with its own line anchor', () => {
  const sigs = extract(entity('Wide', 20));
  const late = sigs.find((s) => s.includes('setField19('));
  assert.ok(late, 'setField19 must be indexed (it is the 40th member)');
  assert.ok(/:\d+-\d+/.test(late), `member must carry a line anchor, got: ${late}`);
});

test('members beyond the ceiling are disclosed, not dropped silently', () => {
  const sigs = extract(entity('Huge', 200));
  const notice = sigs.find((s) => s.includes('more methods'));
  assert.ok(notice, 'a "… +N more methods" marker must disclose the omission');
  assert.ok(/\+\d+ more methods/.test(notice), `marker must state the count, got: ${notice}`);
});

// ---------------------------------------------------------------------------
// 2. Per-file signature cap
// ---------------------------------------------------------------------------

test('per-file output is not capped at the old hard-coded 25', () => {
  const sigs = extract(entity('Big', 40));
  assert.ok(sigs.length > 25, `expected >25 signatures, got ${sigs.length}`);
});

test('per-file omissions are disclosed when the ceiling is reached', () => {
  const sigs = extract(entity('Enormous', 400));
  const notice = sigs.find((s) => s.includes('more signatures') || s.includes('more methods'));
  assert.ok(notice, 'reaching the ceiling must append a disclosure marker');
});

// ---------------------------------------------------------------------------
// 3. Class-body scan cap
// ---------------------------------------------------------------------------

test('a class body larger than 5,000 chars is not truncated', () => {
  const src = entity('Fat', 30, { pad: 200 });
  assert.ok(src.length > 5000, 'fixture must exceed the old 5,000-char cap');
  const sigs = extract(src);
  const classSig = sigs.find((s) => s.startsWith('class Fat'));
  const [, end] = classSig.match(/:(\d+)-(\d+)/).slice(1).map(Number);
  const lastLine = src.trimEnd().split('\n').length;
  assert.ok(end >= lastLine - 1, `class span must reach the closing brace (${end} vs ${lastLine})`);
});

test('members declared past the 5,000-char mark are still extracted', () => {
  const sigs = extract(entity('Fat', 30, { pad: 200 }));
  assert.ok(sigs.find((s) => s.includes('setField29(')), 'trailing member must be indexed');
});

// ---------------------------------------------------------------------------
// 4. Existing behaviour preserved
// ---------------------------------------------------------------------------

test('small classes are unchanged (no marker, anchors intact)', () => {
  const sigs = extract(entity('Small', 2));
  assert.ok(!sigs.some((s) => s.includes('more methods')), 'no marker for a small class');
  assert.ok(sigs[0].startsWith('class Small'), 'class signature first');
  assert.strictEqual(memberText(sigs).length, 4, 'all four members present');
});

test('non-Java / empty input still returns an empty array', () => {
  assert.deepStrictEqual(extract(''), []);
  assert.deepStrictEqual(extract(null), []);
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
