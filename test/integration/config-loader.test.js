'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const { loadConfig } = require('../../src/config/loader');
const { DEFAULTS } = require('../../src/config/defaults');

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

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- No config file → defaults ---
test('Returns defaults when no config file', () => {
  withTempDir((dir) => {
    const config = loadConfig(dir);
    assert.strictEqual(config.maxTokens, DEFAULTS.maxTokens);
    assert.deepStrictEqual(config.outputs, DEFAULTS.outputs);
    assert.strictEqual(config.secretScan, DEFAULTS.secretScan);
  });
});

// --- Valid config overrides defaults ---
test('User config overrides individual keys', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      maxTokens: 3000,
      outputs: ['copilot', 'claude'],
      secretScan: false,
    }));
    const config = loadConfig(dir);
    assert.strictEqual(config.maxTokens, 3000);
    assert.deepStrictEqual(config.outputs, ['copilot', 'claude']);
    assert.strictEqual(config.secretScan, false);
    // Non-overridden keys still have defaults
    assert.strictEqual(config.maxDepth, DEFAULTS.maxDepth);
    assert.deepStrictEqual(config.srcDirs, DEFAULTS.srcDirs);
  });
});

// --- Object keys deep-merged ---
test('Object config keys are deep-merged (mcp)', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      mcp: { autoRegister: false },
    }));
    const config = loadConfig(dir);
    assert.strictEqual(config.mcp.autoRegister, false);
  });
});

// --- Invalid JSON → defaults, no crash ---
test('Invalid JSON returns defaults without crashing', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), '{ broken json !!!');
    const config = loadConfig(dir);
    assert.strictEqual(config.maxTokens, DEFAULTS.maxTokens);
  });
});

// --- Unknown keys are ignored (just warned) ---
test('Unknown config keys are ignored', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      maxTokens: 2000,
      unknownKey: 'should be ignored',
      _comment: 'comments allowed',
    }));
    const config = loadConfig(dir);
    assert.strictEqual(config.maxTokens, 2000);
    assert.strictEqual(config.unknownKey, undefined);
  });
});

// --- Config does not mutate DEFAULTS ---
test('loadConfig does not mutate DEFAULTS singleton', () => {
  const originalSrcDirs = JSON.parse(JSON.stringify(DEFAULTS.srcDirs));
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      srcDirs: ['custom'],
    }));
    loadConfig(dir);
    assert.deepStrictEqual(DEFAULTS.srcDirs, originalSrcDirs);
  });
});

console.log('');
console.log(`config-loader: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
