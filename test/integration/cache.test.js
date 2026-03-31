'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const GEN_CONTEXT = path.resolve(__dirname, '../../gen-context.js');
const { formatCache, formatCachePayload } = require('../../src/format/cache');

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

function withTempProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-cache-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function seedSrc(dir) {
  const srcDir = path.join(dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'index.js'), [
    'function hello() {}',
    'function world() {}',
    'module.exports = { hello, world };',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// Unit tests — formatCache()
// ---------------------------------------------------------------------------

console.log('\nUnit tests — formatCache()\n');

test('returns valid JSON string', () => {
  const result = formatCache('# Code signatures\n\nsome content');
  const parsed = JSON.parse(result);
  assert.ok(parsed, 'should parse as JSON');
});

test('top-level type is "text"', () => {
  const parsed = JSON.parse(formatCache('hello'));
  assert.strictEqual(parsed.type, 'text');
});

test('text field contains the input content', () => {
  const content = '# Code signatures\n\n## src\n\n### src/index.js\n```\nfunction hello()\n```\n';
  const parsed = JSON.parse(formatCache(content));
  assert.strictEqual(parsed.text, content);
});

test('cache_control is { type: "ephemeral" }', () => {
  const parsed = JSON.parse(formatCache('hello'));
  assert.deepStrictEqual(parsed.cache_control, { type: 'ephemeral' });
});

test('handles empty string without throwing', () => {
  const result = formatCache('');
  const parsed = JSON.parse(result);
  assert.strictEqual(parsed.text, '');
});

test('handles null without throwing', () => {
  const result = formatCache(null);
  const parsed = JSON.parse(result);
  assert.strictEqual(parsed.text, '');
});

// ---------------------------------------------------------------------------
// Unit tests — formatCachePayload()
// ---------------------------------------------------------------------------

console.log('\nUnit tests — formatCachePayload()\n');

test('returns valid JSON string from formatCachePayload', () => {
  const result = formatCachePayload('# Code signatures');
  const parsed = JSON.parse(result);
  assert.ok(parsed, 'should parse as JSON');
});

test('payload has model field', () => {
  const parsed = JSON.parse(formatCachePayload('hello'));
  assert.ok(typeof parsed.model === 'string' && parsed.model.length > 0);
});

test('payload model defaults to claude-opus-4-5', () => {
  const parsed = JSON.parse(formatCachePayload('hello'));
  assert.strictEqual(parsed.model, 'claude-opus-4-5');
});

test('payload model can be overridden', () => {
  const parsed = JSON.parse(formatCachePayload('hello', 'claude-haiku-3-5'));
  assert.strictEqual(parsed.model, 'claude-haiku-3-5');
});

test('payload has system array', () => {
  const parsed = JSON.parse(formatCachePayload('hello'));
  assert.ok(Array.isArray(parsed.system));
  assert.strictEqual(parsed.system.length, 1);
});

test('payload system[0] has cache_control ephemeral', () => {
  const parsed = JSON.parse(formatCachePayload('hello'));
  assert.deepStrictEqual(parsed.system[0].cache_control, { type: 'ephemeral' });
});

test('payload system[0].text contains input', () => {
  const content = '# Test content';
  const parsed = JSON.parse(formatCachePayload(content));
  assert.strictEqual(parsed.system[0].text, content);
});

test('payload has messages array', () => {
  const parsed = JSON.parse(formatCachePayload('hello'));
  assert.ok(Array.isArray(parsed.messages));
});

// ---------------------------------------------------------------------------
// Integration tests — CLI --format cache
// ---------------------------------------------------------------------------

console.log('\nIntegration tests — CLI --format cache\n');

test('--format cache writes .github/copilot-instructions.cache.json', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    execSync(`node "${GEN_CONTEXT}" --format cache`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const cachePath = path.join(dir, '.github', 'copilot-instructions.cache.json');
    assert.ok(fs.existsSync(cachePath), 'cache JSON file should exist');
  });
});

test('cache JSON file is valid JSON', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    execSync(`node "${GEN_CONTEXT}" --format cache`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const cachePath = path.join(dir, '.github', 'copilot-instructions.cache.json');
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(parsed);
  });
});

test('cache JSON has type=text and cache_control.type=ephemeral', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    execSync(`node "${GEN_CONTEXT}" --format cache`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const cachePath = path.join(dir, '.github', 'copilot-instructions.cache.json');
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.strictEqual(parsed.type, 'text');
    assert.deepStrictEqual(parsed.cache_control, { type: 'ephemeral' });
  });
});

test('cache JSON text field contains code signatures', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    execSync(`node "${GEN_CONTEXT}" --format cache`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const cachePath = path.join(dir, '.github', 'copilot-instructions.cache.json');
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.ok(parsed.text.includes('Code signatures'), 'text should contain signatures header');
  });
});

test('without --format cache, no cache JSON file is written', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    execSync(`node "${GEN_CONTEXT}"`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const cachePath = path.join(dir, '.github', 'copilot-instructions.cache.json');
    assert.ok(!fs.existsSync(cachePath), 'cache JSON should NOT exist without --format cache');
  });
});

test('config format:cache writes cache JSON automatically', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ format: 'cache' }),
      'utf8'
    );
    execSync(`node "${GEN_CONTEXT}"`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const cachePath = path.join(dir, '.github', 'copilot-instructions.cache.json');
    assert.ok(fs.existsSync(cachePath), 'cache JSON should exist when config format:cache');
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`cache: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
