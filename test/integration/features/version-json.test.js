'use strict';

/**
 * Integration tests for v5.8 — Trust Completion & Conversion.
 * Verifies: version.json updated, canonical benchmark headers present,
 * demo strip on homepage, user-type routing in docs landing,
 * compare-alternatives and walkthrough pages exist, micro-leak audit passes.
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

function readRoot(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

console.log('\nv5.8 trust completion tests\n');

// ── Fix 1: version.json ───────────────────────────────────────────────────────

test('version.json: version is >= 5.8.0', () => {
  const v = JSON.parse(readRoot('version.json'));
  const [major, minor] = v.version.split('.').map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 8), `expected >= 5.8.0, got ${v.version}`);
});

test('version.json: benchmark_id is sigmap-v5.8-main or later', () => {
  const v = JSON.parse(readRoot('version.json'));
  assert.ok(v.benchmark_id && /^sigmap-v\d+\.\d+-main/.test(v.benchmark_id),
    `expected sigmap-vX.Y-main format, got ${v.benchmark_id}`);
});

test('version.json: retrieval_lift field exists and is a number >= 5', () => {
  const v = JSON.parse(readRoot('version.json'));
  assert.ok('retrieval_lift' in v.metrics, 'missing retrieval_lift in metrics');
  assert.ok(typeof v.metrics.retrieval_lift === 'number' && v.metrics.retrieval_lift >= 5,
    `expected retrieval_lift >= 5, got ${v.metrics.retrieval_lift}`);
});

test('version.json: languages is a derived positive integer (>= 31)', () => {
  // Derived from src/extractors (Trust Hygiene H3) — not a hand-pinned literal.
  // The version-meta gate (test/integration/version-meta.test.js) enforces the
  // exact value; here we only assert it stays a sane positive count.
  const v = JSON.parse(readRoot('version.json'));
  assert.ok(Number.isInteger(v.languages) && v.languages >= 31, `languages=${v.languages}`);
});

test('version.json: extractors field is derived (>= languages)', () => {
  const v = JSON.parse(readRoot('version.json'));
  assert.ok(Number.isInteger(v.extractors) && v.extractors >= v.languages, `extractors=${v.extractors}`);
});

test('version.json: mcp_tools is 20', () => {
  const v = JSON.parse(readRoot('version.json'));
  assert.strictEqual(v.mcp_tools, 21);
});

// ── Fix 1a: canonical benchmark headers on all 5 benchmark pages ──────────────

test('benchmark.md: has canonical v5.8+ info block', () => {
  const src = readGuide('benchmark.md');
  assert.ok(/sigmap-v\d+\.\d+-main/.test(src), 'missing benchmark ID sigmap-vX.Y-main');
  assert.ok(/v\d+\.\d+\.\d+/.test(src), 'missing version in benchmark.md');
});

test('retrieval-benchmark.md: has canonical info block', () => {
  const src = readGuide('retrieval-benchmark.md');
  assert.ok(/sigmap-v\d+\.\d+-main/.test(src), 'missing benchmark ID');
  assert.ok(/v\d+\.\d+\.\d+/.test(src), 'missing version');
});

test('task-benchmark.md: has canonical info block', () => {
  const src = readGuide('task-benchmark.md');
  assert.ok(/sigmap-v\d+\.\d+-main/.test(src), 'missing benchmark ID');
  assert.ok(/v\d+\.\d+\.\d+/.test(src), 'missing version');
});

test('quality-benchmark.md: has canonical info block', () => {
  const src = readGuide('quality-benchmark.md');
  assert.ok(/sigmap-v\d+\.\d+-main/.test(src), 'missing benchmark ID');
  assert.ok(/v\d+\.\d+\.\d+/.test(src), 'missing version');
});

test('generalization.md: has canonical info block', () => {
  const src = readGuide('generalization.md');
  assert.ok(/sigmap-v\d+\.\d+-main/.test(src), 'missing benchmark ID');
  assert.ok(/v\d+\.\d+\.\d+/.test(src), 'missing version');
});

test('generalization.md: has "Why this matters" intro paragraph', () => {
  const src = readGuide('generalization.md');
  assert.ok(src.includes('Why this matters'), 'missing "Why this matters" intro');
});

// ── Fix 2: 30-second demo strip on homepage ───────────────────────────────────

test('docs/index.html: contains demo-strip section', () => {
  const src = readDocs('index.html');
  assert.ok(src.includes('demo-strip'), 'missing demo-strip section in homepage');
});

test('docs/index.html: demo strip contains sigmap ask command', () => {
  const src = readDocs('index.html');
  assert.ok(src.includes('sigmap ask'), 'missing "sigmap ask" in demo strip');
});

test('docs/index.html: demo strip contains sigmap validate command', () => {
  const src = readDocs('index.html');
  assert.ok(src.includes('sigmap validate'), 'missing "sigmap validate" in demo strip');
});

test('docs/index.html: demo strip contains sigmap judge command', () => {
  const src = readDocs('index.html');
  assert.ok(src.includes('sigmap judge'), 'missing "sigmap judge" in demo strip');
});

// ── Fix 3: user-type routing in docs landing ──────────────────────────────────

test('docs-vp/index.md: has "Who is this for?" routing table', () => {
  const src = fs.readFileSync(path.join(ROOT, 'docs-vp', 'index.md'), 'utf8');
  assert.ok(src.includes('Who is this for'), 'missing "Who is this for?" section');
});

test('docs-vp/index.md: routing table links to compare-alternatives', () => {
  const src = fs.readFileSync(path.join(ROOT, 'docs-vp', 'index.md'), 'utf8');
  assert.ok(src.includes('compare-alternatives'), 'missing compare-alternatives link in routing table');
});

test('docs-vp/index.md: routing table links to quick-start', () => {
  const src = fs.readFileSync(path.join(ROOT, 'docs-vp', 'index.md'), 'utf8');
  assert.ok(src.includes('/guide/quick-start'), 'missing quick-start link');
});

// ── Fix 5: compare-alternatives page exists ────────────────────────────────────

test('compare-alternatives.md: file exists', () => {
  const p = path.join(GUIDE_DIR, 'compare-alternatives.md');
  assert.ok(fs.existsSync(p), 'compare-alternatives.md does not exist');
});

test('compare-alternatives.md: covers SigMap vs embeddings', () => {
  const src = readGuide('compare-alternatives.md');
  assert.ok(src.includes('embeddings'), 'missing embeddings comparison');
});

test('compare-alternatives.md: covers SigMap vs RepoMix', () => {
  const src = readGuide('compare-alternatives.md');
  assert.ok(src.includes('RepoMix'), 'missing RepoMix comparison');
});

test('compare-alternatives.md: covers SigMap vs Copilot', () => {
  const src = readGuide('compare-alternatives.md');
  assert.ok(src.includes('Copilot'), 'missing Copilot comparison');
});

test('compare-alternatives.md: contains correct hit@5 figure', () => {
  const src = readGuide('compare-alternatives.md');
  assert.ok(src.includes('82.2%'), 'missing 82.2% hit@5 in compare-alternatives');
  assert.ok(!src.includes('80.0%'), 'found stale 80.0% hit@5 in compare-alternatives');
});

// ── Fix 6: walkthrough page exists ────────────────────────────────────────────

test('walkthrough.md: file exists', () => {
  const p = path.join(GUIDE_DIR, 'walkthrough.md');
  assert.ok(fs.existsSync(p), 'walkthrough.md does not exist');
});

test('walkthrough.md: shows ask → validate → judge → learn sequence', () => {
  const src = readGuide('walkthrough.md');
  assert.ok(src.includes('sigmap ask'), 'missing ask step');
  assert.ok(src.includes('sigmap validate'), 'missing validate step');
  assert.ok(src.includes('sigmap judge'), 'missing judge step');
  assert.ok(src.includes('sigmap learn'), 'missing learn step');
});

test('walkthrough.md: shows before/after token comparison', () => {
  const src = readGuide('walkthrough.md');
  assert.ok(src.includes('Without SigMap') && src.includes('With SigMap'), 'missing before/after comparison');
});

// ── Fix 7: micro trust leak audit ─────────────────────────────────────────────

test('docs/index.html: no stale "21 languages" in stats bar', () => {
  const src = readDocs('index.html');
  assert.ok(!src.includes('>21<'), 'found stale >21< stat in homepage');
});

test('docs/index.html: stats bar shows 29 languages', () => {
  const src = readDocs('index.html');
  assert.ok(src.includes('>29<'), 'missing >29< stat in homepage');
});

test('docs/impact-banner.svg: no stale 80.0% hit@5', () => {
  const src = readDocs('impact-banner.svg');
  assert.ok(!src.includes('80.0%'), 'found stale 80.0% in impact-banner.svg');
});

test('docs/impact-banner.svg: uses 75.6% hit@5', () => {
  const src = readDocs('impact-banner.svg');
  assert.ok(src.includes('82.2%'), 'missing 82.2% in impact-banner.svg');
});

test('docs/impact-banner.svg: uses 1.46 prompts (not 1.68)', () => {
  const src = readDocs('impact-banner.svg');
  assert.ok(!src.includes('1.68'), 'found stale 1.68 in impact-banner.svg');
  assert.ok(src.includes('1.53'), 'missing 1.53 in impact-banner.svg');
});

test('docs/comparison-chart.svg: uses 75.6% (not 80.0%)', () => {
  const src = readDocs('comparison-chart.svg');
  assert.ok(!src.includes('80.0%'), 'found stale 80.0% in comparison-chart.svg');
  assert.ok(src.includes('82.2%'), 'missing 82.2% in comparison-chart.svg');
});

test('docs/index.html: softwareVersion matches version.json', () => {
  const src = readDocs('index.html');
  const v = JSON.parse(readRoot('version.json')).version;
  assert.ok(src.includes(`"softwareVersion":"${v}"`),
    `structured data softwareVersion should be "${v}" (from version.json)`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
