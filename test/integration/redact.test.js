'use strict';

/**
 * Integration tests for `sigmap redact` (v8.24 G3a).
 *
 * Tests:
 *  1.  redactText masks only the matched substring (surrounding text kept)
 *  2.  every pattern in security/patterns.js is masked by redactText
 *  3.  findings carry 1-based line numbers; counts aggregate per pattern
 *  4.  clean text passes through byte-identical with redacted: false
 *  5.  CLI redact <file>: redacted text on stdout, summary on stderr
 *  6.  CLI stdin + --json returns the result object
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
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

const { redactText } = require(path.join(ROOT, 'src', 'security', 'redact'));
const { PATTERNS } = require(path.join(ROOT, 'src', 'security', 'patterns'));

// One realistic sample per pattern name.
// Samples are assembled at runtime so no secret-shaped literal exists in this
// file — GitHub Push Protection scans committed blobs and rejects otherwise.
const AL = 'abcdefghijklmnopqrstuvwxyz';
const SAMPLES = {
  'AWS Access Key': `key ${'AK' + 'IA'}1234567890ABCDEF end`,
  'AWS Secret Key': `aws_secret = "${AL + AL.toUpperCase().slice(0, 10)}0123`.padEnd(52, '4') + '"',
  'GCP API Key': `k ${'AI' + 'za'}AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 z`,
  'GitHub Token': 'gh' + 'p_' + AL + '0123456789',
  'JWT Token': `bearer ${'ey' + 'J'}hbGciOiJIUzI1NiJ9.${'ey' + 'J'}zdWIiOiIxIn0.abc-123_x`,
  'DB Connection String': `url ${'postgres' + '://'}admin:hunter2@db.example.com/prod`,
  'SSH Private Key': ['-----BEGIN', 'RSA PRIVATE', 'KEY-----'].join(' '),
  'Stripe Key': 'sk_' + 'live_' + AL.slice(0, 24),
  'Twilio Key': `sid ${'S' + 'K'}0123456789abcdef0123456789abcdef done`,
  'Generic Secret': `password = ${'"correct-horse-battery"'}`,
};

console.log('[redact.test.js] v8.24 G3a standalone redaction');
console.log('');

test('masks only the matched substring, keeps surrounding text', () => {
  const r = redactText('before AKIA1234567890ABCDEF after');
  assert.strictEqual(r.text, 'before [REDACTED:AWS Access Key] after');
  assert.strictEqual(r.redacted, true);
});

test('every pattern in patterns.js is masked', () => {
  for (const p of PATTERNS) {
    const sample = SAMPLES[p.name];
    assert.ok(sample, `no sample for pattern "${p.name}" — add one`);
    const r = redactText(sample);
    assert.ok(r.text.includes(`[REDACTED:${p.name}]`),
      `pattern "${p.name}" not masked; got: ${r.text}`);
  }
});

test('findings carry 1-based line numbers; counts aggregate', () => {
  const r = redactText('clean\nAKIA1234567890ABCDEF\nAKIAABCDEFGHIJKLMNOP x');
  assert.deepStrictEqual(r.findings.map((f) => f.line), [2, 3]);
  assert.strictEqual(r.findings[0].pattern, 'AWS Access Key');
  assert.deepStrictEqual(r.counts, { 'AWS Access Key': 2 });
});

test('clean text passes through byte-identical', () => {
  const input = 'function hello(name) {\n  return `hi ${name}`;\n}\n';
  const r = redactText(input);
  assert.strictEqual(r.text, input);
  assert.strictEqual(r.redacted, false);
  assert.deepStrictEqual(r.findings, []);
});

test('CLI redact <file>: stdout redacted, stderr summary', () => {
  const tmp = path.join(os.tmpdir(), `sigmap-redact-${process.pid}.txt`);
  fs.writeFileSync(tmp, 'x AKIA1234567890ABCDEF y\n');
  try {
    const r = spawnSync(process.execPath, [SCRIPT, 'redact', tmp], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout, 'x [REDACTED:AWS Access Key] y\n');
    assert.ok(r.stderr.includes('masked 1 secret'), r.stderr);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('CLI stdin + --json returns the result object', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'redact', '--json'],
    { encoding: 'utf8', input: `token ${'gh' + 'p_'}${AL}0123456789\n` });
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.redacted, true);
  assert.deepStrictEqual(j.counts, { 'GitHub Token': 1 });
  assert.ok(j.text.includes('[REDACTED:GitHub Token]'));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`[redact.test.js] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
