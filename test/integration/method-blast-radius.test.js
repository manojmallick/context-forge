'use strict';

/**
 * Integration tests for method-level blast-radius scoring (GR2, #468).
 *
 * Covers: the deterministic scorer (src/graph/blast-radius.js), review-pr
 * wiring (methodBlast field + method-blast finding), the PR Evidence
 * markdown line, the get_method_impact MCP handler, and graceful degradation
 * when no call graph resolves.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const { methodBlastRadius, tierFor } = require('../../src/graph/blast-radius');
const { reviewPr } = require('../../src/review/review-pr');
const { buildPrEvidence, formatPrEvidenceMarkdown } = require('../../src/review/pr-evidence');
const { getMethodImpact } = require('../../src/mcp/handlers');
const { TOOLS } = require('../../src/mcp/tools');

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

/**
 * Fixture: src/util.js defines helper(); eight caller files each require it
 * and call it (direct callers = 8 → score 32 → tier high); src/leaf.js calls
 * nothing and is called by nothing.
 */
function withProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-blast-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'util.js'), [
      'function helper(x) {',
      '  return x + 1;',
      '}',
      'module.exports = { helper };',
      '',
    ].join('\n'));
    for (let i = 1; i <= 8; i++) {
      fs.writeFileSync(path.join(dir, 'src', `caller${i}.js`), [
        "const { helper } = require('./util');",
        `function useHelper${i}(v) {`,
        '  return helper(v);',
        '}',
        `module.exports = { useHelper${i} };`,
        '',
      ].join('\n'));
    }
    fs.writeFileSync(path.join(dir, 'src', 'leaf.js'), [
      'function lonely() {',
      '  return 42;',
      '}',
      'module.exports = { lonely };',
      '',
    ].join('\n'));
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── scorer ──────────────────────────────────────────────────────────────────

test('tierFor maps the documented thresholds', () => {
  assert.strictEqual(tierFor(0), 'none');
  assert.strictEqual(tierFor(1), 'low');
  assert.strictEqual(tierFor(10), 'medium');
  assert.strictEqual(tierFor(30), 'high');
  assert.strictEqual(tierFor(60), 'critical');
  assert.strictEqual(tierFor(100), 'critical');
});

test('methodBlastRadius scores a high-fan-in file and skips the leaf', () => {
  withProject((dir) => {
    const r = methodBlastRadius(['src/util.js', 'src/leaf.js'], dir);
    assert.strictEqual(r.available, true);
    const util = r.files.find((f) => f.file === 'src/util.js');
    assert.ok(util, 'util.js missing from result');
    assert.strictEqual(util.directCallers, 8, `direct=${util.directCallers}`);
    assert.strictEqual(util.score, 32);
    assert.strictEqual(util.tier, 'high');
    const leaf = r.files.find((f) => f.file === 'src/leaf.js');
    assert.ok(leaf, 'leaf.js missing');
    assert.strictEqual(leaf.score, 0);
    assert.strictEqual(leaf.tier, 'none');
    assert.strictEqual(r.aggregate.tier, 'high');
  });
});

test('methodBlastRadius is deterministic (two runs deep-equal)', () => {
  withProject((dir) => {
    const a = methodBlastRadius(['src/util.js'], dir);
    const b = methodBlastRadius(['src/util.js'], dir);
    assert.deepStrictEqual(a, b);
  });
});

test('methodBlastRadius degrades gracefully on an empty dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-blast-empty-'));
  try {
    const r = methodBlastRadius(['src/nothing.js'], dir);
    assert.strictEqual(r.available, false);
    assert.deepStrictEqual(r.files, []);
    assert.strictEqual(r.aggregate.tier, 'none');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── review-pr wiring ────────────────────────────────────────────────────────

test('reviewPr attaches methodBlast and emits a method-blast finding for high tier', () => {
  withProject((dir) => {
    const r = reviewPr(['src/util.js'], dir);
    assert.ok(r.methodBlast && r.methodBlast.available, 'methodBlast missing');
    const finding = r.findings.find((f) => f.type === 'method-blast');
    assert.ok(finding, 'method-blast finding missing');
    assert.strictEqual(finding.file, 'src/util.js');
    assert.strictEqual(finding.tier, 'high');
    assert.strictEqual(finding.functions, 8);
  });
});

test('reviewPr emits no method-blast finding for a leaf change', () => {
  withProject((dir) => {
    const r = reviewPr(['src/leaf.js'], dir);
    assert.ok(!r.findings.some((f) => f.type === 'method-blast'), 'unexpected finding');
  });
});

// ── PR Evidence markdown ────────────────────────────────────────────────────

test('PR Evidence markdown carries the Method blast radius line (and not for leaf)', () => {
  withProject((dir) => {
    const evidence = buildPrEvidence(['src/util.js', 'src/leaf.js'], dir);
    const md = formatPrEvidenceMarkdown(evidence);
    assert.ok(md.includes('**Method blast radius:** 8 function(s) impacted (score 32/100, high)'), md.split('\n').find((l) => l.includes('Method blast')));
    assert.ok(md.includes('method blast radius high'), 'findings line missing');
    const leafSection = md.split('#### `src/leaf.js`')[1] || '';
    assert.ok(!leafSection.split('####')[0].includes('Method blast radius'), 'leaf should have no method-blast line');
  });
});

// ── MCP tool ────────────────────────────────────────────────────────────────

test('get_method_impact resolves callers of a symbol', () => {
  withProject((dir) => {
    const text = getMethodImpact({ symbol: 'helper' }, dir);
    assert.ok(text.includes('Callers: `helper`'), text.slice(0, 80));
    assert.ok(text.includes('**Total callers of:** 8'), text);
    assert.ok(text.includes('src/caller1.js#useHelper1'), text);
  });
});

test('get_method_impact direction callees + unknown symbol + missing arg', () => {
  withProject((dir) => {
    const callees = getMethodImpact({ symbol: 'useHelper1', direction: 'callees' }, dir);
    assert.ok(callees.includes('Callees: `useHelper1`') && callees.includes('src/util.js#helper'), callees);
    const unknown = getMethodImpact({ symbol: 'noSuchFn999' }, dir);
    assert.ok(unknown.includes('not found in the call-graph'), unknown);
    assert.strictEqual(getMethodImpact({}, dir), 'Missing required argument: symbol');
  });
});

test('get_method_impact is registered as the 20th MCP tool', () => {
  assert.strictEqual(TOOLS.length, 21, `expected 21 tools, got ${TOOLS.length}`);
  const tool = TOOLS.find((t) => t.name === 'get_method_impact');
  assert.ok(tool, 'tool definition missing');
  assert.deepStrictEqual(tool.inputSchema.required, ['symbol']);
});

console.log(`\nmethod-blast-radius: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
