'use strict';

/**
 * `sigmap tune` — deterministic config optimizer (F2, #514).
 * Run: node test/integration/tune.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const GEN_CONTEXT = path.join(ROOT, 'gen-context.js');
const { buildTuneProposal, applyTuneProposal } = require(path.join(ROOT, 'src/config/tune.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

/** TS workspace fixture: src/ code, workspaces marker, client files, junk dir. */
function fixture(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-tune-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fx', devDependencies: { typescript: '^5' },
    ...(opts.workspaces ? { workspaces: ['packages/*'] } : {}),
  }));
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(path.join(dir, 'src', `f${i}.ts`), `export function fn${i}(a: string) { return a; }\n`);
  }
  if (opts.clientFiles) for (const f of opts.clientFiles) fs.writeFileSync(path.join(dir, f), '');
  if (opts.junkDir) fs.mkdirSync(path.join(dir, opts.junkDir));
  if (opts.config) fs.writeFileSync(path.join(dir, 'gen-context.config.json'), JSON.stringify(opts.config, null, 2));
  return dir;
}
const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const changeFor = (p, key) => p.changes.find((c) => c.key === key);

// ── proposal shape + determinism ────────────────────────────────────────────

test('proposal has {key,current,recommended,reason} changes and is deterministic', () => {
  const dir = fixture({ workspaces: true, clientFiles: ['CLAUDE.md'], junkDir: 'third_party' });
  const a = buildTuneProposal(dir);
  const b = buildTuneProposal(dir);
  assert.ok(a.changes.length >= 3, `expected >=3 changes, got ${a.changes.length}`);
  for (const c of a.changes) {
    assert.ok(c.key && 'current' in c && 'recommended' in c && typeof c.reason === 'string' && c.reason.length > 0, JSON.stringify(c));
  }
  assert.deepStrictEqual(a, b, 'same repo must yield a deep-equal proposal');
  rm(dir);
});

// ── srcDirs rule ────────────────────────────────────────────────────────────

test('srcDirs: pin recommended when unpinned and detection is confident', () => {
  const dir = fixture({});
  const c = changeFor(buildTuneProposal(dir), 'srcDirs');
  assert.ok(c, 'srcDirs pin missing');
  assert.deepStrictEqual(c.recommended, ['src']);
  assert.ok(/confidence (medium|high)/.test(c.reason), c.reason);
  rm(dir);
});

test('srcDirs: user-pinned srcDirs are never proposed against', () => {
  const dir = fixture({ config: { srcDirs: ['custom'] } });
  assert.strictEqual(changeFor(buildTuneProposal(dir), 'srcDirs'), undefined);
  rm(dir);
});

// ── monorepo / adapters / exclude rules ─────────────────────────────────────

test('monorepo: fires on workspaces marker, reason names the marker', () => {
  const dir = fixture({ workspaces: true });
  const c = changeFor(buildTuneProposal(dir), 'monorepo');
  assert.ok(c && c.recommended === true, 'monorepo change missing');
  assert.ok(c.reason.includes('package.json workspaces'), c.reason);
  const dir2 = fixture({});
  assert.strictEqual(changeFor(buildTuneProposal(dir2), 'monorepo'), undefined, 'must not fire without a marker');
  rm(dir); rm(dir2);
});

test('adapters: additive from client artifacts, reason names the files', () => {
  const dir = fixture({ clientFiles: ['CLAUDE.md', '.cursorrules'] });
  const c = changeFor(buildTuneProposal(dir), 'adapters');
  assert.ok(c, 'adapters change missing');
  assert.ok(c.recommended.includes('claude') && c.recommended.includes('cursor'), JSON.stringify(c.recommended));
  assert.ok(c.recommended.includes('copilot'), 'existing adapters must be kept');
  assert.ok(c.reason.includes('CLAUDE.md') && c.reason.includes('.cursorrules'), c.reason);
  rm(dir);
});

test('exclude: junk dir at root is added, defaults preserved in the list', () => {
  const dir = fixture({ junkDir: 'third_party' });
  const c = changeFor(buildTuneProposal(dir), 'exclude');
  assert.ok(c, 'exclude change missing');
  assert.ok(c.recommended.includes('third_party') && c.recommended.includes('node_modules'), JSON.stringify(c.recommended));
  assert.ok(c.reason.includes('third_party'), c.reason);
  rm(dir);
});

test('autoMaxTokens: fires only when a pinned budget is below the repo estimate', () => {
  const dir = fixture({ config: { autoMaxTokens: false, maxTokens: 10 } });
  const c = changeFor(buildTuneProposal(dir), 'autoMaxTokens');
  assert.ok(c && c.recommended === true, 'autoMaxTokens change missing');
  assert.ok(/source files/.test(c.reason) && /heuristic/.test(c.reason), c.reason);
  const dir2 = fixture({ config: { autoMaxTokens: false, maxTokens: 999999 } });
  assert.strictEqual(changeFor(buildTuneProposal(dir2), 'autoMaxTokens'), undefined, 'ample pinned budget must not fire');
  rm(dir); rm(dir2);
});

// ── apply: merge, preserve, idempotent ──────────────────────────────────────

test('applyTuneProposal merges into config preserving unrelated user keys; then idempotent', () => {
  const dir = fixture({ workspaces: true, config: { terse: true, srcDirs: ['src'] } });
  applyTuneProposal(dir, buildTuneProposal(dir));
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'gen-context.config.json'), 'utf8'));
  assert.strictEqual(cfg.terse, true, 'unrelated user key lost');
  assert.deepStrictEqual(cfg.srcDirs, ['src'], 'pinned srcDirs must survive apply');
  assert.strictEqual(cfg.monorepo, true);
  assert.deepStrictEqual(buildTuneProposal(dir).changes, [], 'second proposal after apply must be empty');
  rm(dir);
});

// ── CLI wiring ──────────────────────────────────────────────────────────────

test('CLI: default tune writes nothing; --apply writes; --json is machine-readable', () => {
  const dir = fixture({ workspaces: true });
  execFileSync(process.execPath, [GEN_CONTEXT, 'tune'], { cwd: dir, encoding: 'utf8' });
  assert.ok(!fs.existsSync(path.join(dir, 'gen-context.config.json')), 'default run must not write config');
  const json = JSON.parse(execFileSync(process.execPath, [GEN_CONTEXT, 'tune', '--json'], { cwd: dir, encoding: 'utf8' }));
  assert.ok(Array.isArray(json.changes) && json.detection, 'bad --json shape');
  const out = execFileSync(process.execPath, [GEN_CONTEXT, 'tune', '--apply'], { cwd: dir, encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(dir, 'gen-context.config.json')), '--apply must write config');
  assert.ok(out.includes('sigmap validate'), 'apply output must point to validate');
  rm(dir);
});

test('CLI: --help documents tune', () => {
  const help = execFileSync(process.execPath, [GEN_CONTEXT, '--help'], { encoding: 'utf8' });
  assert.ok(/tune\s+Recommend config from repo detection/.test(help), '--help missing tune');
  assert.ok(help.includes('tune --apply'), '--help missing tune --apply');
});

console.log(`\n  tune: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
