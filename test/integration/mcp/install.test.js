'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const GEN_CONTEXT = path.resolve(__dirname, '../../../gen-context.js');

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

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-mcp-install-'));
  fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({ srcDirs: [] }));
  return dir;
}

function cleanup(dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
  }
}

/** Run gen-context.js; returns { stdout, status }. Never throws on non-zero. */
function run(dir, argv, extraEnv) {
  try {
    const stdout = execFileSync('node', [GEN_CONTEXT, ...argv], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, ...(extraEnv || {}) },
    });
    return { stdout, status: 0 };
  } catch (err) {
    return { stdout: (err.stdout || '') + (err.stderr || ''), status: err.status || 1 };
  }
}

console.log('\nmcp-install: sigmap mcp install/list tests\n');

// ── mcp list ────────────────────────────────────────────────────────────────
test('mcp list prints supported clients with config paths', () => {
  const dir = makeTmpDir();
  try {
    const { stdout, status } = run(dir, ['mcp', 'list']);
    assert.strictEqual(status, 0, 'mcp list should exit 0');
    assert.ok(/claude/.test(stdout), 'should list claude');
    assert.ok(/cursor/.test(stdout), 'should list cursor');
    assert.ok(/\.claude[\/\\]settings\.json/.test(stdout), 'should show claude config path');
  } finally {
    cleanup([dir]);
  }
});

test('mcp list --json emits parseable client array with target paths', () => {
  const dir = makeTmpDir();
  try {
    const { stdout, status } = run(dir, ['mcp', 'list', '--json']);
    assert.strictEqual(status, 0);
    const clients = JSON.parse(stdout);
    assert.ok(Array.isArray(clients) && clients.length >= 5, 'should be an array of clients');
    const claude = clients.find((c) => c.client === 'claude');
    assert.ok(claude && claude.target, 'claude entry should carry a target path');
  } finally {
    cleanup([dir]);
  }
});

// ── install creates config when absent ───────────────────────────────────────
test('mcp install claude writes a valid sigmap entry, creating the dir', () => {
  const dir = makeTmpDir();
  try {
    assert.ok(!fs.existsSync(path.join(dir, '.claude')), '.claude must not pre-exist');
    const { status } = run(dir, ['mcp', 'install', 'claude']);
    assert.strictEqual(status, 0);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
    assert.ok(cfg.mcpServers?.sigmap, 'mcpServers.sigmap should be set');
    assert.strictEqual(cfg.mcpServers.sigmap.command, 'node');
    assert.ok(Array.isArray(cfg.mcpServers.sigmap.args));
    assert.ok(cfg.mcpServers.sigmap.args.includes('--mcp'), 'args should include --mcp');
  } finally {
    cleanup([dir]);
  }
});

// ── idempotency ───────────────────────────────────────────────────────────────
test('mcp install is idempotent — re-run reports already-installed, no duplicate', () => {
  const dir = makeTmpDir();
  try {
    run(dir, ['mcp', 'install', 'cursor']);
    const { stdout, status } = run(dir, ['mcp', 'install', 'cursor']);
    assert.strictEqual(status, 0);
    assert.ok(/already/.test(stdout), 'second run should report already registered');
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.cursor', 'mcp.json'), 'utf8'));
    assert.strictEqual(Object.keys(cfg.mcpServers).length, 1, 'exactly one server entry');
  } finally {
    cleanup([dir]);
  }
});

test('mcp install preserves an existing different sigmap entry', () => {
  const dir = makeTmpDir();
  try {
    fs.mkdirSync(path.join(dir, '.cursor'));
    fs.writeFileSync(
      path.join(dir, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { sigmap: { command: 'node', args: ['existing'] } } })
    );
    run(dir, ['mcp', 'install', 'cursor']);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.cursor', 'mcp.json'), 'utf8'));
    assert.deepStrictEqual(cfg.mcpServers.sigmap.args, ['existing'], 'existing entry must not be overwritten');
  } finally {
    cleanup([dir]);
  }
});

test('mcp install merges alongside another mcp server', () => {
  const dir = makeTmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'foo', args: [] } } })
    );
    run(dir, ['mcp', 'install', 'mcp']);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'));
    assert.ok(cfg.mcpServers.other, 'pre-existing server must be preserved');
    assert.ok(cfg.mcpServers.sigmap, 'sigmap must be added');
  } finally {
    cleanup([dir]);
  }
});

// ── Zed shape (context_servers) ───────────────────────────────────────────────
test('mcp install zed produces context_servers shape (not mcpServers)', () => {
  const dir      = makeTmpDir();
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-home-'));
  try {
    const { status } = run(dir, ['mcp', 'install', 'zed'], { HOME: fakeHome, USERPROFILE: fakeHome });
    assert.strictEqual(status, 0);
    const cfg = JSON.parse(fs.readFileSync(path.join(fakeHome, '.config', 'zed', 'settings.json'), 'utf8'));
    assert.ok(cfg.context_servers?.sigmap, 'context_servers.sigmap should be set');
    assert.strictEqual(cfg.context_servers.sigmap.command.path, 'node');
    assert.ok(Array.isArray(cfg.context_servers.sigmap.command.args));
  } finally {
    cleanup([dir, fakeHome]);
  }
});

