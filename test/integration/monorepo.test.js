'use strict';

/**
 * Integration tests for monorepo support (v0.5)
 *
 * Verifies that --monorepo flag generates per-package CLAUDE.md files
 * for each detected package under packages/, apps/, or services/.
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cf-mono-test-'));
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

function runMonorepo(tmpDir) {
  return spawnSync(process.execPath, [GEN, '--monorepo'], {
    cwd: tmpDir,
    encoding: 'utf8',
    timeout: 15000,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
console.log('\nmonorepo integration tests\n');

// ── 1. Generates CLAUDE.md per package under packages/ ───────────────────
test('generates one CLAUDE.md per package under packages/', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'packages/auth/package.json':  '{"name":"auth"}',
      'packages/auth/src/index.ts':  'export function authenticate() {}',
      'packages/core/package.json':  '{"name":"core"}',
      'packages/core/src/index.ts':  'export function coreInit() {}',
      'packages/ui/package.json':    '{"name":"ui"}',
      'packages/ui/src/Button.tsx':  'export function Button() {}',
    });

    const result = runMonorepo(tmp);
    assert.strictEqual(result.status, 0, `exit ${result.status}: ${result.stderr}`);

    const expected = ['auth', 'core', 'ui'];
    for (const pkg of expected) {
      const claudePath = path.join(tmp, 'packages', pkg, 'CLAUDE.md');
      assert.ok(fs.existsSync(claudePath), `Missing CLAUDE.md for ${pkg}`);
    }
  } finally {
    rmdir(tmp);
  }
});

// ── 2. Per-package CLAUDE.md contains signatures for that package only ────
test('per-package CLAUDE.md contains package-specific signatures', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'packages/payments/package.json': '{"name":"payments"}',
      'packages/payments/src/charge.ts': 'export function chargeCard() {}\nexport function refund() {}',
      'packages/users/package.json':     '{"name":"users"}',
      'packages/users/src/user.ts':      'export function createUser() {}\nexport function deleteUser() {}',
    });

    runMonorepo(tmp);

    const payContent = fs.readFileSync(
      path.join(tmp, 'packages', 'payments', 'CLAUDE.md'), 'utf8'
    );
    const userContent = fs.readFileSync(
      path.join(tmp, 'packages', 'users', 'CLAUDE.md'), 'utf8'
    );

    assert.ok(payContent.includes('chargeCard'), 'chargeCard not in payments CLAUDE.md');
    assert.ok(!payContent.includes('createUser'), 'createUser leaked into payments CLAUDE.md');
    assert.ok(userContent.includes('createUser'), 'createUser not in users CLAUDE.md');
    assert.ok(!userContent.includes('chargeCard'), 'chargeCard leaked into users CLAUDE.md');
  } finally {
    rmdir(tmp);
  }
});

// ── 3. Works with apps/ directory ────────────────────────────────────────
test('detects packages under apps/ directory', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'apps/web/package.json':    '{"name":"web"}',
      'apps/web/src/app.ts':      'export function renderApp() {}',
      'apps/mobile/package.json': '{"name":"mobile"}',
      'apps/mobile/src/app.ts':   'export function renderMobile() {}',
    });

    const result = runMonorepo(tmp);
    assert.strictEqual(result.status, 0, `exit ${result.status}: ${result.stderr}`);

    assert.ok(
      fs.existsSync(path.join(tmp, 'apps', 'web', 'CLAUDE.md')),
      'Missing CLAUDE.md for apps/web'
    );
    assert.ok(
      fs.existsSync(path.join(tmp, 'apps', 'mobile', 'CLAUDE.md')),
      'Missing CLAUDE.md for apps/mobile'
    );
  } finally {
    rmdir(tmp);
  }
});

// ── 4. Works with services/ directory ────────────────────────────────────
test('detects packages under services/ directory', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'services/api/package.json':    '{"name":"api"}',
      'services/api/src/server.ts':   'export function startServer() {}',
      'services/worker/package.json': '{"name":"worker"}',
      'services/worker/src/job.ts':   'export function processJob() {}',
    });

    const result = runMonorepo(tmp);
    assert.strictEqual(result.status, 0, `exit ${result.status}: ${result.stderr}`);

    assert.ok(
      fs.existsSync(path.join(tmp, 'services', 'api', 'CLAUDE.md')),
      'Missing CLAUDE.md for services/api'
    );
    assert.ok(
      fs.existsSync(path.join(tmp, 'services', 'worker', 'CLAUDE.md')),
      'Missing CLAUDE.md for services/worker'
    );
  } finally {
    rmdir(tmp);
  }
});

// ── 5. Non-JS manifest files are detected (Cargo.toml, go.mod, etc.) ─────
test('detects Rust/Go/Python package manifests', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'packages/rust-pkg/Cargo.toml':    '[package]\nname = "rust-pkg"',
      'packages/rust-pkg/src/lib.rs':    'pub fn rust_fn() {}',
      'packages/go-pkg/go.mod':          'module go-pkg\ngo 1.21',
      'packages/go-pkg/main.go':         'package main\nfunc GoFn() {}',
    });

    const result = runMonorepo(tmp);
    assert.strictEqual(result.status, 0, `exit ${result.status}: ${result.stderr}`);

    const pkgs = ['rust-pkg', 'go-pkg'];
    for (const pkg of pkgs) {
      assert.ok(
        fs.existsSync(path.join(tmp, 'packages', pkg, 'CLAUDE.md')),
        `Missing CLAUDE.md for ${pkg}`
      );
    }
  } finally {
    rmdir(tmp);
  }
});

// ── 6. No crash on empty monorepo (no packages found) ────────────────────
test('no crash when no packages found', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/index.ts': 'export function main() {}',
    });

    const result = runMonorepo(tmp);
    // Should exit 0 (or with a warning, but not crash)
    assert.strictEqual(result.status, 0, `exited with ${result.status}: ${result.stderr}`);
    assert.ok(
      result.stderr.includes('no monorepo packages found'),
      'Expected warning about no packages found'
    );
  } finally {
    rmdir(tmp);
  }
});

// ── 7. config.monorepo: true triggers monorepo mode without --monorepo flag
test('config.monorepo: true triggers monorepo without --monorepo flag', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'packages/lib/package.json': '{"name":"lib"}',
      'packages/lib/src/util.ts':  'export function libUtil() {}',
      'gen-context.config.json':   JSON.stringify({ monorepo: true }),
    });

    const result = spawnSync(process.execPath, [GEN], {
      cwd: tmp, encoding: 'utf8', timeout: 10000,
    });

    assert.strictEqual(result.status, 0, `exit ${result.status}: ${result.stderr}`);
    assert.ok(
      fs.existsSync(path.join(tmp, 'packages', 'lib', 'CLAUDE.md')),
      'CLAUDE.md not generated via config.monorepo: true'
    );
  } finally {
    rmdir(tmp);
  }
});

// ── 8. 5-package monorepo produces 5 CLAUDE.md files ────────────────────
test('5-package monorepo produces 5 CLAUDE.md files', () => {
  const tmp = mkTmp();
  try {
    const pkgs = ['auth', 'core', 'events', 'payments', 'notifications'];
    for (const pkg of pkgs) {
      writeFixtures(tmp, {
        [`packages/${pkg}/package.json`]: `{"name":"${pkg}"}`,
        [`packages/${pkg}/src/index.ts`]: `export function ${pkg}Init() {}`,
      });
    }

    runMonorepo(tmp);

    let found = 0;
    for (const pkg of pkgs) {
      if (fs.existsSync(path.join(tmp, 'packages', pkg, 'CLAUDE.md'))) found++;
    }
    assert.strictEqual(found, 5, `Expected 5 CLAUDE.md files, found ${found}`);
  } finally {
    rmdir(tmp);
  }
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
const total = passCount + failCount;
console.log(`\n${passCount}/${total} monorepo tests passed\n`);

if (failCount > 0) process.exit(1);
