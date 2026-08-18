'use strict';

/**
 * #522 benchmark-determinism guards — source-level, CI-safe (no cloned repos).
 * The full two-run/cross-suite gate is `npm run validate:benchmark-determinism`
 * (needs cached benchmark repos); these guards keep the fix from regressing
 * structurally: one shared override table, mirrored apply/restore semantics,
 * the labeled self-repo set, and the gate itself staying wired.
 * Run: node test/integration/benchmark-determinism.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

test('benchmarks/config-overrides.json exists, parses, and covers the skew repos', () => {
  const overrides = JSON.parse(read('benchmarks/config-overrides.json'));
  // The four repos whose absence from the quality suite's table caused the
  // measured 11.2pt cross-suite decay (plus two sanity anchors).
  for (const repo of ['express', 'flask', 'spring-petclinic', 'serilog', 'rails', 'gin']) {
    assert.ok(overrides[repo] && Array.isArray(overrides[repo].srcDirs), `missing override: ${repo}`);
  }
});

test('retrieval and quality suites both load the shared table — no local copies', () => {
  for (const script of ['scripts/run-retrieval-benchmark.mjs', 'scripts/run-quality-benchmark.mjs']) {
    const src = read(script);
    assert.ok(src.includes("config-overrides.json"), `${script} must load the shared table`);
    assert.ok(!/CONFIG_OVERRIDES = \{\s*\n\s+['"a-z]/.test(src), `${script} still defines a local override table`);
  }
});

test('quality suite mirrors retrieval apply/restore semantics', () => {
  const q = read('scripts/run-quality-benchmark.mjs');
  assert.ok(q.includes('existingConfig'), 'quality must snapshot the pre-existing config');
  assert.ok(!/!hadConfig && configOverride/.test(q), 'quality must ALWAYS apply the override, not only when no config exists');
  assert.ok(/finally\s*\{/.test(q), 'quality must restore the prior config in finally');
});

test('honest benchmark labels the self-repo task set', () => {
  const h = read('scripts/run-honest-benchmark.mjs');
  assert.ok(h.includes('selfRepo'), 'selfRepo label missing from honest script');
  assert.ok(h.includes('self-repo task set'), 'human-output note for the self-repo set missing');
});

test('determinism gate exists and is wired as an npm script', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'check-benchmark-determinism.mjs')), 'gate script missing');
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['validate:benchmark-determinism'], 'validate:benchmark-determinism npm script missing');
  assert.ok(pkg.scripts['validate:benchmark-determinism'].includes('--cross-suite'), 'gate must run in cross-suite mode');
});

console.log(`\n  benchmark-determinism: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
