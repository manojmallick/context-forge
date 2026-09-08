'use strict';

/**
 * `sigmap lines` — the CLI twin of the get_lines MCP tool.
 *
 * Without it, an agent in an MCP-less environment gets precise `:start-end`
 * anchors from `ask` and has no sanctioned way to spend them, so it bulk-reads
 * and throws the saving away. Measured on a real Copilot session: 2,659 tokens
 * read where the anchored window needed 217.
 *
 * It delegates to the same handler as MCP, so these also assert the shared
 * sandbox and bounds behaviour reach the CLI.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const GEN = path.join(ROOT, 'gen-context.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); failed++; }
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-lines-'));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });
const run = (cwd, ...a) => spawnSync('node', [GEN, 'lines', ...a], { cwd, encoding: 'utf8' });

function fixture() {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.js'),
    Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n') + '\n');
  return dir;
}

test('an explicit range prints exactly those lines', () => {
  const dir = fixture();
  const r = run(dir, 'src/a.js', '10-12');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('src/a.js:10-12'), r.stdout);
  assert.ok(r.stdout.includes('line 10') && r.stdout.includes('line 12'));
  assert.ok(!r.stdout.includes('line 13'), 'must not overshoot the range');
  assert.ok(!r.stdout.includes('line 9'), 'must not undershoot the range');
  rm(dir);
});

test('a :anchor pasted off a signature yields a window around it', () => {
  const dir = fixture();
  const r = run(dir, 'src/a.js', ':20', '--context', '2');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('src/a.js:18-22'), r.stdout);
  rm(dir);
});

test('the context window defaults to ±10', () => {
  const dir = fixture();
  const r = run(dir, 'src/a.js', ':20');
  assert.ok(r.stdout.includes('src/a.js:10-30'), r.stdout);
  rm(dir);
});

test('a range beyond EOF clamps rather than failing', () => {
  const dir = fixture();
  const r = run(dir, 'src/a.js', '38-999');
  assert.strictEqual(r.status, 0, r.stderr);
  // 38-41, not 38-40: the shared handler splits on '\n', so a trailing newline
  // counts as one more (empty) line. Pre-existing behaviour, identical over MCP
  // — asserted here so a change to it is a deliberate decision, not a surprise.
  assert.ok(r.stdout.includes('src/a.js:38-41'), r.stdout);
  assert.ok(r.stdout.includes('line 40'), 'the last real line must be present');
  rm(dir);
});

test('a start past EOF reports the real length and exits non-zero', () => {
  const dir = fixture();
  const r = run(dir, 'src/a.js', '900-999');
  assert.notStrictEqual(r.status, 0);
  assert.ok(/only 41 lines|only 40 lines/.test(r.stderr), r.stderr);
  rm(dir);
});

test('a missing file exits non-zero with a clear message', () => {
  const dir = fixture();
  const r = run(dir, 'src/nope.js', '1-2');
  assert.strictEqual(r.status, 1);
  assert.ok(/File not found/.test(r.stderr), r.stderr);
  rm(dir);
});

test('a path outside the project root is refused', () => {
  const dir = fixture();
  const r = run(dir, '../../../etc/passwd', '1-2');
  assert.strictEqual(r.status, 1);
  assert.ok(/resolves outside the project root/.test(r.stderr), r.stderr);
  rm(dir);
});

test('missing arguments print usage and exit 2', () => {
  const dir = fixture();
  const r = run(dir, 'src/a.js');
  assert.strictEqual(r.status, 2);
  assert.ok(/usage: sigmap lines/.test(r.stderr), r.stderr);
  rm(dir);
});

test('an unparsable range is rejected, not guessed', () => {
  const dir = fixture();
  const r = run(dir, 'src/a.js', 'ten-twelve');
  assert.strictEqual(r.status, 2);
  assert.ok(/could not read range/.test(r.stderr), r.stderr);
  rm(dir);
});

test('--help documents the command', () => {
  const r = spawnSync('node', [GEN, '--help'], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(/lines <file> <start>-<end>/.test(r.stdout), 'help must list the range form');
  assert.ok(/--context/.test(r.stdout), 'help must mention the anchor window');
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
