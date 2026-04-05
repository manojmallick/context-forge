'use strict';

/**
 * Integration tests for v2.2 diagnostics & analyze command.
 *
 * Tests:
 *  1.  analyzeFiles — returns array with correct shape
 *  2.  analyzeFiles — extractor name is populated
 *  3.  analyzeFiles — sigs count ≥ 0
 *  4.  analyzeFiles — tokens = ceil(sigChars / 4)
 *  5.  analyzeFiles — covered is boolean
 *  6.  analyzeFiles — skips unknown extensions
 *  7.  formatAnalysisTable — output contains header columns
 *  8.  formatAnalysisTable — empty stats returns fallback string
 *  9.  formatAnalysisJSON — has files, totalSigs, totalTokens, slowFiles, fileCount
 * 10.  CLI --analyze prints table, no throw (exit 0)
 * 11.  CLI --analyze --json produces valid JSON with correct keys
 * 12.  CLI --analyze --slow runs without throw
 * 13.  CLI --diagnose-extractors exits 0 and prints pass/fail counts
 * 14.  CLI --version returns 2.4.0
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { spawnSync } = require('child_process');

const ROOT   = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'gen-context.js');

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

// ---------------------------------------------------------------------------
// Load modules directly from src/
// ---------------------------------------------------------------------------
const { analyzeFiles, formatAnalysisTable, formatAnalysisJSON } = require(
  path.join(ROOT, 'src', 'eval', 'analyzer'),
);

console.log('[analyze.test.js] v2.2 diagnostics & analyze command');
console.log('');

// Collect fixture files for unit-level tests
const fixturesDir = path.join(ROOT, 'test', 'fixtures');
const fixtures = fs.readdirSync(fixturesDir).map((f) => path.join(fixturesDir, f));

// ---------------------------------------------------------------------------
// 1. analyzeFiles — returns array
// ---------------------------------------------------------------------------
test('analyzeFiles: returns an array', () => {
  const result = analyzeFiles(fixtures, ROOT);
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0, 'expected at least one analyzed file');
});

// ---------------------------------------------------------------------------
// 2. analyzeFiles — each entry has extractor name
// ---------------------------------------------------------------------------
test('analyzeFiles: each entry has extractor string', () => {
  const result = analyzeFiles(fixtures, ROOT);
  for (const s of result) {
    assert.strictEqual(typeof s.extractor, 'string', `extractor missing for ${s.file}`);
    assert.ok(s.extractor.length > 0);
  }
});

// ---------------------------------------------------------------------------
// 3. analyzeFiles — sigs count is non-negative integer
// ---------------------------------------------------------------------------
test('analyzeFiles: sigs count is non-negative integer', () => {
  const result = analyzeFiles(fixtures, ROOT);
  for (const s of result) {
    assert.ok(Number.isInteger(s.sigs) && s.sigs >= 0, `bad sigs for ${s.file}: ${s.sigs}`);
  }
});

// ---------------------------------------------------------------------------
// 4. analyzeFiles — tokens ≥ 0
// ---------------------------------------------------------------------------
test('analyzeFiles: tokens is non-negative', () => {
  const result = analyzeFiles(fixtures, ROOT);
  for (const s of result) {
    assert.ok(typeof s.tokens === 'number' && s.tokens >= 0, `bad tokens for ${s.file}`);
  }
});

// ---------------------------------------------------------------------------
// 5. analyzeFiles — covered is boolean
// ---------------------------------------------------------------------------
test('analyzeFiles: covered is boolean', () => {
  const result = analyzeFiles(fixtures, ROOT);
  for (const s of result) {
    assert.strictEqual(typeof s.covered, 'boolean', `covered not boolean for ${s.file}`);
  }
});

// ---------------------------------------------------------------------------
// 6. analyzeFiles — unknown extension files are skipped
// ---------------------------------------------------------------------------
test('analyzeFiles: skips unknown extension files', () => {
  const fakeFiles = ['/tmp/unknown.xyz123', '/tmp/another.unknown999'];
  const result = analyzeFiles(fakeFiles, ROOT);
  assert.strictEqual(result.length, 0, 'expected 0 results for unknown extensions');
});

// ---------------------------------------------------------------------------
// 7. formatAnalysisTable — output has column headers
// ---------------------------------------------------------------------------
test('formatAnalysisTable: output contains header columns', () => {
  const result = analyzeFiles(fixtures, ROOT);
  const table  = formatAnalysisTable(result, false);
  assert.ok(typeof table === 'string' && table.length > 0);
  assert.ok(table.includes('File'),      'missing File column');
  assert.ok(table.includes('Sigs'),      'missing Sigs column');
  assert.ok(table.includes('Tokens'),    'missing Tokens column');
  assert.ok(table.includes('Extractor'), 'missing Extractor column');
  assert.ok(table.includes('Coverage'),  'missing Coverage column');
});

// ---------------------------------------------------------------------------
// 8. formatAnalysisTable — empty input returns fallback
// ---------------------------------------------------------------------------
test('formatAnalysisTable: empty stats returns fallback string', () => {
  const table = formatAnalysisTable([], false);
  assert.ok(table.length > 0);
  // Should not contain pipe-table rows
  assert.ok(!table.includes('| File'), 'should not have table header for empty input');
});

// ---------------------------------------------------------------------------
// 9. formatAnalysisJSON — correct top-level keys
// ---------------------------------------------------------------------------
test('formatAnalysisJSON: correct top-level keys', () => {
  const result = analyzeFiles(fixtures, ROOT);
  const json   = formatAnalysisJSON(result);
  assert.ok('files'       in json, 'missing files');
  assert.ok('totalSigs'   in json, 'missing totalSigs');
  assert.ok('totalTokens' in json, 'missing totalTokens');
  assert.ok('slowFiles'   in json, 'missing slowFiles');
  assert.ok('fileCount'   in json, 'missing fileCount');
  assert.strictEqual(json.fileCount, result.length);
  assert.ok(Array.isArray(json.slowFiles));
});

// ---------------------------------------------------------------------------
// 10. CLI --analyze exits 0 and prints a table
// ---------------------------------------------------------------------------
test('CLI --analyze: exits 0 and prints table', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--analyze'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.strictEqual(r.status, 0, `exit ${r.status}: ${r.stderr}`);
  const out = r.stdout || '';
  assert.ok(out.includes('File') || out.includes('no files'), `unexpected output: ${out.slice(0, 200)}`);
});

// ---------------------------------------------------------------------------
// 11. CLI --analyze --json: valid JSON with correct keys
// ---------------------------------------------------------------------------
test('CLI --analyze --json: valid JSON with correct keys', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--analyze', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.strictEqual(r.status, 0, `exit ${r.status}: ${r.stderr}`);
  let d;
  try { d = JSON.parse(r.stdout); } catch (e) { assert.fail(`invalid JSON: ${e.message}`); }
  assert.ok('files'       in d, 'missing files');
  assert.ok('totalSigs'   in d, 'missing totalSigs');
  assert.ok('totalTokens' in d, 'missing totalTokens');
  assert.ok('slowFiles'   in d, 'missing slowFiles');
  assert.ok('fileCount'   in d, 'missing fileCount');
  assert.ok(Array.isArray(d.files),     'files should be array');
  assert.ok(Array.isArray(d.slowFiles), 'slowFiles should be array');
});

// ---------------------------------------------------------------------------
// 12. CLI --analyze --slow: exits 0, no throw
// ---------------------------------------------------------------------------
test('CLI --analyze --slow: exits 0', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--analyze', '--slow'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.strictEqual(r.status, 0, `exit ${r.status}: ${r.stderr}`);
  assert.ok(r.stdout.length > 0, 'expected non-empty output');
});

// ---------------------------------------------------------------------------
// 13. CLI --diagnose-extractors: exits 0 and prints pass counts
// ---------------------------------------------------------------------------
test('CLI --diagnose-extractors: exits 0 and shows results', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--diagnose-extractors'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.strictEqual(r.status, 0, `exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  // Should mention passed/failed counts
  assert.ok(
    r.stdout.includes('passed') || r.stdout.includes('PASS'),
    `expected pass/fail summary, got: ${r.stdout.slice(0, 300)}`,
  );
});

// ---------------------------------------------------------------------------
// 14. CLI --version returns 2.4.0
// ---------------------------------------------------------------------------
test('CLI --version: returns 2.4.0', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--version'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.trim().includes('2.4.0'), `got: ${r.stdout.trim()}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
