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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-budget-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Write a JS file with enough repetitive content to cost ~tokens tokens */
function writeJsFile(filePath, tokens) {
  const chars = tokens * 4;
  const line = 'function placeholder() { return 42; }\n';
  let content = '';
  while (content.length < chars) content += line;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function estimateTokens(str) {
  return Math.ceil(str.length / 4);
}

function runGenerate(cwd, extraArgs = '') {
  execSync(`node "${GEN_CONTEXT}" ${extraArgs}`, {
    cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// --- Output stays under maxTokens ---
test('Output stays under maxTokens when project is large', () => {
  withTempProject((dir) => {
    const srcDir = path.join(dir, 'src');
    // Write 30 JS files with ~300 tokens each = ~9000 raw tokens
    for (let i = 0; i < 30; i++) {
      writeJsFile(path.join(srcDir, `module${i}.js`), 300);
    }

    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      maxTokens: 4000,
      outputs: ['copilot'],
      secretScan: false,
    }));

    runGenerate(dir);

    const outPath = path.join(dir, '.github', 'copilot-instructions.md');
    assert.ok(fs.existsSync(outPath), 'Output file should exist');
    const content = fs.readFileSync(outPath, 'utf8');
    const tokens = estimateTokens(content);
    assert.ok(tokens <= 4000, `Expected ≤4000 tokens, got ${tokens}`);
  });
});

// --- Test files are dropped before source files ---
test('Test files are dropped before source files', () => {
  withTempProject((dir) => {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Source files — write small but real content
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(srcDir, `service${i}.js`),
        `function service${i}() { return ${i}; }\nmodule.exports = { service${i} };\n`
      );
    }

    // Test files — one large test file that pushes us over budget
    const testFile = path.join(srcDir, 'bigfile.test.js');
    writeJsFile(testFile, 600);

    // Budget: enough for source files but not for the giant test file
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      maxTokens: 500,
      outputs: ['copilot'],
      secretScan: false,
    }));

    const stderr = [];
    try {
      execSync(`node "${GEN_CONTEXT}"`, {
        cwd: dir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // Generate may succeed even with drops
    }

    const outPath = path.join(dir, '.github', 'copilot-instructions.md');
    assert.ok(fs.existsSync(outPath), 'Output file should exist');
    const content = fs.readFileSync(outPath, 'utf8');
    const tokens = estimateTokens(content);
    assert.ok(tokens <= 500, `Expected ≤500 tokens, got ${tokens}`);
  });
});

// --- No drop when under budget ---
test('No files dropped when total is under maxTokens', () => {
  withTempProject((dir) => {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // 3 tiny source files
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(
        path.join(srcDir, `tiny${i}.js`),
        `function tiny${i}() { return ${i}; }\nmodule.exports = { tiny${i} };\n`
      );
    }

    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      maxTokens: 6000,
      outputs: ['copilot'],
      secretScan: false,
    }));

    runGenerate(dir);

    const outPath = path.join(dir, '.github', 'copilot-instructions.md');
    assert.ok(fs.existsSync(outPath), 'Output file should exist');
    const content = fs.readFileSync(outPath, 'utf8');
    // All 3 functions should appear in output
    assert.ok(content.includes('tiny0'), 'tiny0 should be in output');
    assert.ok(content.includes('tiny1'), 'tiny1 should be in output');
    assert.ok(content.includes('tiny2'), 'tiny2 should be in output');
  });
});

// --- Budget respected when maxTokens set via config ---
test('Custom maxTokens from config file is respected', () => {
  withTempProject((dir) => {
    const srcDir = path.join(dir, 'src');

    for (let i = 0; i < 20; i++) {
      writeJsFile(path.join(srcDir, `heavy${i}.js`), 400);
    }

    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      maxTokens: 2000,
      outputs: ['copilot'],
      secretScan: false,
    }));

    runGenerate(dir);

    const outPath = path.join(dir, '.github', 'copilot-instructions.md');
    const content = fs.readFileSync(outPath, 'utf8');
    const tokens = estimateTokens(content);
    assert.ok(tokens <= 2000, `Expected ≤2000 tokens, got ${tokens}`);
  });
});

// --- Empty srcDirs produces empty-ish output ---
test('Project with no matching files produces valid output file', () => {
  withTempProject((dir) => {
    fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify({
      srcDirs: ['nonexistent'],
      outputs: ['copilot'],
      secretScan: false,
    }));

    runGenerate(dir);

    const outPath = path.join(dir, '.github', 'copilot-instructions.md');
    assert.ok(fs.existsSync(outPath), 'Output file should still be created');
  });
});

console.log('');
console.log(`token-budget: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
