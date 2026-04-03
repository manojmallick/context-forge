'use strict';

/**
 * Integration tests for v1.5 features:
 *  - .npmignore content validation
 *  - gen-context.js shebang line
 *  - VS Code extension manifest structure
 *  - docs search injection across all 6 HTML pages
 *  - npx / bin entry validation via package.json
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');

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

// ─────────────────────────────────────────────────────────────
// npm package integrity
// ─────────────────────────────────────────────────────────────

console.log('\nnpm package integrity\n');

test('package.json has name "sigmap"', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.name, 'sigmap');
});

test('package.json bin includes "sigmap" and "gen-context" entries', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.bin, 'Should have bin field');
  assert.ok(pkg.bin['sigmap'], 'Should have sigmap bin');
  assert.ok(pkg.bin['gen-context'], 'Should have gen-context bin');
});

test('package.json bin entries point to gen-context.js', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.bin['sigmap'].includes('gen-context.js'), 'sigmap bin should point to gen-context.js');
});

test('package.json has engines.node >= 18', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.engines && pkg.engines.node, 'Should have engines.node');
  assert.ok(pkg.engines.node.includes('18'), 'Should require Node 18+');
});

test('package.json has zero runtime dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = pkg.dependencies;
  assert.ok(!deps || Object.keys(deps).length === 0, 'Should have zero runtime dependencies');
});

test('.npmignore exists', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '.npmignore')), '.npmignore should exist');
});

test('.npmignore excludes test/', () => {
  const content = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
  assert.ok(content.includes('test/'), 'Should exclude test/');
});

test('.npmignore excludes docs/', () => {
  const content = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
  assert.ok(content.includes('docs/'), 'Should exclude docs/');
});

test('.npmignore excludes vscode-extension/', () => {
  const content = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
  assert.ok(content.includes('vscode-extension/'), 'Should exclude vscode-extension/');
});

test('.npmignore excludes .github/workflows/', () => {
  const content = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
  assert.ok(content.includes('.github/workflows/'), 'Should exclude .github/workflows/');
});

// ─────────────────────────────────────────────────────────────
// gen-context.js shebang
// ─────────────────────────────────────────────────────────────

console.log('\ngen-context.js shebang\n');

test('gen-context.js first line is #!/usr/bin/env node', () => {
  const content = fs.readFileSync(path.join(ROOT, 'gen-context.js'), 'utf8');
  const firstLine = content.split('\n')[0];
  assert.strictEqual(firstLine, '#!/usr/bin/env node', `First line should be shebang, got: ${firstLine}`);
});

test('gen-context.js second line is use strict', () => {
  const content = fs.readFileSync(path.join(ROOT, 'gen-context.js'), 'utf8');
  const lines = content.split('\n');
  assert.ok(lines[1].includes("'use strict'") || lines[2].includes("'use strict'"), 'Should have use strict after shebang');
});

// ─────────────────────────────────────────────────────────────
// VS Code extension structure
// ─────────────────────────────────────────────────────────────

console.log('\nVS Code extension\n');

test('vscode-extension/package.json exists', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'vscode-extension', 'package.json')), 'Extension package.json should exist');
});

test('vscode-extension/src/extension.js exists', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'vscode-extension', 'src', 'extension.js')), 'extension.js should exist');
});

test('extension manifest has correct name', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vscode-extension', 'package.json'), 'utf8'));
  assert.strictEqual(pkg.name, 'sigmap');
});

test('extension manifest declares sigmap.regenerate command', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vscode-extension', 'package.json'), 'utf8'));
  const commands = pkg.contributes && pkg.contributes.commands;
  assert.ok(Array.isArray(commands), 'Should have commands array');
  const names = commands.map((c) => c.command);
  assert.ok(names.includes('sigmap.regenerate'), 'Should declare sigmap.regenerate');
});

test('extension manifest declares sigmap.openContext command', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vscode-extension', 'package.json'), 'utf8'));
  const commands = pkg.contributes && pkg.contributes.commands;
  const names = commands.map((c) => c.command);
  assert.ok(names.includes('sigmap.openContext'), 'Should declare sigmap.openContext');
});

test('extension manifest has sigmap.scriptPath configuration', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vscode-extension', 'package.json'), 'utf8'));
  const props = pkg.contributes &&
    pkg.contributes.configuration &&
    pkg.contributes.configuration.properties;
  assert.ok(props && props['sigmap.scriptPath'], 'Should have sigmap.scriptPath config');
});

test('extension manifest has onStartupFinished activation', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vscode-extension', 'package.json'), 'utf8'));
  assert.ok(
    pkg.activationEvents && pkg.activationEvents.includes('onStartupFinished'),
    'Should activate on startup'
  );
});

test('extension.js exports activate and deactivate', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vscode-extension', 'src', 'extension.js'), 'utf8');
  assert.ok(src.includes('activate'), 'Should export activate');
  assert.ok(src.includes('deactivate'), 'Should export deactivate');
  assert.ok(src.includes('module.exports'), 'Should use module.exports');
});

test('extension.js implements status bar item', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vscode-extension', 'src', 'extension.js'), 'utf8');
  assert.ok(src.includes('StatusBarItem') || src.includes('createStatusBarItem'), 'Should create status bar item');
});

test('extension.js implements stale context notification', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vscode-extension', 'src', 'extension.js'), 'utf8');
  assert.ok(src.includes('STALE_HOURS') || src.includes('stale') || src.includes('24'), 'Should have stale check');
  assert.ok(src.includes('showInformationMessage'), 'Should show notification');
});

test('extension.js handles sigmap.regenerate command', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vscode-extension', 'src', 'extension.js'), 'utf8');
  assert.ok(src.includes('sigmap.regenerate'), 'Should register regenerate command');
});

test('extension.js handles sigmap.openContext command', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vscode-extension', 'src', 'extension.js'), 'utf8');
  assert.ok(src.includes('sigmap.openContext'), 'Should register openContext command');
});

test('extension.js respects sigmap.scriptPath setting', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vscode-extension', 'src', 'extension.js'), 'utf8');
  assert.ok(src.includes('sigmap.scriptPath') || src.includes('scriptPath'), 'Should read scriptPath setting');
});

// ─────────────────────────────────────────────────────────────
// Docs site search injection
// ─────────────────────────────────────────────────────────────

console.log('\nDocs search injection\n');

const DOC_PAGES = [
  'docs/index.html',
  'docs/quick-start.html',
  'docs/strategies.html',
  'docs/languages.html',
  'docs/roadmap.html',
  'docs/repomix.html',
];

DOC_PAGES.forEach((page) => {
  test(`${path.basename(page)} has search overlay element`, () => {
    const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(content.includes('cf-search-overlay'), `${page} should contain cf-search-overlay`);
  });

  test(`${path.basename(page)} has search input`, () => {
    const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(content.includes('cf-search-input'), `${page} should contain cf-search-input`);
  });

  test(`${path.basename(page)} has search button injection script`, () => {
    const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(content.includes('cf-search-btn'), `${page} should contain cf-search-btn`);
  });

  test(`${path.basename(page)} opens search on / keypress`, () => {
    const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(content.includes("e.key==='/'"), `${page} should handle / keypress`);
  });

  test(`${path.basename(page)} closes search on Escape`, () => {
    const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(content.includes("'Escape'"), `${page} should handle Escape key`);
  });
});

test('all 6 docs pages have search injected', () => {
  const patched = DOC_PAGES.filter((p) => {
    const content = fs.readFileSync(path.join(ROOT, p), 'utf8');
    return content.includes('cf-search-overlay');
  });
  assert.strictEqual(patched.length, 6, `Expected 6 pages with search, got ${patched.length}`);
});

test('docs search has highlight style', () => {
  const content = fs.readFileSync(path.join(ROOT, 'docs/index.html'), 'utf8');
  assert.ok(content.includes('cf-highlight'), 'Should have highlight CSS class');
});

test('docs search is zero external dependencies (no script src)', () => {
  DOC_PAGES.forEach((page) => {
    const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
    // The search block should not load any external JS
    const searchBlock = content.split('SigMap docs search')[1] || '';
    const externalSrc = searchBlock.match(/<script[^>]*src=/);
    assert.ok(!externalSrc, `${page} search block should have no external script src`);
  });
});

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`v1.5: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
