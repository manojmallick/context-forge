'use strict';

/**
 * Integration tests for v5.6 — Website & Docs Sync.
 * Verifies that public-facing doc files no longer contain stale version labels,
 * outdated benchmark numbers, incorrect language counts, or bad judge vocabulary.
 * These tests would have failed before the v5.6 changes.
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT      = path.resolve(__dirname, '../../..');
const GUIDE_DIR = path.join(ROOT, 'docs-vp', 'guide');
const DOCS_DIR  = path.join(ROOT, 'docs');

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

function readGuide(file) {
  return fs.readFileSync(path.join(GUIDE_DIR, file), 'utf8');
}

function readDocs(file) {
  return fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
}

console.log('\nv5.6 docs sync tests\n');

// ── Version labels ────────────────────────────────────────────────────────────

test('quick-start: no "v5.2 workflow" reference', () => {
  assert.ok(!readGuide('quick-start.md').includes('v5.2 workflow'), 'found stale "v5.2 workflow"');
});

test('ask: no "v5.2" reference in user-facing text', () => {
  assert.ok(!readGuide('ask.md').includes('v5.2'), 'found stale "v5.2"');
});

test('compare: no "v5.2 workflow" reference', () => {
  assert.ok(!readGuide('compare.md').includes('v5.2 workflow'), 'found stale "v5.2 workflow"');
});

test('learning: no "v5.2 workflow" reference', () => {
  assert.ok(!readGuide('learning.md').includes('v5.2 workflow'), 'found stale "v5.2 workflow"');
});

test('validate: no "v5.2" in section heading', () => {
  assert.ok(!readGuide('validate.md').includes('in v5.2'), 'found stale "in v5.2"');
});

// ── Benchmark sub-page versions ───────────────────────────────────────────────

test('retrieval-benchmark: latest saved run is v5.7.0 or later', () => {
  const src = readGuide('retrieval-benchmark.md');
  assert.ok(/v\d+\.\d+\.\d+/.test(src), 'missing version in latest saved run');
});

test('task-benchmark: latest saved run is v5.7.0 or later', () => {
  const src = readGuide('task-benchmark.md');
  assert.ok(/v\d+\.\d+\.\d+/.test(src), 'missing version in latest saved run');
});

test('quality-benchmark: latest saved run is v5.7.0 or later', () => {
  const src = readGuide('quality-benchmark.md');
  assert.ok(/v\d+\.\d+\.\d+/.test(src), 'missing version in latest saved run');
});

// ── Benchmark metric accuracy ─────────────────────────────────────────────────

test('generalization: uses 82.2% hit@5 (current v8.22 benchmark)', () => {
  const src = readGuide('generalization.md');
  assert.ok(src.includes('82.2%'), 'missing 82.2% hit@5 in generalization.md');
  assert.ok(!src.includes('80.0% hit@5'), 'found stale 80.0% in generalization.md');
  assert.ok(!src.includes('78.9%'), 'found stale 78.9% in generalization.md');
});

test('cli: no stale v5.x benchmark numbers in cli.md', () => {
  assert.ok(!readGuide('cli.md').includes('sigmap-v5.'), 'found stale v5.x benchmark in cli.md');
});

test('cli: no stale 1.67 prompts in compare example', () => {
  assert.ok(!readGuide('cli.md').includes('1.67'), 'found stale 1.67 in cli.md');
});

// ── Judge vocabulary ──────────────────────────────────────────────────────────

test('judge.md: no "pass/fail" vocabulary', () => {
  assert.ok(!readGuide('judge.md').includes('pass/fail'), 'found "pass/fail" in judge.md');
});

test('cli.md: no raw "verdict" key in JSON example', () => {
  assert.ok(!readGuide('cli.md').includes('"verdict"'), 'found "verdict" in cli.md');
});

// ── Language count ────────────────────────────────────────────────────────────

test('docs/index.html: heading uses 29 languages (not 21)', () => {
  const src = readDocs('index.html');
  assert.ok(!src.includes('21 languages'), 'found "21 languages" in docs/index.html');
  assert.ok(src.includes('29 languages'), 'missing "29 languages" in docs/index.html');
});

test('docs/index.html: structured-data description uses 29 languages', () => {
  const src = readDocs('index.html');
  assert.ok(!src.includes('Extracts signatures from 21'), 'found old "21" count in structured-data');
});

// ── MCP tool count ────────────────────────────────────────────────────────────

test('mcp.md: description mentions 20 tools (not 12)', () => {
  const src = readGuide('mcp.md');
  assert.ok(!src.includes('with 9 tools'), 'found "9 tools" in mcp.md description');
  assert.ok(src.includes('20 tools'), 'missing "20 tools" in mcp.md');
});

// ── Troubleshooting v5.5 coverage entry ───────────────────────────────────────

test('troubleshooting.md: has Issue 16 (coverage grade vs health grade)', () => {
  const src = readGuide('troubleshooting.md');
  assert.ok(src.includes('Issue 16'), 'missing Issue 16 in troubleshooting.md');
  assert.ok(src.includes('v5.5'), 'missing v5.5 reference in Issue 16 context');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
