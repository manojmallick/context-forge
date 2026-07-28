'use strict';

/**
 * v8.0 D3 — get_diff_context & get_architecture_overview MCP tools.
 * Drives the live stdio MCP server against controlled temp git repos.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const GEN_CONTEXT = path.resolve(__dirname, '../../../gen-context.js');
const { TOOLS } = require('../../../src/mcp/tools.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (err) { console.log(`  FAIL  ${name}: ${err.message}`); failed++; }
}

function mcp(messages, cwd) {
  const input = (Array.isArray(messages) ? messages : [messages])
    .map((m) => JSON.stringify(m)).join('\n') + '\n';
  const stdout = execFileSync('node', [GEN_CONTEXT, '--mcp'], { input, cwd, encoding: 'utf8', timeout: 20000 });
  return stdout.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function callText(name, args, cwd) {
  const res = mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }, cwd);
  return res.find((r) => r.id === 1).result.content[0].text;
}

function git(args, cwd) { execFileSync('git', args, { cwd, stdio: 'ignore' }); }

function withGitProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-mcpd3-'));
  try {
    git(['init', '-q'], dir);
    git(['config', 'user.email', 't@t.t'], dir);
    git(['config', 'user.name', 'tester'], dir);
    git(['config', 'commit.gpgsign', 'false'], dir);
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function seedContext(dir) {
  const gh = path.join(dir, '.github');
  fs.mkdirSync(gh, { recursive: true });
  fs.writeFileSync(path.join(gh, 'copilot-instructions.md'), [
    '## Auto-generated signatures', '# Code signatures', '',
    '### src/widget.js', '```', 'function renderWidget(props)  :3-9', '```', '',
    '### src/store.js', '```', 'function loadStore()  :1-5', '```', '',
  ].join('\n'));
}

// ── tools/list registration ────────────────────────────────────────────────

test('tools/list registers 21 tools including both new ones', () => {
  withGitProject((dir) => {
    const res = mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, dir);
    const tools = res.find((r) => r.id === 1).result.tools;
    assert.strictEqual(tools.length, TOOLS.length, 'server list matches TOOLS');
    assert.strictEqual(tools.length, 21, 'exactly 21 tools');
    assert.ok(tools.some((t) => t.name === 'get_diff_context'), 'get_diff_context registered');
    assert.ok(tools.some((t) => t.name === 'get_architecture_overview'), 'get_architecture_overview registered');
  });
});

// ── get_diff_context ───────────────────────────────────────────────────────

test('get_diff_context reports changed files with signatures and blast radius', () => {
  withGitProject((dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/widget.js'), 'function renderWidget(props){return props;}\nmodule.exports={renderWidget};\n');
    fs.writeFileSync(path.join(dir, 'src/page.js'), "const {renderWidget}=require('./widget');\nfunction page(){return renderWidget(1);}\n");
    git(['add', '-A'], dir); git(['commit', '-qm', 'init'], dir);
    // Working-tree change to widget.js (page.js imports it → direct importer)
    fs.writeFileSync(path.join(dir, 'src/widget.js'), 'function renderWidget(props, theme){return props;}\nmodule.exports={renderWidget};\n');

    const text = callText('get_diff_context', {}, dir);
    assert.ok(/src\/widget\.js/.test(text), 'lists the changed file');
    assert.ok(/renderWidget/.test(text), 'includes current signatures');
    assert.ok(/Blast radius/i.test(text), 'includes a blast-radius line');
    assert.ok(/page\.js/.test(text), 'blast radius names the importer');
  });
});

test('get_diff_context --staged reports only staged changes', () => {
  withGitProject((dir) => {
    fs.writeFileSync(path.join(dir, 'a.js'), 'function a(){}\n');
    git(['add', '-A'], dir); git(['commit', '-qm', 'init'], dir);
    fs.writeFileSync(path.join(dir, 'a.js'), 'function a(){return 1;}\n');
    fs.writeFileSync(path.join(dir, 'b.js'), 'function b(){}\n'); // unstaged
    git(['add', 'a.js'], dir); // stage a.js only

    const text = callText('get_diff_context', { staged: true }, dir);
    assert.ok(/a\.js/.test(text), 'staged file appears');
    assert.ok(!/b\.js/.test(text), 'unstaged file must not appear');
  });
});

test('get_diff_context degrades gracefully on a clean tree', () => {
  withGitProject((dir) => {
    fs.writeFileSync(path.join(dir, 'a.js'), 'function a(){}\n');
    git(['add', '-A'], dir); git(['commit', '-qm', 'init'], dir);
    const text = callText('get_diff_context', {}, dir);
    assert.ok(/No changed files/i.test(text), 'reports no changes without throwing');
  });
});

// ── get_architecture_overview ──────────────────────────────────────────────

test('get_architecture_overview returns modules, hub files, and totals', () => {
  withGitProject((dir) => {
    seedContext(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/widget.js'), 'module.exports={};\n');
    fs.writeFileSync(path.join(dir, 'src/store.js'), "const w=require('./widget');\nmodule.exports={};\n");

    const text = callText('get_architecture_overview', {}, dir);
    assert.ok(/Architecture overview/.test(text));
    assert.ok(/## Modules/.test(text), 'has a module breakdown');
    assert.ok(/indexed files/.test(text), 'reports totals');
    assert.ok(/Hub files|Dependency cycles/.test(text), 'includes the dependency-graph section');
  });
});

test('get_architecture_overview degrades gracefully without a context file', () => {
  withGitProject((dir) => {
    const text = callText('get_architecture_overview', {}, dir);
    assert.ok(/No context file found|Architecture overview/.test(text), 'does not throw without context');
  });
});

console.log(`\nD3 MCP tools: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