// ── Codex YAML shape ──────────────────────────────────────────────────────────
test('mcp install codex produces a YAML mcpServers block', () => {
  const dir      = makeTmpDir();
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-home-'));
  try {
    const { status } = run(dir, ['mcp', 'install', 'codex'], { HOME: fakeHome, USERPROFILE: fakeHome });
    assert.strictEqual(status, 0);
    const raw = fs.readFileSync(path.join(fakeHome, '.codex', 'config.yaml'), 'utf8');
    assert.ok(/mcpServers:/.test(raw), 'should contain mcpServers: block');
    assert.ok(/sigmap:/.test(raw), 'should register sigmap');
    assert.ok(/- --mcp/.test(raw), 'should pass --mcp arg');
  } finally {
    cleanup([dir, fakeHome]);
  }
});

// ── --global scope ────────────────────────────────────────────────────────────
test('mcp install windsurf --global targets the user-level config', () => {
  const dir      = makeTmpDir();
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-home-'));
  try {
    const { status } = run(dir, ['mcp', 'install', 'windsurf', '--global'], { HOME: fakeHome, USERPROFILE: fakeHome });
    assert.strictEqual(status, 0);
    const globalPath = path.join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json');
    assert.ok(fs.existsSync(globalPath), 'global windsurf config should be created');
    assert.ok(!fs.existsSync(path.join(dir, '.windsurf')), 'project config should not be created with --global');
    const cfg = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
    assert.ok(cfg.mcpServers?.sigmap);
  } finally {
    cleanup([dir, fakeHome]);
  }
});

// ── error handling ────────────────────────────────────────────────────────────
test('mcp install <unknown> exits non-zero and lists valid clients', () => {
  const dir = makeTmpDir();
  try {
    const { stdout, status } = run(dir, ['mcp', 'install', 'bogus']);
    assert.notStrictEqual(status, 0, 'unknown client should exit non-zero');
    assert.ok(/claude/.test(stdout) && /cursor/.test(stdout), 'should list valid clients');
  } finally {
    cleanup([dir]);
  }
});

test('mcp install with no client name exits non-zero with usage', () => {
  const dir = makeTmpDir();
  try {
    const { status } = run(dir, ['mcp', 'install']);
    assert.notStrictEqual(status, 0);
  } finally {
    cleanup([dir]);
  }
});


// ── VS Code uses `servers`, not `mcpServers` (#556) ───────────────────────────

const { installClient: _install } = require(path.resolve(__dirname, '../../../src/mcp/install.js'));
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('vscode: writes a top-level servers key, not mcpServers', () => {
  const dir = makeTmpDir();
  const r = _install('vscode', { cwd: dir, scriptPath: '/x/gen-context.js' });
  assert.strictEqual(r.status, 'installed');
  const cfg = readJson(r.path);
  assert.ok(cfg.servers, 'VS Code reads `servers` — it ignores `mcpServers`');
  assert.ok(!cfg.mcpServers, 'must not write the generic mcpServers shape');
  assert.ok(cfg.servers.sigmap, 'sigmap entry missing');
});

test('vscode: the entry declares the stdio transport', () => {
  const dir = makeTmpDir();
  const r = _install('vscode', { cwd: dir, scriptPath: '/x/gen-context.js' });
  const e = readJson(r.path).servers.sigmap;
  assert.strictEqual(e.type, 'stdio');
  assert.strictEqual(e.command, 'node');
  assert.deepStrictEqual(e.args, [path.resolve('/x/gen-context.js'), '--mcp']);
});

test('vscode: re-running is idempotent', () => {
  const dir = makeTmpDir();
  _install('vscode', { cwd: dir, scriptPath: '/x/gen-context.js' });
  const again = _install('vscode', { cwd: dir, scriptPath: '/x/gen-context.js' });
  assert.strictEqual(again.status, 'already');
});

test('vscode: a legacy mcpServers.sigmap config is migrated to servers', () => {
  const dir = makeTmpDir();
  fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.vscode', 'mcp.json'), JSON.stringify({
    servers: { playwright: { command: 'npx', args: ['-y', 'pw'] } },
    mcpServers: { sigmap: { command: 'node', args: ['/old/gen-context.js', '--mcp'] } },
  }, null, 2));
  const r = _install('vscode', { cwd: dir, scriptPath: '/x/gen-context.js' });
  assert.strictEqual(r.status, 'updated');
  const cfg = readJson(r.path);
  assert.ok(cfg.servers.sigmap, 'sigmap must move under servers');
  assert.ok(!cfg.mcpServers, 'the stale mcpServers block must be removed');
  assert.ok(cfg.servers.playwright, 'unrelated servers must be preserved');
});

test('vscode: unrelated keys in the file survive', () => {
  const dir = makeTmpDir();
  fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.vscode', 'mcp.json'),
    JSON.stringify({ inputs: [{ id: 'token', type: 'promptString' }] }, null, 2));
  const r = _install('vscode', { cwd: dir, scriptPath: '/x/gen-context.js' });
  const cfg = readJson(r.path);
  assert.ok(Array.isArray(cfg.inputs) && cfg.inputs.length === 1, 'inputs must be preserved');
  assert.ok(cfg.servers.sigmap);
});

test('other json clients still write mcpServers', () => {
  for (const client of ['claude', 'cursor', 'mcp']) {
    const dir = makeTmpDir();
    const r = _install(client, { cwd: dir, scriptPath: '/x/gen-context.js' });
    const cfg = readJson(r.path);
    assert.ok(cfg.mcpServers && cfg.mcpServers.sigmap, `${client} must keep the mcpServers shape`);
    assert.ok(!cfg.servers, `${client} must not switch to the VS Code shape`);
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
