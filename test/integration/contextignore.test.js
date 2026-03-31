'use strict';

/**
 * Integration tests for .contextignore / .repomixignore support (v0.5)
 *
 * Verifies that files matching exclusion patterns do not appear
 * in the generated output, even when they would otherwise be extracted.
 */

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');
const os     = require('os');
const { spawnSync } = require('child_process');

const GEN = path.resolve(__dirname, '../../gen-context.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cf-ignore-test-'));
}

function rmdir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFixtures(tmpDir, fixtures) {
  for (const [rel, content] of Object.entries(fixtures)) {
    const fullPath = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
}

function runGen(tmpDir, extraArgs = []) {
  return spawnSync(process.execPath, [GEN, ...extraArgs], {
    cwd: tmpDir,
    encoding: 'utf8',
    timeout: 10000,
  });
}

function readOutput(tmpDir) {
  const p = path.join(tmpDir, '.github', 'copilot-instructions.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
console.log('\ncontextignore integration tests\n');

// ── 1. Files in ignored path don't appear in output ──────────────────────
test('.contextignore excludes matching files', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/index.ts':   'export function main() {}',
      'src/legacy/old.ts': 'export function oldLegacyFn() {}',
      '.contextignore': 'src/legacy/**',
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runGen(tmp);
    const output = readOutput(tmp);

    assert.ok(output.includes('main'), 'main() not in output');
    assert.ok(!output.includes('oldLegacyFn'), 'Legacy function leaked into output despite .contextignore');
  } finally {
    rmdir(tmp);
  }
});

// ── 2. .repomixignore exclusions are also respected ───────────────────────
test('.repomixignore exclusions are merged', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/api.ts':     'export function apiHandler() {}',
      'src/vendor/ext.ts': 'export function vendorUtil() {}',
      '.repomixignore': 'src/vendor/**',
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runGen(tmp);
    const output = readOutput(tmp);

    assert.ok(output.includes('apiHandler'), 'apiHandler not in output');
    assert.ok(!output.includes('vendorUtil'), 'vendorUtil from repomixignore leaked into output');
  } finally {
    rmdir(tmp);
  }
});

// ── 3. Both ignore files are unioned ─────────────────────────────────────
test('.contextignore and .repomixignore are unioned', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/a.ts':       'export function keep() {}',
      'src/skip1/b.ts': 'export function skipContextIgnore() {}',
      'src/skip2/c.ts': 'export function skipRepomixIgnore() {}',
      '.contextignore': 'src/skip1/**',
      '.repomixignore': 'src/skip2/**',
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runGen(tmp);
    const output = readOutput(tmp);

    assert.ok(output.includes('keep'), 'keep() not in output');
    assert.ok(!output.includes('skipContextIgnore'), 'skipContextIgnore leaked via .contextignore');
    assert.ok(!output.includes('skipRepomixIgnore'), 'skipRepomixIgnore leaked via .repomixignore');
  } finally {
    rmdir(tmp);
  }
});

// ── 4. Wildcard glob in .contextignore ────────────────────────────────────
test('.contextignore: *.test.ts pattern excludes test files', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/service.ts':      'export function doWork() {}',
      'src/service.test.ts': 'export function testDoWork() {}',
      '.contextignore':      '*.test.ts',
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runGen(tmp);
    const output = readOutput(tmp);

    assert.ok(output.includes('doWork'), 'doWork not in output');
    assert.ok(!output.includes('testDoWork'), 'test function leaked despite .contextignore *.test.ts pattern');
  } finally {
    rmdir(tmp);
  }
});

// ── 5. Empty .contextignore includes everything ───────────────────────────
test('empty .contextignore does not exclude anything', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/a.ts':       'export function funcA() {}',
      'src/b.ts':       'export function funcB() {}',
      '.contextignore': '',  // empty
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runGen(tmp);
    const output = readOutput(tmp);

    assert.ok(output.includes('funcA'), 'funcA not in output');
    assert.ok(output.includes('funcB'), 'funcB not in output');
  } finally {
    rmdir(tmp);
  }
});

// ── 6. Comments in .contextignore are ignored ────────────────────────────
test('.contextignore: comment lines (# ...) are not treated as patterns', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/important.ts': 'export function criticalFn() {}',
      '.contextignore': [
        '# This is a comment — should not exclude anything',
        '# src/important.ts',
      ].join('\n'),
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runGen(tmp);
    const output = readOutput(tmp);

    assert.ok(output.includes('criticalFn'), 'criticalFn excluded by comment line in .contextignore');
  } finally {
    rmdir(tmp);
  }
});

// ── 7. Config exclude array also excludes directories ─────────────────────
test('config.exclude array excludes whole directories', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/main.ts':         'export function mainFn() {}',
      'src/generated/pb.ts': 'export function generatedFn() {}',
      'gen-context.config.json': JSON.stringify({
        srcDirs: ['src'],
        exclude: ['node_modules', '.git', 'generated'],
      }),
    });

    runGen(tmp);
    const output = readOutput(tmp);

    assert.ok(output.includes('mainFn'), 'mainFn not in output');
    assert.ok(!output.includes('generatedFn'), 'generatedFn from excluded dir leaked into output');
  } finally {
    rmdir(tmp);
  }
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
const total = passCount + failCount;
console.log(`\n${passCount}/${total} contextignore tests passed\n`);

if (failCount > 0) process.exit(1);
