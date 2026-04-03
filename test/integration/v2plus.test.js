'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

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

function makeRepo(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cf-v2plus-${name}-`));
  execSync('git init -b main', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function commit(dir, msg) {
  execSync('git add -A', { cwd: dir, stdio: 'ignore' });
  execSync(`git commit -m "${msg}"`, { cwd: dir, stdio: 'ignore' });
}

function runSigMap(dir, args = []) {
  const script = path.resolve(__dirname, '../../gen-context.js');
  return spawnSync('node', [script, ...args], { cwd: dir, encoding: 'utf8' });
}

function readOutput(dir) {
  return fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8');
}

test('includes todos and changes sections by default', () => {
  const dir = makeRepo('todos-changes');
  writeFile(dir, 'src/a.js', 'function oldFn() {\n  // TODO: replace with fast path\n  return 1;\n}\n');
  commit(dir, 'initial');

  writeFile(dir, 'src/a.js', 'function newFn() {\n  // TODO: replace with fast path\n  return 2;\n}\n');
  commit(dir, 'rename function');

  const r = runSigMap(dir, []);
  assert.strictEqual(r.status, 0, r.stderr || 'non-zero status');

  const out = readOutput(dir);
  assert.ok(out.includes('## todos'), 'expected todos section');
  assert.ok(out.includes('# TODO:'), 'expected TODO content line');
  assert.ok(out.includes('## changes'), 'expected changes section');
});

test('adds coverage markers when enabled', () => {
  const dir = makeRepo('coverage');
  writeFile(dir, 'src/app.py', 'def validate_user(user_id):\n    return True\n\ndef issue_token(user_id):\n    return "t"\n');
  writeFile(dir, 'tests/test_app.py', 'def test_validate_user():\n    assert True\n');
  writeFile(dir, 'gen-context.config.json', JSON.stringify({ srcDirs: ['src'], testCoverage: true }, null, 2));
  commit(dir, 'seed');

  const r = runSigMap(dir, []);
  assert.strictEqual(r.status, 0, r.stderr || 'non-zero status');

  const out = readOutput(dir);
  assert.ok(out.includes('validate_user(user_id)  ✓') || out.includes('validate_user(user_id) →') || out.includes('✓'), 'expected tested marker');
  assert.ok(out.includes('issue_token(user_id)  ✗') || out.includes('✗'), 'expected untested marker');
});

test('--diff <base-ref> writes diff section', () => {
  const dir = makeRepo('pr-diff');
  writeFile(dir, 'src/a.js', 'function alpha() { return 1; }\n');
  commit(dir, 'initial');

  execSync('git checkout -b feature/test-diff', { cwd: dir, stdio: 'ignore' });

  writeFile(dir, 'src/a.js', 'function alpha2() { return 2; }\n');
  commit(dir, 'change');

  const r = runSigMap(dir, ['--diff', 'main']);
  assert.strictEqual(r.status, 0, r.stderr || 'non-zero status');

  const out = readOutput(dir);
  assert.ok(out.includes('## diff (vs main)'), 'expected diff section');
  assert.ok(out.includes('+alpha2') || out.includes('~alpha2') || out.includes('-alpha'), 'expected structural markers');
});

console.log('\nv2plus:');
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
