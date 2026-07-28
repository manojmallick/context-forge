'use strict';

/**
 * Integration tests for the v6.12.0 Surgical Context MCP tool: get_lines.
 * Exercises the bundled MCP server via `gen-context.js --mcp`.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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

function mcpCall(messages, cwd) {
  const input = (Array.isArray(messages) ? messages : [messages])
    .map((m) => JSON.stringify(m)).join('\n') + '\n';
  const stdout = execSync(`node "${GEN_CONTEXT}" --mcp`, {
    input, cwd, encoding: 'utf8', timeout: 10000,
  });
  return stdout.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function withTempProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-getlines-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function callTool(dir, name, args) {
  const responses = mcpCall(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    dir
  );
  const r = responses.find((x) => x.id === 1);
  return r.result.content[0].text;
}

console.log('\nmcp get_lines: Surgical Context demand-driven fetch\n');

test('get_lines is registered (21 tools total)', () => {
  withTempProject((dir) => {
    const responses = mcpCall({ jsonrpc: '2.0', id: 9, method: 'tools/list' }, dir);
    const list = responses.find((r) => r.id === 9).result.tools;
    assert.strictEqual(list.length, 21, `expected 21 tools, got ${list.length}`);
    assert.ok(list.some((t) => t.name === 'get_lines'), 'get_lines must be in tools/list');
    const tool = list.find((t) => t.name === 'get_lines');
    assert.deepStrictEqual(tool.inputSchema.required, ['file', 'start', 'end']);
  });
});

test('get_lines returns the exact requested line range', () => {
  withTempProject((dir) => {
    const file = path.join(dir, 'sample.js');
    fs.writeFileSync(file, ['line one', 'line two', 'line three', 'line four', 'line five'].join('\n'));
    const out = callTool(dir, 'get_lines', { file: 'sample.js', start: 2, end: 4 });
    assert.ok(out.includes('sample.js:2-4'), 'header should show the resolved range');
    assert.ok(out.includes('line two') && out.includes('line four'), 'requested lines present');
    assert.ok(!out.includes('line one') && !out.includes('line five'), 'out-of-range lines absent');
  });
});

test('get_lines clamps a range that runs past EOF', () => {
  withTempProject((dir) => {
    fs.writeFileSync(path.join(dir, 'short.js'), 'a\nb\nc\n');
    const out = callTool(dir, 'get_lines', { file: 'short.js', start: 999, end: 1005 });
    assert.ok(/only \d+ lines/.test(out), `expected clamp message, got: ${out}`);
  });
});

test('get_lines refuses path traversal outside the project root', () => {
  withTempProject((dir) => {
    const out = callTool(dir, 'get_lines', { file: '../../../etc/passwd', start: 1, end: 1 });
    assert.ok(out.startsWith('Refused:'), `expected refusal, got: ${out}`);
  });
});

test('get_lines reports a missing file', () => {
  withTempProject((dir) => {
    const out = callTool(dir, 'get_lines', { file: 'nope.js', start: 1, end: 2 });
    assert.ok(out.startsWith('File not found:'), `expected not-found, got: ${out}`);
  });
});

test('get_lines redaction-scans the returned lines', () => {
  withTempProject((dir) => {
    fs.writeFileSync(path.join(dir, 'secret.js'), 'const KEY = "AKIAIOSFODNN7EXAMPLE";\nconst safe = 1;\n');
    const out = callTool(dir, 'get_lines', { file: 'secret.js', start: 1, end: 2 });
    assert.ok(!out.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS-style key must be redacted');
    assert.ok(out.includes('REDACTED'), 'redaction marker should appear');
  });
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
