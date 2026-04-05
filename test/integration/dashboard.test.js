'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-dashboard-'));
  try {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.js'), [
      'function alpha() { return 1; }',
      'function beta() { return 2; }',
      'module.exports = { alpha, beta };',
    ].join('\n'));

    const usageDir = path.join(dir, '.context');
    fs.mkdirSync(usageDir, { recursive: true });
    const log = [
      { ts: '2026-04-01T00:00:00Z', finalTokens: 4100, rawTokens: 12000, reductionPct: 65.8, overBudget: false },
      { ts: '2026-04-02T00:00:00Z', finalTokens: 3900, rawTokens: 12000, reductionPct: 67.5, overBudget: false },
      { ts: '2026-04-03T00:00:00Z', finalTokens: 6100, rawTokens: 12000, reductionPct: 49.2, overBudget: true },
      { ts: '2026-04-04T00:00:00Z', finalTokens: 5800, rawTokens: 12000, reductionPct: 51.7, overBudget: false },
    ].map((x) => JSON.stringify(x)).join('\n') + '\n';
    fs.writeFileSync(path.join(usageDir, 'usage.ndjson'), log, 'utf8');

    const benchDir = path.join(dir, 'benchmarks', 'results');
    fs.mkdirSync(benchDir, { recursive: true });
    fs.writeFileSync(path.join(benchDir, 'run.jsonl'), [
      JSON.stringify({ metrics: { hitAt5: 0.72 } }),
      JSON.stringify({ metrics: { hitAt5: 0.81 } }),
      JSON.stringify({ metrics: { hitAt5: 0.78 } }),
    ].join('\n') + '\n', 'utf8');

    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('\nIntegration tests — dashboard (v2.10)\n');

test('--dashboard creates benchmarks/reports/dashboard.html', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}" --dashboard`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(fs.existsSync(path.join(dir, 'benchmarks', 'reports', 'dashboard.html')));
  });
});

test('--dashboard html is self-contained (no external script/link)', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}" --dashboard`, { cwd: dir, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] });
    const html = fs.readFileSync(path.join(dir, 'benchmarks', 'reports', 'dashboard.html'), 'utf8');
    assert.ok(!/<script[^>]+src=/i.test(html), 'must not include external script src');
    assert.ok(!/<link[^>]+href=/i.test(html), 'must not include external stylesheet link');
  });
});

test('--dashboard html includes summary cards', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}" --dashboard`, { cwd: dir, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] });
    const html = fs.readFileSync(path.join(dir, 'benchmarks', 'reports', 'dashboard.html'), 'utf8');
    assert.ok(html.includes('Current grade'));
    assert.ok(html.includes('Days since regen'));
    assert.ok(html.includes('Over-budget %'));
  });
});

test('--dashboard html includes SVG chart sections', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}" --dashboard`, { cwd: dir, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] });
    const html = fs.readFileSync(path.join(dir, 'benchmarks', 'reports', 'dashboard.html'), 'utf8');
    const svgCount = (html.match(/<svg /g) || []).length;
    assert.ok(svgCount >= 3, `expected >= 3 svg charts, got ${svgCount}`);
  });
});

test('--dashboard --json outputs file and summary', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --dashboard --json`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.strictEqual(parsed.ok, true);
    assert.ok(typeof parsed.file === 'string' && parsed.file.includes('benchmarks/reports/dashboard.html'));
    assert.ok(parsed.summary && typeof parsed.summary === 'object');
  });
});

test('--report --history --chart prints chart output', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --report --history --chart 2>&1`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(out.includes('history charts'));
    assert.ok(out.includes('inline svg: token reduction'));
  });
});

test('--report --history --chart --json returns chart object', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --report --history --chart --json`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.ok(parsed.chart && typeof parsed.chart === 'object');
    assert.ok(parsed.chart.charts && parsed.chart.charts.tokenReductionSvg);
  });
});

test('--health --json includes p50/p95 token metrics', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --health --json`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.ok('p50TokenCount' in parsed);
    assert.ok('p95TokenCount' in parsed);
    assert.ok(typeof parsed.p50TokenCount === 'number');
    assert.ok(typeof parsed.p95TokenCount === 'number');
  });
});

test('--health --json includes overBudgetStreak', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --health --json`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.ok('overBudgetStreak' in parsed);
    assert.ok(Number.isInteger(parsed.overBudgetStreak));
  });
});

test('--health --json includes extractorCoverage percent', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --health --json`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.ok('extractorCoverage' in parsed);
    assert.ok(typeof parsed.extractorCoverage === 'number');
    assert.ok(parsed.extractorCoverage >= 0 && parsed.extractorCoverage <= 100);
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
