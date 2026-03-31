'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execSync } = require('child_process');

const GEN_CONTEXT = path.resolve(__dirname, '../../gen-context.js');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-multi-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function seedProject(dir) {
  const srcDir = path.join(dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'index.js'),
    'function greet(name) { return `Hello ${name}`; }\nmodule.exports = { greet };\n'
  );
}

function runGenerate(cwd) {
  execSync(`node "${GEN_CONTEXT}"`, {
    cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// ─────────────────────────────────────────────────────────────
// copilot only (default)
// ─────────────────────────────────────────────────────────────
test('Default output writes copilot-instructions.md', () => {
  withTempProject((dir) => {
    seedProject(dir);
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      outputs: ['copilot'],
      secretScan: false,
    }));

    runGenerate(dir);

    const out = path.join(dir, '.github', 'copilot-instructions.md');
    assert.ok(fs.existsSync(out), '.github/copilot-instructions.md should exist');
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('greet'), 'Content should include extracted signature');
  });
});

// ─────────────────────────────────────────────────────────────
// cursor output
// ─────────────────────────────────────────────────────────────
test('cursor output writes .cursorrules', () => {
  withTempProject((dir) => {
    seedProject(dir);
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      outputs: ['cursor'],
      secretScan: false,
    }));

    runGenerate(dir);

    const out = path.join(dir, '.cursorrules');
    assert.ok(fs.existsSync(out), '.cursorrules should exist');
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('greet'), 'Content should include extracted signature');
  });
});

// ─────────────────────────────────────────────────────────────
// windsurf output
// ─────────────────────────────────────────────────────────────
test('windsurf output writes .windsurfrules', () => {
  withTempProject((dir) => {
    seedProject(dir);
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      outputs: ['windsurf'],
      secretScan: false,
    }));

    runGenerate(dir);

    const out = path.join(dir, '.windsurfrules');
    assert.ok(fs.existsSync(out), '.windsurfrules should exist');
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('greet'), 'Content should include extracted signature');
  });
});

// ─────────────────────────────────────────────────────────────
// claude output — CLAUDE.md append strategy
// ─────────────────────────────────────────────────────────────
test('claude output creates CLAUDE.md with signatures', () => {
  withTempProject((dir) => {
    seedProject(dir);
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      outputs: ['claude'],
      secretScan: false,
    }));

    runGenerate(dir);

    const out = path.join(dir, 'CLAUDE.md');
    assert.ok(fs.existsSync(out), 'CLAUDE.md should exist');
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('Auto-generated signatures'), 'Should contain marker');
    assert.ok(content.includes('greet'), 'Should include extracted signature');
  });
});

test('claude output preserves human content above marker', () => {
  withTempProject((dir) => {
    seedProject(dir);

    // Pre-existing CLAUDE.md with human content
    const humanContent = '# My Project\n\nThis is my custom CLAUDE.md content.\n\n## Rules\n- Be concise\n';
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), humanContent);

    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      outputs: ['claude'],
      secretScan: false,
    }));

    runGenerate(dir);

    const out = path.join(dir, 'CLAUDE.md');
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.startsWith('# My Project'), 'Human content at top must be preserved');
    assert.ok(content.includes('This is my custom CLAUDE.md content.'), 'Human content must be intact');
    assert.ok(content.includes('Be concise'), 'Human rules must be intact');
    assert.ok(content.includes('Auto-generated signatures'), 'Marker must exist');
    assert.ok(content.includes('greet'), 'Signatures must be present');
  });
});

test('claude output replaces existing signatures when re-run', () => {
  withTempProject((dir) => {
    seedProject(dir);
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      outputs: ['claude'],
      secretScan: false,
    }));

    // Run once
    runGenerate(dir);

    // Add a second function and run again
    const srcDir = path.join(dir, 'src');
    fs.writeFileSync(
      path.join(srcDir, 'helper.js'),
      'function helper() { return true; }\nmodule.exports = { helper };\n'
    );

    runGenerate(dir);

    const out = path.join(dir, 'CLAUDE.md');
    const content = fs.readFileSync(out, 'utf8');

    // Should not have the marker twice
    const markerCount = (content.match(/Auto-generated signatures/g) || []).length;
    assert.strictEqual(markerCount, 1, 'Marker should appear exactly once');

    // Both functions should appear
    assert.ok(content.includes('greet'), 'greet should be in output');
    assert.ok(content.includes('helper'), 'helper should be in output');
  });
});

// ─────────────────────────────────────────────────────────────
// all four outputs at once
// ─────────────────────────────────────────────────────────────
test('All 4 output targets written in a single run', () => {
  withTempProject((dir) => {
    seedProject(dir);
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      outputs: ['copilot', 'claude', 'cursor', 'windsurf'],
      secretScan: false,
    }));

    runGenerate(dir);

    const expected = [
      path.join(dir, '.github', 'copilot-instructions.md'),
      path.join(dir, 'CLAUDE.md'),
      path.join(dir, '.cursorrules'),
      path.join(dir, '.windsurfrules'),
    ];

    for (const f of expected) {
      assert.ok(fs.existsSync(f), `${path.basename(f)} should exist`);
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(content.length > 0, `${path.basename(f)} should be non-empty`);
    }
  });
});

console.log('');
console.log(`multi-output: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
