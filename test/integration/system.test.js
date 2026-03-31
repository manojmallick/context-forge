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
