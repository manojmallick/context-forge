'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const GEN_CONTEXT = path.resolve(__dirname, '../../gen-context.js');
const { classify, classifyAll } = require('../../src/routing/classifier');
const { TIERS, formatRoutingSection } = require('../../src/routing/hints');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-routing-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runGenerate(dir, extraArgs = '') {
  return execSync(`node "${GEN_CONTEXT}" ${extraArgs}`.trim(), {
    cwd: dir,
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function seedSrc(dir) {
  const srcDir = path.join(dir, 'src');
  fs.mkdirSync(path.join(srcDir, 'security'), { recursive: true });
  fs.mkdirSync(path.join(srcDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(srcDir, 'api'), { recursive: true });

  // Complex security file → powerful
  fs.writeFileSync(path.join(srcDir, 'security', 'auth.js'), [
    'function verifyToken(token) {}',
    'function signJwt(payload) {}',
    'function hashPassword(pwd) {}',
    'function checkPermissions(user, resource) {}',
    'function revokeToken(jti) {}',
    'function refreshToken(token) {}',
    'function validateApiKey(key) {}',
    'function auditLog(event) {}',
    'function encryptField(value) {}',
    'function decryptField(value) {}',
    'function rateLimitCheck(ip) {}',
    'function detectBruteForce(ip) {}',
  ].join('\n'));

  // Simple config file → fast
  fs.writeFileSync(path.join(srcDir, 'config', 'defaults.js'), [
    'const TIMEOUT = 5000;',
    'module.exports = { TIMEOUT };',
  ].join('\n'));

  // Standard API handler → balanced
  fs.writeFileSync(path.join(srcDir, 'api', 'users.js'), [
    'function getUser(req, res) {}',
    'function createUser(req, res) {}',
    'function updateUser(req, res) {}',
    'function deleteUser(req, res) {}',
  ].join('\n'));

  // YAML config → fast
  fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'version: "3"\nservices:\n  app:\n    image: node\n');
}

// ─────────────────────────────────────────────────────────────
// Unit tests: classify()
// ─────────────────────────────────────────────────────────────

test('classify: JSON file → fast', () => {
  assert.strictEqual(classify('/project/src/config/db.json', []), 'fast');
});

test('classify: YAML file → fast', () => {
  assert.strictEqual(classify('/project/docker-compose.yml', ['build:', 'ports:']), 'fast');
});

test('classify: HTML file → fast', () => {
  assert.strictEqual(classify('/project/src/index.html', []), 'fast');
});

test('classify: CSS file → fast', () => {
  assert.strictEqual(classify('/project/src/styles/main.css', ['body', '.header']), 'fast');
});

test('classify: Dockerfile → fast', () => {
  assert.strictEqual(classify('/project/Dockerfile', ['FROM node:18', 'CMD']), 'fast');
});

test('classify: shell script → fast', () => {
  assert.strictEqual(classify('/project/scripts/setup.sh', ['function install_deps']), 'fast');
});

test('classify: tiny JS file (2 sigs) → fast', () => {
  assert.strictEqual(classify('/project/src/utils/noop.js', ['function noop()', 'module.exports = noop']), 'fast');
});

test('classify: security/ path → powerful', () => {
  assert.strictEqual(classify('/project/src/security/scanner.js', ['function scan()', 'function redact()']), 'powerful');
});

test('classify: auth/ path → powerful', () => {
  assert.strictEqual(classify('/project/src/auth/middleware.js', ['function verify()']), 'powerful');
});

test('classify: core/ path → powerful', () => {
  assert.strictEqual(classify('/project/src/core/engine.js', ['function run()', 'function stop()']), 'powerful');
});

test('classify: 12 or more sigs → powerful regardless of path', () => {
  const sigs = Array.from({ length: 12 }, (_, i) => `function fn${i}()`);
  assert.strictEqual(classify('/project/src/utils/heavy.js', sigs), 'powerful');
});

test('classify: 8 indented method sigs → powerful', () => {
  const sigs = ['class Foo', ...Array.from({ length: 8 }, (_, i) => `  method${i}()`)];
  assert.strictEqual(classify('/project/src/utils/foo.js', sigs), 'powerful');
});

test('classify: standard 5-sig JS file → balanced', () => {
  const sigs = ['function a()', 'function b()', 'function c()', 'function d()', 'function e()'];
  assert.strictEqual(classify('/project/src/api/routes.js', sigs), 'balanced');
});

test('classify: test file → balanced', () => {
  assert.strictEqual(classify('/project/src/api/routes.test.js', ['test()', 'describe()']), 'balanced');
});

// ─────────────────────────────────────────────────────────────
// classifyAll() groups correctly
// ─────────────────────────────────────────────────────────────

test('classifyAll: groups entries into three tiers', () => {
  withTempProject((dir) => {
    const entries = [
      { filePath: path.join(dir, 'src/config/db.json'), sigs: [] },
      { filePath: path.join(dir, 'src/api/users.js'), sigs: ['fn1()', 'fn2()', 'fn3()'] },
      { filePath: path.join(dir, 'src/security/auth.js'), sigs: Array.from({ length: 12 }, (_, i) => `fn${i}()`) },
    ];
    const result = classifyAll(entries, dir);
    assert.ok(Array.isArray(result.fast), 'fast should be array');
    assert.ok(Array.isArray(result.balanced), 'balanced should be array');
    assert.ok(Array.isArray(result.powerful), 'powerful should be array');
    assert.ok(result.fast.length >= 1, 'config file should be fast');
    assert.ok(result.powerful.length >= 1, 'security file should be powerful');
  });
});

// ─────────────────────────────────────────────────────────────
// formatRoutingSection()
// ─────────────────────────────────────────────────────────────

test('formatRoutingSection: includes all three tier headings', () => {
  const groups = { fast: ['src/config/db.json'], balanced: ['src/api/users.js'], powerful: ['src/security/auth.js'] };
  const section = formatRoutingSection(groups);
  assert.ok(section.includes('## Model routing hints'), 'Should have section header');
  assert.ok(section.includes('Fast'), 'Should have fast tier');
  assert.ok(section.includes('Balanced'), 'Should have balanced tier');
  assert.ok(section.includes('Powerful'), 'Should have powerful tier');
});

test('formatRoutingSection: lists files under their tier', () => {
  const groups = { fast: ['src/config/db.json'], balanced: [], powerful: [] };
  const section = formatRoutingSection(groups);
  assert.ok(section.includes('src/config/db.json'), 'Should list fast file');
});

test('formatRoutingSection: shows none-detected when tier is empty', () => {
  const groups = { fast: [], balanced: ['src/api/routes.js'], powerful: [] };
  const section = formatRoutingSection(groups);
  assert.ok(section.includes('_(none detected)_'), 'Should show none-detected for empty tiers');
});

test('TIERS object has fast, balanced, powerful keys', () => {
  assert.ok(TIERS.fast, 'Should have fast tier');
  assert.ok(TIERS.balanced, 'Should have balanced tier');
  assert.ok(TIERS.powerful, 'Should have powerful tier');
  for (const tier of Object.values(TIERS)) {
    assert.ok(tier.label, 'Should have label');
    assert.ok(tier.examples, 'Should have examples');
    assert.ok(Array.isArray(tier.tasks), 'Should have tasks array');
    assert.ok(tier.costHint, 'Should have costHint');
  }
});

// ─────────────────────────────────────────────────────────────
// Integration: --routing flag embeds section in output file
// ─────────────────────────────────────────────────────────────

test('--routing flag adds routing hints section to output', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    runGenerate(dir, '--routing');

    const outPath = path.join(dir, '.github', 'copilot-instructions.md');
    assert.ok(fs.existsSync(outPath), 'Output file should exist');
    const content = fs.readFileSync(outPath, 'utf8');
    assert.ok(content.includes('## Model routing hints'), 'Should include routing section');
    assert.ok(content.includes('Fast'), 'Should include fast tier');
    assert.ok(content.includes('Powerful'), 'Should include powerful tier');
  });
});

