'use strict';

/**
 * Integration tests for v1.0 system commands:
 *   --suggest-tool   (v1.0 commit 2)
 *   --health         (v1.0 commit 3)
 */

const { execSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../..');

function run(args) {
  try {
    return {
      stdout: execSync(`node gen-context.js ${args} 2>/dev/null`, {
        cwd: ROOT,
        encoding: 'utf8',
      }),
      code: 0,
    };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', code: err.status || 1 };
  }
}

// ── --suggest-tool tests ─────────────────────────────────────────────────────

// powerful: security audit
{
  const r = run('--suggest-tool "security audit of the auth module"');
  assert.ok(r.stdout.includes('powerful'), '--suggest-tool: security audit → powerful');
}

// powerful: multi-file
{
  const r = run('--suggest-tool "multi-file refactor across the payments service"');
  assert.ok(r.stdout.includes('powerful'), '--suggest-tool: multi-file refactor → powerful');
}

// fast: typo in yaml
{
  const r = run('--suggest-tool "fix a typo in the .yaml config"');
  assert.ok(r.stdout.includes('fast'), '--suggest-tool: typo in yaml → fast');
}

// fast: dockerfile
{
  const r = run('--suggest-tool "add a new stage to the dockerfile"');
  assert.ok(r.stdout.includes('fast'), '--suggest-tool: dockerfile change → fast');
}

// balanced: unit tests
{
  const r = run('--suggest-tool "write unit tests for the parser module"');
  assert.ok(r.stdout.includes('balanced'), '--suggest-tool: write unit tests → balanced');
}

// balanced: implement feature
{
  const r = run('--suggest-tool "implement the user notification feature"');
  assert.ok(r.stdout.includes('balanced'), '--suggest-tool: implement feature → balanced');
}

// --json output shape
{
  const r = run('--suggest-tool "owasp compliance audit" --json');
  assert.strictEqual(r.code, 0, '--suggest-tool --json exits 0');
  let parsed;
  try { parsed = JSON.parse(r.stdout.trim()); } catch (_) { assert.fail('--suggest-tool --json: invalid JSON'); }
  assert.strictEqual(parsed.tier, 'powerful', '--suggest-tool --json: tier is powerful for owasp audit');
  assert.ok(parsed.label, '--suggest-tool --json: label present');
  assert.ok(parsed.models, '--suggest-tool --json: models present');
  assert.ok(parsed.costHint, '--suggest-tool --json: costHint present');
}

// missing description → non-zero exit
{
  const r = run('--suggest-tool');
  assert.notStrictEqual(r.code, 0, '--suggest-tool with no description exits non-zero');
}

// empty-string description → non-zero exit
{
  const r = run('--suggest-tool ""');
  assert.notStrictEqual(r.code, 0, '--suggest-tool with empty description exits non-zero');
}

// ── --health tests ────────────────────────────────────────────────────────────

// text output contains expected fields
{
  const r = run('--health');
  assert.strictEqual(r.code, 0, '--health exits 0');
  assert.ok(r.stdout.includes('score'), '--health text: score present');
  assert.ok(r.stdout.includes('grade'), '--health text: grade present');
  assert.ok(r.stdout.includes('token reduction'), '--health text: token reduction line present');
  assert.ok(r.stdout.includes('days since regen'), '--health text: days since regen line present');
}

// --json output shape
{
  const r = run('--health --json');
  assert.strictEqual(r.code, 0, '--health --json exits 0');
  let parsed;
  try { parsed = JSON.parse(r.stdout.trim()); } catch (_) { assert.fail('--health --json: invalid JSON'); }
  assert.ok('score' in parsed, '--health --json: score field present');
  assert.ok('grade' in parsed, '--health --json: grade field present');
  assert.ok('tokenReductionPct' in parsed, '--health --json: tokenReductionPct field present');
  assert.ok('daysSinceRegen' in parsed, '--health --json: daysSinceRegen field present');
  assert.ok('totalRuns' in parsed, '--health --json: totalRuns field present');
  assert.ok('overBudgetRuns' in parsed, '--health --json: overBudgetRuns field present');
}

// score must be 0–100
{
  const r = run('--health --json');
  const parsed = JSON.parse(r.stdout.trim());
  assert.ok(
    typeof parsed.score === 'number' && parsed.score >= 0 && parsed.score <= 100,
    '--health --json: score in 0-100 range',
  );
}

// grade must be one of A/B/C/D
{
  const r = run('--health --json');
  const parsed = JSON.parse(r.stdout.trim());
  assert.ok(['A', 'B', 'C', 'D'].includes(parsed.grade), '--health --json: grade is A/B/C/D');
}

// totalRuns must be a non-negative integer
{
  const r = run('--health --json');
  const parsed = JSON.parse(r.stdout.trim());
  assert.ok(Number.isInteger(parsed.totalRuns) && parsed.totalRuns >= 0, '--health --json: totalRuns is non-negative int');
  assert.ok(Number.isInteger(parsed.overBudgetRuns) && parsed.overBudgetRuns >= 0, '--health --json: overBudgetRuns is non-negative int');
}

console.log('\nsystem: 15 passed, 0 failed');
