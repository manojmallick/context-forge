'use strict';

/**
 * Integration tests for the v8.23 F1 session spend ledger.
 *
 * Tests:
 *  1.  recordUsage stamps a session field (day bucket by default)
 *  2.  recordUsage respects SIGMAP_SESSION
 *  3.  budgetStatus sums only the requested session (incl. legacy entries by ts prefix)
 *  4.  budgetStatus computes remaining/pct with a budget; nulls without
 *  5.  budgetStatus reports context age and stale vs contextTtlDays
 *  6.  CLI `budget --json` returns valid JSON with expected keys
 *  7.  MCP get_budget handler returns the ledger text; TOOLS has 21 entries
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'gen-context.js');

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

const { recordUsage, readGainLog } = require(path.join(ROOT, 'src', 'tracking', 'logger'));
const { budgetStatus, sessionKey } = require(path.join(ROOT, 'src', 'tracking', 'budget'));
const { TOOLS } = require(path.join(ROOT, 'src', 'mcp', 'tools'));
const { getBudget } = require(path.join(ROOT, 'src', 'mcp', 'handlers'));

function tmpCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-budget-'));
}

console.log('[budget.test.js] v8.23 F1 session spend ledger');
console.log('');

test('recordUsage stamps a session field (day bucket default)', () => {
  const cwd = tmpCwd();
  recordUsage({ op: 'ask', baselineTokens: 100, actualTokens: 10 }, cwd);
  const [e] = readGainLog(cwd);
  assert.ok(e, 'no gain entry written');
  assert.strictEqual(e.session, new Date().toISOString().slice(0, 10));
});

test('recordUsage respects SIGMAP_SESSION', () => {
  const cwd = tmpCwd();
  process.env.SIGMAP_SESSION = 'chat-42';
  try {
    recordUsage({ op: 'ask', baselineTokens: 100, actualTokens: 10 }, cwd);
  } finally {
    delete process.env.SIGMAP_SESSION;
  }
  const [e] = readGainLog(cwd);
  assert.strictEqual(e.session, 'chat-42');
  assert.strictEqual(sessionKey({ SIGMAP_SESSION: 'x' }), 'x');
});

test('budgetStatus sums only the requested session (legacy ts-prefix match)', () => {
  const cwd = tmpCwd();
  const dir = path.join(cwd, '.context');
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    { ts: '2026-07-28T01:00:00.000Z', op: 'ask', actualTokens: 10, baselineTokens: 100, savedTokens: 90, session: 's1' },
    { ts: '2026-07-28T02:00:00.000Z', op: 'ask', actualTokens: 20, baselineTokens: 200, savedTokens: 180, session: 's2' },
    // legacy entry: no session field — matches day-bucket '2026-07-28'
    { ts: '2026-07-28T03:00:00.000Z', op: 'ask', actualTokens: 40, baselineTokens: 400, savedTokens: 360 },
  ];
  fs.writeFileSync(path.join(dir, 'gain.ndjson'), lines.map(JSON.stringify).join('\n') + '\n');
  const s1 = budgetStatus(cwd, { session: 's1' });
  assert.strictEqual(s1.ops, 1);
  assert.strictEqual(s1.spentTokens, 10);
  const day = budgetStatus(cwd, { session: '2026-07-28' });
  assert.strictEqual(day.ops, 1, 'day bucket should match only the legacy entry');
  assert.strictEqual(day.spentTokens, 40);
});

test('budgetStatus budget math: remaining/pct with, nulls without', () => {
  const cwd = tmpCwd();
  const dir = path.join(cwd, '.context');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'gain.ndjson'),
    JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', op: 'ask', actualTokens: 250, baselineTokens: 1000, savedTokens: 750, session: 's' }) + '\n');
  const withB = budgetStatus(cwd, { session: 's', budgetTokens: 1000 });
  assert.strictEqual(withB.remainingTokens, 750);
  assert.strictEqual(withB.pctUsed, 25);
  assert.strictEqual(withB.overBudget, false);
  assert.strictEqual(withB.unit, 'estimated-tokens');
  const noB = budgetStatus(cwd, { session: 's' });
  assert.strictEqual(noB.budgetTokens, null);
  assert.strictEqual(noB.remainingTokens, null);
  assert.strictEqual(noB.pctUsed, null);
});

test('budgetStatus context age + stale vs contextTtlDays', () => {
  const cwd = tmpCwd();
  const ctx = path.join(cwd, 'CLAUDE.md');
  fs.writeFileSync(ctx, '# ctx');
  const threeDaysAgo = Date.now() - 3 * 86400000;
  fs.utimesSync(ctx, threeDaysAgo / 1000, threeDaysAgo / 1000);
  const fresh = budgetStatus(cwd, { session: 's', contextTtlDays: 7 });
  assert.strictEqual(fresh.context.exists, true);
  assert.strictEqual(fresh.context.stale, false);
  assert.ok(Math.abs(fresh.context.ageDays - 3) < 0.2, `ageDays=${fresh.context.ageDays}`);
  const stale = budgetStatus(cwd, { session: 's', contextTtlDays: 2 });
  assert.strictEqual(stale.context.stale, true);
  const none = budgetStatus(tmpCwd(), { session: 's' });
  assert.strictEqual(none.context.exists, false);
  assert.strictEqual(none.context.stale, false);
});

test('CLI budget --json returns valid JSON with expected keys', () => {
  const cwd = tmpCwd();
  const r = spawnSync(process.execPath, [SCRIPT, 'budget', '--json', '--budget', '5000'], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  for (const k of ['session', 'unit', 'ops', 'spentTokens', 'budgetTokens', 'remainingTokens', 'context']) {
    assert.ok(k in j, `missing key ${k}`);
  }
  assert.strictEqual(j.budgetTokens, 5000);
});

test('MCP get_budget returns ledger text; TOOLS has 21 entries', () => {
  assert.strictEqual(TOOLS.length, 21);
  assert.strictEqual(TOOLS[TOOLS.length - 1].name, 'get_budget');
  const cwd = tmpCwd();
  const text = getBudget({ budgetTokens: 100 }, cwd);
  assert.ok(text.includes('SigMap session spend'), text.slice(0, 80));
  assert.ok(text.includes('estimates'), 'must label values as estimates');
  assert.ok(text.includes('Budget'), 'must show budget line');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`[budget.test.js] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