test('generate without --routing does NOT include routing section', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    runGenerate(dir);

    const outPath = path.join(dir, '.github', 'copilot-instructions.md');
    const content = fs.readFileSync(outPath, 'utf8');
    assert.ok(!content.includes('## Model routing hints'), 'Should NOT include routing section by default');
  });
});

test('routing: true in config embeds routing hints without --routing flag', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ routing: true }) + '\n'
    );
    runGenerate(dir);

    const outPath = path.join(dir, '.github', 'copilot-instructions.md');
    const content = fs.readFileSync(outPath, 'utf8');
    assert.ok(content.includes('## Model routing hints'), 'Should include routing section when config.routing=true');
  });
});

// ─────────────────────────────────────────────────────────────
// MCP: get_routing tool
// ─────────────────────────────────────────────────────────────

function mcpCall(messages, cwd) {
  const input = (Array.isArray(messages) ? messages : [messages])
    .map((m) => JSON.stringify(m))
    .join('\n') + '\n';

  const stdout = execSync(`node "${GEN_CONTEXT}" --mcp`, {
    input,
    cwd,
    encoding: 'utf8',
    timeout: 10000,
  });

  return stdout.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

test('tools/list includes get_routing and core MCP tools', () => {
  withTempProject((dir) => {
    const [res] = mcpCall({ jsonrpc: '2.0', method: 'tools/list', id: 1 }, dir);
    const names = res.result.tools.map((t) => t.name);
    assert.ok(names.length >= 5, `Should have at least 5 tools, got ${names.length}`);
    assert.ok(names.includes('read_context'), 'Should include read_context');
    assert.ok(names.includes('search_signatures'), 'Should include search_signatures');
    assert.ok(names.includes('get_map'), 'Should include get_map');
    assert.ok(names.includes('get_routing'), 'Should include get_routing');
  });
});

test('get_routing returns routing markdown when context file present', () => {
  withTempProject((dir) => {
    seedSrc(dir);
    runGenerate(dir, '--routing');

    const [res] = mcpCall(
      { jsonrpc: '2.0', method: 'tools/call', id: 2, params: { name: 'get_routing', arguments: {} } },
      dir
    );
    const text = res.result.content[0].text;
    assert.ok(text.includes('Model routing hints') || text.includes('fast') || text.includes('balanced'),
      'Should return routing content');
  });
});

test('get_routing returns helpful message when no context file', () => {
  withTempProject((dir) => {
    const [res] = mcpCall(
      { jsonrpc: '2.0', method: 'tools/call', id: 3, params: { name: 'get_routing', arguments: {} } },
      dir
    );
    const text = res.result.content[0].text;
    assert.ok(text.includes('gen-context.js'), 'Should mention gen-context.js');
  });
});

console.log('');
console.log(`routing: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
