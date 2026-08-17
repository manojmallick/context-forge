'use strict';

/**
 * KNOWN_LIMITATIONS.md + README extraction-honesty tier label (G1, #520).
 * Guards that the honesty page exists, states the tiers/caps/gaps, and that
 * its quoted counts never drift from version.json or the actual extractors.
 * Run: node test/integration/known-limitations.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DOC = fs.existsSync(path.join(ROOT, 'KNOWN_LIMITATIONS.md'))
  ? fs.readFileSync(path.join(ROOT, 'KNOWN_LIMITATIONS.md'), 'utf8') : '';
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const versionJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

test('KNOWN_LIMITATIONS.md exists and names all three tiers', () => {
  assert.ok(DOC.length > 0, 'KNOWN_LIMITATIONS.md missing');
  assert.ok(/1 — AST/.test(DOC), 'Tier 1 (AST) missing');
  assert.ok(/2 — anchored regex/.test(DOC), 'Tier 2 (anchored regex) missing');
  assert.ok(/3 — pattern\/heuristic/.test(DOC), 'Tier 3 (pattern/heuristic) missing');
});

test('doc states both truncation caps and the nested-paren gap', () => {
  assert.ok(/25 signatures per file/.test(DOC), '25 sigs/file cap missing');
  assert.ok(/8 members per class/.test(DOC), '8 members/block cap missing');
  assert.ok(/first `\)`/.test(DOC), 'nested-paren gap missing');
});

test('doc states the verify implication (fake-symbol at medium confidence)', () => {
  assert.ok(DOC.includes('fake-symbol'), 'fake-symbol implication missing');
  assert.ok(/medium confidence/.test(DOC), 'medium-confidence framing missing');
  assert.ok(/false positive/.test(DOC), 'conservative false-positive framing missing');
});

test('doc counts match version.json (drift guard)', () => {
  const m = DOC.match(/(\d+) extractor modules covering (\d+) languages/);
  assert.ok(m, 'counts line missing from doc');
  assert.strictEqual(Number(m[1]), versionJson.extractors, `doc says ${m[1]} extractors, version.json says ${versionJson.extractors}`);
  assert.strictEqual(Number(m[2]), versionJson.languages, `doc says ${m[2]} languages, version.json says ${versionJson.languages}`);
});

test('Tier-2 anchored-language count matches the extractors that use withAnchor', () => {
  const dir = path.join(ROOT, 'src', 'extractors');
  const anchored = fs.readdirSync(dir).filter((f) =>
    f.endsWith('.js') && f !== 'line-anchor.js' &&
    fs.readFileSync(path.join(dir, f), 'utf8').includes('withAnchor'));
  const m = DOC.match(/C# \((\d+)\)/);
  assert.ok(m, 'Tier-2 count missing from doc');
  assert.strictEqual(Number(m[1]), anchored.length,
    `doc says ${m[1]} anchored languages, code has ${anchored.length}: ${anchored.join(', ')}`);
});

test('README carries the tier label and links KNOWN_LIMITATIONS.md', () => {
  assert.ok(README.includes('### Extraction honesty'), 'README tier-label section missing');
  assert.ok(README.includes('](KNOWN_LIMITATIONS.md)'), 'README link to KNOWN_LIMITATIONS.md missing');
  assert.ok(/25 signatures\/file/.test(README), 'README caps summary missing');
});

console.log(`\n  known-limitations: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
