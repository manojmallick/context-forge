'use strict';

/**
 * Integration tests for v3.0 — Multi-Adapter Architecture.
 *
 * Tests:
 *  1.  packages/adapters/index exports getAdapter, listAdapters, adapt, outputsToAdapters
 *  2.  listAdapters() returns exactly 6 adapter names
 *  3.  getAdapter('copilot') returns object with name, format, outputPath
 *  4.  getAdapter('claude')  returns object with name, format, outputPath
 *  5.  getAdapter('cursor')  returns object with name, format, outputPath
 *  6.  getAdapter('windsurf') returns object with name, format, outputPath
 *  7.  getAdapter('openai')  returns object with name, format, outputPath
 *  8.  getAdapter('gemini')  returns object with name, format, outputPath
 *  9.  getAdapter returns null for unknown adapter name
 * 10.  All 6 adapters produce non-empty string output for non-empty context
 * 11.  adapt() returns empty string for empty context
 * 12.  adapt() returns empty string for unknown adapter
 * 13.  outputsToAdapters maps legacy outputs array correctly
 * 14.  packages/core adapt() function is exported and works
 * 15.  --adapter copilot --json outputs valid JSON with adapter + outputPath
 * 16.  --adapter openai --json outputs valid JSON  
 * 17.  --adapter unknown exits non-zero
 * 18.  --adapter (no name) exits non-zero
 * 19.  old "outputs" config key backward compat — still works in loadConfig
 * 20.  new "adapters" config key accepted by loadConfig
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const ADAPTERS_INDEX = path.join(ROOT, 'packages', 'adapters', 'index.js');
const CORE = path.join(ROOT, 'packages', 'core', 'index.js');
const SCRIPT = path.join(ROOT, 'gen-context.js');
const LOADER = path.join(ROOT, 'src', 'config', 'loader.js');

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

console.log('[adapters.test.js] v3.0 — Multi-Adapter Architecture');
console.log('');

const adapters = require(ADAPTERS_INDEX);
const core = require(CORE);

const SAMPLE_CONTEXT = [
  '## src',
  '',
  '### src/server.js',
  '```',
  'function start(port)',
  'function stop()',
  '```',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// 1. Exports check
// ---------------------------------------------------------------------------
test('packages/adapters/index exports getAdapter, listAdapters, adapt, outputsToAdapters', () => {
  assert.strictEqual(typeof adapters.getAdapter, 'function');
  assert.strictEqual(typeof adapters.listAdapters, 'function');
  assert.strictEqual(typeof adapters.adapt, 'function');
  assert.strictEqual(typeof adapters.outputsToAdapters, 'function');
});

// ---------------------------------------------------------------------------
// 2. listAdapters returns 6 names
// ---------------------------------------------------------------------------
test('listAdapters() returns exactly 6 adapter names', () => {
  const list = adapters.listAdapters();
  assert.ok(Array.isArray(list), 'must be an array');
  assert.strictEqual(list.length, 6, `expected 6 adapters, got ${list.length}: ${list.join(', ')}`);
  const expected = ['copilot', 'claude', 'cursor', 'windsurf', 'openai', 'gemini'];
  for (const name of expected) {
    assert.ok(list.includes(name), `missing adapter: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// 3-8. Each adapter has name, format, outputPath
// ---------------------------------------------------------------------------
for (const adapterName of ['copilot', 'claude', 'cursor', 'windsurf', 'openai', 'gemini']) {
  test(`getAdapter('${adapterName}') returns {name, format, outputPath}`, () => {
    const a = adapters.getAdapter(adapterName);
    assert.ok(a !== null, `getAdapter('${adapterName}') returned null`);
    assert.strictEqual(a.name, adapterName, `name mismatch: ${a.name}`);
    assert.strictEqual(typeof a.format, 'function', 'format must be a function');
    assert.strictEqual(typeof a.outputPath, 'function', 'outputPath must be a function');
    // verify outputPath returns a string for a valid cwd
    const p = a.outputPath('/tmp');
    assert.strictEqual(typeof p, 'string', 'outputPath must return a string');
    assert.ok(p.length > 0, 'outputPath must be non-empty');
  });
}

// ---------------------------------------------------------------------------
// 9. getAdapter returns null for unknown adapter
// ---------------------------------------------------------------------------
test('getAdapter returns null for unknown adapter name', () => {
  assert.strictEqual(adapters.getAdapter('unknown-adapter'), null);
  assert.strictEqual(adapters.getAdapter(''), null);
  assert.strictEqual(adapters.getAdapter(null), null);
});

// ---------------------------------------------------------------------------
// 10. All 6 adapters produce non-empty output for non-empty context
// ---------------------------------------------------------------------------
test('all 6 adapters produce non-empty string output', () => {
  const names = adapters.listAdapters();
  for (const name of names) {
    const result = adapters.adapt(SAMPLE_CONTEXT, name, { version: '3.0.0' });
    assert.strictEqual(typeof result, 'string', `${name}: result must be a string`);
    assert.ok(result.length > 0, `${name}: result must be non-empty`);
    assert.ok(result.includes('server.js') || result.includes('Code Signatures') || result.includes('Code signatures'),
      `${name}: result should contain context content`);
  }
});

// ---------------------------------------------------------------------------
// 11. adapt() returns empty string for empty context
// ---------------------------------------------------------------------------
test('adapt() returns empty string for empty context', () => {
  assert.strictEqual(adapters.adapt('', 'copilot'), '');
  assert.strictEqual(adapters.adapt(null, 'copilot'), '');
  assert.strictEqual(adapters.adapt(undefined, 'copilot'), '');
});

// ---------------------------------------------------------------------------
// 12. adapt() returns empty string for unknown adapter
// ---------------------------------------------------------------------------
test('adapt() returns empty string for unknown adapter name', () => {
  assert.strictEqual(adapters.adapt(SAMPLE_CONTEXT, 'nonexistent'), '');
  assert.strictEqual(adapters.adapt(SAMPLE_CONTEXT, ''), '');
});

// ---------------------------------------------------------------------------
// 13. outputsToAdapters maps legacy outputs correctly
// ---------------------------------------------------------------------------
test('outputsToAdapters maps legacy outputs array correctly', () => {
  const result = adapters.outputsToAdapters(['copilot', 'claude', 'cursor']);
  assert.ok(Array.isArray(result));
  assert.ok(result.includes('copilot'));
  assert.ok(result.includes('claude'));
  assert.ok(result.includes('cursor'));
  // non-array input returns default
  const defaultResult = adapters.outputsToAdapters(null);
  assert.deepStrictEqual(defaultResult, ['copilot']);
});

// ---------------------------------------------------------------------------
// 14. packages/core adapt() is exported and works
// ---------------------------------------------------------------------------
test('packages/core exports adapt() and it works', () => {
  assert.strictEqual(typeof core.adapt, 'function', 'core.adapt must be a function');
  const result = core.adapt(SAMPLE_CONTEXT, 'copilot', { version: '3.0.0' });
  assert.strictEqual(typeof result, 'string');
  assert.ok(result.length > 0, 'core.adapt should return non-empty string');
});

// ---------------------------------------------------------------------------
// 15. --adapter copilot --json outputs valid JSON
// ---------------------------------------------------------------------------
test('--adapter copilot --json outputs valid JSON with adapter + outputPath', () => {
  const result = spawnSync('node', [SCRIPT, '--adapter', 'copilot', '--json'], {
    encoding: 'utf8',
    timeout: 10000,
    cwd: ROOT,
  });
  assert.strictEqual(result.status, 0, `exit code: ${result.status}\nstderr: ${result.stderr}`);
  let data;
  try {
    data = JSON.parse(result.stdout.trim());
  } catch (e) {
    throw new Error(`Invalid JSON: ${result.stdout.slice(0, 200)}`);
  }
  assert.strictEqual(data.adapter, 'copilot', `expected adapter=copilot, got ${data.adapter}`);
  assert.ok(typeof data.outputPath === 'string' && data.outputPath.length > 0, 'outputPath must be a string');
  assert.strictEqual(data.version, '3.0.0', `expected version 3.0.0, got ${data.version}`);
});

// ---------------------------------------------------------------------------
// 16. --adapter openai --json outputs valid JSON
// ---------------------------------------------------------------------------
test('--adapter openai --json outputs valid JSON', () => {
  const result = spawnSync('node', [SCRIPT, '--adapter', 'openai', '--json'], {
    encoding: 'utf8',
    timeout: 10000,
    cwd: ROOT,
  });
  assert.strictEqual(result.status, 0, `exit code: ${result.status}\nstderr: ${result.stderr}`);
  let data;
  try {
    data = JSON.parse(result.stdout.trim());
  } catch (e) {
    throw new Error(`Invalid JSON: ${result.stdout.slice(0, 200)}`);
  }
  assert.strictEqual(data.adapter, 'openai');
  assert.ok(data.outputPath.endsWith('openai-context.md'), `unexpected path: ${data.outputPath}`);
});

// ---------------------------------------------------------------------------
// 17. --adapter unknown exits non-zero
// ---------------------------------------------------------------------------
test('--adapter <unknown> exits with non-zero status', () => {
  const result = spawnSync('node', [SCRIPT, '--adapter', 'bogus-adapter'], {
    encoding: 'utf8',
    timeout: 10000,
    cwd: ROOT,
  });
  assert.notStrictEqual(result.status, 0, 'unknown adapter should exit non-zero');
});

// ---------------------------------------------------------------------------
// 18. --adapter (no name given) exits non-zero
// ---------------------------------------------------------------------------
test('--adapter without a name argument exits non-zero', () => {
  const result = spawnSync('node', [SCRIPT, '--adapter'], {
    encoding: 'utf8',
    timeout: 10000,
    cwd: ROOT,
  });
  assert.notStrictEqual(result.status, 0, 'missing adapter name should exit non-zero');
});

// ---------------------------------------------------------------------------
// 19. old "outputs" config key backward compat in loadConfig
// ---------------------------------------------------------------------------
test('old "outputs" config key backward compat — loadConfig mirrors to adapters', () => {
  const { loadConfig } = require(LOADER);
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-test-'));
  try {
    const configPath = path.join(tmpDir, 'gen-context.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ outputs: ['cursor', 'windsurf'] }), 'utf8');
    const config = loadConfig(tmpDir);
    assert.ok(Array.isArray(config.adapters), 'adapters must be an array when outputs is set');
    assert.ok(config.adapters.includes('cursor'), 'adapters should include cursor');
    assert.ok(config.adapters.includes('windsurf'), 'adapters should include windsurf');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 20. new "adapters" config key accepted by loadConfig
// ---------------------------------------------------------------------------
test('new "adapters" config key accepted by loadConfig', () => {
  const { loadConfig } = require(LOADER);
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-test-'));
  try {
    const configPath = path.join(tmpDir, 'gen-context.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ adapters: ['copilot', 'openai'] }), 'utf8');
    const config = loadConfig(tmpDir);
    assert.ok(Array.isArray(config.adapters), 'adapters must be an array');
    assert.ok(config.adapters.includes('copilot'), 'adapters should include copilot');
    assert.ok(config.adapters.includes('openai'), 'adapters should include openai');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
