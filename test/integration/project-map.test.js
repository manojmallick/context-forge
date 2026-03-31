'use strict';

/**
 * Integration tests for gen-project-map.js (v0.4)
 *
 * Tests generated in a temp directory to avoid polluting the project root.
 * Each test group uses fresh fixture files.
 */

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');
const os     = require('os');
const { spawnSync } = require('child_process');

const GEN_MAP  = path.resolve(__dirname, '../../gen-project-map.js');
const FIXTURES = path.join(__dirname, '../fixtures');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cf-map-test-'));
}

function rmdir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Run gen-project-map.js inside tmpDir, return {stdout, stderr, status}.
 */
function runMap(tmpDir) {
  return spawnSync(process.execPath, [GEN_MAP], {
    cwd: tmpDir,
    encoding: 'utf8',
    timeout: 10000,
  });
}

// ---------------------------------------------------------------------------
// Fixture writers
// ---------------------------------------------------------------------------
function writeFixtures(tmpDir, fixtures) {
  for (const [rel, content] of Object.entries(fixtures)) {
    const fullPath = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
console.log('\nproject-map integration tests\n');

// ── 1. gen-project-map.js creates PROJECT_MAP.md ──────────────────────────
test('creates PROJECT_MAP.md', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/index.ts':  'export function main() {}',
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    const result = runMap(tmp);
    assert.strictEqual(result.status, 0, `exit ${result.status}: ${result.stderr}`);

    const outPath = path.join(tmp, 'PROJECT_MAP.md');
    assert.ok(fs.existsSync(outPath), 'PROJECT_MAP.md not created');

    const content = fs.readFileSync(outPath, 'utf8');
    assert.ok(content.includes('# Project Map'), 'Missing title');
    assert.ok(content.includes('gen-project-map.js v0.4.0'), 'Missing version tag');
  } finally {
    rmdir(tmp);
  }
});

// ── 2. All three sections are present ────────────────────────────────────
test('writes all three ### sections', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/index.ts': 'export function main() {}',
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runMap(tmp);
    const content = fs.readFileSync(path.join(tmp, 'PROJECT_MAP.md'), 'utf8');

    assert.ok(content.includes('### Import graph'),    'Missing ### Import graph');
    assert.ok(content.includes('### Class hierarchy'), 'Missing ### Class hierarchy');
    assert.ok(content.includes('### Route table'),     'Missing ### Route table');
  } finally {
    rmdir(tmp);
  }
});

// ── 3. Import graph captures dependencies ────────────────────────────────
test('import graph: detects JS dependency arrow', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/index.ts':  "import { logger } from './utils/logger';\nexport function main() {}",
      'src/utils/logger.ts': "export function logger(msg: string) { console.log(msg); }",
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runMap(tmp);
    const content = fs.readFileSync(path.join(tmp, 'PROJECT_MAP.md'), 'utf8');

    assert.ok(content.includes('→'), 'No dependency arrow found in import graph');
    assert.ok(
      content.includes('src/index.ts') && content.includes('src/utils/logger.ts'),
      'Expected files not shown in import graph'
    );
  } finally {
    rmdir(tmp);
  }
});

// ── 4. Import graph: circular dependency →  ⚠ warning ────────────────────
test('import graph: circular dependency detected with ⚠', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/a.ts': "import { b } from './b';\nexport const a = 1;",
      'src/b.ts': "import { a } from './a';\nexport const b = 2;",
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runMap(tmp);
    const content = fs.readFileSync(path.join(tmp, 'PROJECT_MAP.md'), 'utf8');

    assert.ok(content.includes('⚠'), 'No circular dependency warning (⚠) found');
  } finally {
    rmdir(tmp);
  }
});

// ── 5. Class hierarchy captured ──────────────────────────────────────────
test('class hierarchy: captures extends relationship', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/service.ts': [
        'class BaseService { protected db: any; }',
        'export class UserService extends BaseService {',
        '  getUsers() { return []; }',
        '}',
      ].join('\n'),
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runMap(tmp);
    const content = fs.readFileSync(path.join(tmp, 'PROJECT_MAP.md'), 'utf8');

    assert.ok(content.includes('UserService'), 'UserService not in class hierarchy');
    assert.ok(content.includes('extends'), '"extends" not in class hierarchy');
    assert.ok(content.includes('BaseService'), 'BaseService not in class hierarchy');
  } finally {
    rmdir(tmp);
  }
});

