'use strict';

/**
 * Integration tests for the Memory tools (v6.16.0):
 *   - src/session/notes.js  — addNote / readNotes / formatNotes / clearNotes
 *   - CLI `sigmap note "<text>"` / `note --list` (+ --json)
 *   - CLI `sigmap status` (+ --json)
 *   - read_memory MCP handler + tools/list registration (11th tool)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'gen-context.js');
const notes = require(path.join(ROOT, 'src', 'session', 'notes'));
const handlers = require(path.join(ROOT, 'src', 'mcp', 'handlers'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (err) { console.error(`  FAIL  ${name}`); console.error(`        ${err.message}`); failed++; }
}

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-mem-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 't@t.co'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 't'], { cwd: dir });
  return dir;
}
function run(dir, args) {
  return spawnSync('node', [SCRIPT, ...args, '--cwd', dir], { cwd: ROOT, encoding: 'utf8' });
}

// --------------------------------------------------------------------------
// notes module
// --------------------------------------------------------------------------
test('addNote appends and readNotes returns chronological order', () => {
  const dir = tmpRepo();
  notes.addNote(dir, 'first', { branch: 'main' });
  notes.addNote(dir, 'second', { branch: 'main' });
  const all = notes.readNotes(dir);
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all[0].text, 'first');
  assert.strictEqual(all[1].text, 'second');
  assert.ok(all[0].ts && all[0].branch === 'main');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readNotes limit keeps the most recent N', () => {
  const dir = tmpRepo();
  for (let i = 0; i < 5; i++) notes.addNote(dir, `n${i}`, { branch: null });
  const last2 = notes.readNotes(dir, 2);
  assert.deepStrictEqual(last2.map((n) => n.text), ['n3', 'n4']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('addNote rejects empty text; clearNotes removes the log', () => {
  const dir = tmpRepo();
  assert.throws(() => notes.addNote(dir, '   '), /empty/);
  notes.addNote(dir, 'keep', {});
  assert.ok(fs.existsSync(notes.notesPath(dir)));
  assert.strictEqual(notes.clearNotes(dir), true);
  assert.strictEqual(notes.readNotes(dir).length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('formatNotes renders a markdown list and an empty hint', () => {
  assert.ok(/sigmap note/.test(notes.formatNotes([])));
  const md = notes.formatNotes([{ ts: '2026-06-08T10:00:00Z', text: 'hi', branch: 'dev' }]);
  assert.ok(/- \[2026-06-08 10:00 \(dev\)\] hi/.test(md));
});

test('readNotes tolerates a corrupt line', () => {
  const dir = tmpRepo();
  fs.mkdirSync(path.dirname(notes.notesPath(dir)), { recursive: true });
  fs.writeFileSync(notes.notesPath(dir), '{bad json}\n' + JSON.stringify({ ts: 'x', text: 'ok' }) + '\n');
  const all = notes.readNotes(dir);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].text, 'ok');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --------------------------------------------------------------------------
// CLI: note
// --------------------------------------------------------------------------
test('CLI note adds a note; --cwd value never leaks into the text', () => {
  const dir = tmpRepo();
  const res = run(dir, ['note', 'refactor the auth flow']);
  assert.strictEqual(res.status, 0, res.stderr);
  const all = notes.readNotes(dir);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].text, 'refactor the auth flow'); // not "... <tmpdir>"
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI note --json lists recent notes', () => {
  const dir = tmpRepo();
  run(dir, ['note', 'alpha']);
  run(dir, ['note', 'beta']);
  const res = run(dir, ['note', '--json']);
  const obj = JSON.parse(res.stdout.trim());
  assert.ok(Array.isArray(obj.notes) && obj.notes.length === 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI note with no log lists nothing gracefully', () => {
  const dir = tmpRepo();
  const res = run(dir, ['note']);
  assert.strictEqual(res.status, 0);
  assert.ok(/0 recent notes/.test(res.stdout));
  fs.rmSync(dir, { recursive: true, force: true });
});

// --------------------------------------------------------------------------
// CLI: status
// --------------------------------------------------------------------------
test('CLI status --json reports branch, dirty count, notes', () => {
  const dir = tmpRepo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x'); // untracked → dirty
  notes.addNote(dir, 'a note', { branch: 'main' });
  const res = run(dir, ['status', '--json']);
  const st = JSON.parse(res.stdout.trim());
  // Branch name varies with git's init.defaultBranch — assert it resolved at all
  // (symbolic-ref fallback works even on an unborn branch with no commits).
  assert.ok(typeof st.branch === 'string' && st.branch.length > 0, `branch was ${st.branch}`);
  assert.ok(st.dirty >= 1);
  assert.strictEqual(st.notes, 1);
  assert.ok(st.lastNote && st.lastNote.text === 'a note');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI status human output renders the expected lines', () => {
  const dir = tmpRepo();
  const res = run(dir, ['status']);
  assert.strictEqual(res.status, 0);
  assert.ok(/Branch:/.test(res.stdout));
  assert.ok(/Working tree:/.test(res.stdout));
  assert.ok(/Last index:/.test(res.stdout));
  fs.rmSync(dir, { recursive: true, force: true });
});

// --------------------------------------------------------------------------
// read_memory handler + MCP registration
// --------------------------------------------------------------------------
test('readMemory handler returns recent notes, most-recent first', () => {
  const dir = tmpRepo();
  notes.addNote(dir, 'older', { branch: 'main' });
  notes.addNote(dir, 'newer', { branch: 'main' });
  const out = handlers.readMemory({ limit: 5 }, dir);
  assert.ok(/Recent notes \(2\)/.test(out));
  const iOlder = out.indexOf('older');
  const iNewer = out.indexOf('newer');
  assert.ok(iNewer < iOlder && iNewer !== -1, 'most recent first');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readMemory handles an empty repo without throwing', () => {
  const dir = tmpRepo();
  const out = handlers.readMemory({}, dir);
  assert.ok(/SigMap memory/.test(out));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('read_memory is registered as the 11th MCP tool (bundle path)', () => {
  const dir = tmpRepo();
  notes.addNote(dir, 'seed note', { branch: 'main' });
  const reqs = [
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_memory', arguments: { limit: 3 } } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n';
  const res = spawnSync('node', [SCRIPT, '--mcp', '--cwd', dir], { input: reqs, cwd: ROOT, encoding: 'utf8' });
  const lines = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
  const tools = lines.find((l) => l.id === 1).result.tools;
  assert.strictEqual(tools.length, 21);
  assert.ok(tools.some((t) => t.name === 'read_memory'));
  const text = lines.find((l) => l.id === 2).result.content[0].text;
  assert.ok(/seed note/.test(text));
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\nmemory-tools: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