// ── 6. Class hierarchy: implements captured ───────────────────────────────
test('class hierarchy: captures implements', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/ctrl.ts': [
        'interface IController { handle(): void; }',
        'export class AuthController extends BaseCtrl implements IController {',
        '  handle() {}',
        '}',
      ].join('\n'),
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runMap(tmp);
    const content = fs.readFileSync(path.join(tmp, 'PROJECT_MAP.md'), 'utf8');

    assert.ok(content.includes('implements'), '"implements" not in class hierarchy');
  } finally {
    rmdir(tmp);
  }
});

// ── 7. Route table: Express routes detected ───────────────────────────────
test('route table: detects Express routes', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/routes.ts': [
        "const router = require('express').Router();",
        "router.get('/users', getUsers);",
        "router.post('/users', createUser);",
        "router.delete('/users/:id', deleteUser);",
      ].join('\n'),
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runMap(tmp);
    const content = fs.readFileSync(path.join(tmp, 'PROJECT_MAP.md'), 'utf8');

    assert.ok(content.includes('| GET'), 'GET route not in route table');
    assert.ok(content.includes('| POST'), 'POST route not in route table');
    assert.ok(content.includes('/users'), 'Route path not in route table');
  } finally {
    rmdir(tmp);
  }
});

// ── 8. Route table: Flask routes detected ────────────────────────────────
test('route table: detects Flask routes', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/views.py': [
        "from flask import Flask",
        "app = Flask(__name__)",
        "@app.route('/items', methods=['GET', 'POST'])",
        "def items():",
        "    return []",
      ].join('\n'),
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runMap(tmp);
    const content = fs.readFileSync(path.join(tmp, 'PROJECT_MAP.md'), 'utf8');

    assert.ok(content.includes('/items'), 'Flask route /items not found');
  } finally {
    rmdir(tmp);
  }
});

// ── 9. No crash on empty project ─────────────────────────────────────────
test('no crash on empty project / missing srcDirs', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    const result = runMap(tmp);
    assert.strictEqual(result.status, 0, `crashed with exit ${result.status}: ${result.stderr}`);
    assert.ok(fs.existsSync(path.join(tmp, 'PROJECT_MAP.md')), 'PROJECT_MAP.md not created');
  } finally {
    rmdir(tmp);
  }
});

// ── 10. --version and --help flags work ──────────────────────────────────
test('--version flag prints version', () => {
  const result = spawnSync(process.execPath, [GEN_MAP, '--version'], { encoding: 'utf8' });
  assert.ok(result.stdout.includes('0.4.0'), `version output: ${result.stdout}`);
  assert.strictEqual(result.status, 0);
});

test('--help flag prints usage', () => {
  const result = spawnSync(process.execPath, [GEN_MAP, '--help'], { encoding: 'utf8' });
  assert.ok(result.stdout.includes('Usage:'), `help output: ${result.stdout}`);
  assert.strictEqual(result.status, 0);
});

// ── 11. MCP get_map: sections are extractable from generated file ─────────
test('MCP get_map: ### sections are correctly delimited for extraction', () => {
  const tmp = mkTmp();
  try {
    writeFixtures(tmp, {
      'src/index.ts':  "import { auth } from './auth';\nexport function main() {}",
      'src/auth.ts':   "export function auth() {}",
      'src/svc.ts':    "class UserService extends Base { getAll() {} }",
      'gen-context.config.json': JSON.stringify({ srcDirs: ['src'] }),
    });

    runMap(tmp);
    const content = fs.readFileSync(path.join(tmp, 'PROJECT_MAP.md'), 'utf8');

    // Simulate what the MCP get_map handler does
    const sections = ['### Import graph', '### Class hierarchy', '### Route table'];
    for (const header of sections) {
      const idx = content.indexOf(header);
      assert.ok(idx !== -1, `Header "${header}" not found in PROJECT_MAP.md`);

      const after = content.slice(idx);
      const nextMatch = after.slice(header.length).search(/\n###\s/);
      const sectionContent = nextMatch === -1 ? after : after.slice(0, header.length + nextMatch);
      assert.ok(sectionContent.startsWith(header), `Section extraction broken for ${header}`);
    }
  } finally {
    rmdir(tmp);
  }
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
const total = passCount + failCount;
console.log(`\n${passCount}/${total} project-map tests passed\n`);

if (failCount > 0) process.exit(1);
