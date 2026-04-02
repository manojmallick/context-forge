'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const GEN_CONTEXT = path.resolve(__dirname, '../../gen-context.js');
const { logRun, readLog, summarize } = require('../../src/tracking/logger');

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

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-obs-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function withTempProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-obs-proj-'));
  try {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.js'), [
      'function hello() {}',
      'function world() {}',
      'module.exports = { hello, world };',
    ].join('\n'));
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Unit tests — logRun()
// ---------------------------------------------------------------------------

console.log('\nUnit tests — logRun()\n');

test('logRun creates .context/usage.ndjson', () => {
  withTempDir((dir) => {
    logRun({ version: '0.9.0', fileCount: 10, droppedCount: 0, rawTokens: 1000, finalTokens: 100 }, dir);
    assert.ok(fs.existsSync(path.join(dir, '.context', 'usage.ndjson')));
  });
});

test('logRun appends valid JSON line', () => {
  withTempDir((dir) => {
    logRun({ version: '0.9.0', fileCount: 5, droppedCount: 0, rawTokens: 500, finalTokens: 50 }, dir);
    const raw = fs.readFileSync(path.join(dir, '.context', 'usage.ndjson'), 'utf8');
    const record = JSON.parse(raw.trim());
    assert.ok(record.ts, 'should have ts');
    assert.strictEqual(record.version, '0.9.0');
    assert.strictEqual(record.fileCount, 5);
  });
});

test('logRun computes reductionPct correctly', () => {
  withTempDir((dir) => {
    logRun({ rawTokens: 1000, finalTokens: 200 }, dir);
    const raw = fs.readFileSync(path.join(dir, '.context', 'usage.ndjson'), 'utf8');
    const record = JSON.parse(raw.trim());
    assert.strictEqual(record.reductionPct, 80.0);
  });
});

test('logRun appends multiple runs (one line each)', () => {
  withTempDir((dir) => {
    logRun({ rawTokens: 1000, finalTokens: 200 }, dir);
    logRun({ rawTokens: 2000, finalTokens: 400 }, dir);
    logRun({ rawTokens: 3000, finalTokens: 600 }, dir);
    const raw = fs.readFileSync(path.join(dir, '.context', 'usage.ndjson'), 'utf8');
    const lines = raw.trim().split('\n');
    assert.strictEqual(lines.length, 3);
  });
});

test('logRun marks overBudget when finalTokens > budgetLimit', () => {
  withTempDir((dir) => {
    logRun({ rawTokens: 1000, finalTokens: 8000, overBudget: true, budgetLimit: 6000 }, dir);
    const raw = fs.readFileSync(path.join(dir, '.context', 'usage.ndjson'), 'utf8');
    const record = JSON.parse(raw.trim());
    assert.strictEqual(record.overBudget, true);
    assert.strictEqual(record.budgetLimit, 6000);
  });
});

test('logRun never throws — handles missing cwd gracefully', () => {
  // Should not throw even with a deeply invalid path
  assert.doesNotThrow(() => {
    logRun({ rawTokens: 100, finalTokens: 10 }, '/tmp/cf-nonexistent-dir-' + Date.now());
  });
});

// ---------------------------------------------------------------------------
// Unit tests — readLog()
// ---------------------------------------------------------------------------

console.log('\nUnit tests — readLog()\n');

test('readLog returns empty array when file does not exist', () => {
  withTempDir((dir) => {
    const entries = readLog(dir);
    assert.deepStrictEqual(entries, []);
  });
});

test('readLog parses previously written entries', () => {
  withTempDir((dir) => {
    logRun({ version: '0.9.0', fileCount: 7, rawTokens: 700, finalTokens: 70 }, dir);
    logRun({ version: '0.9.0', fileCount: 8, rawTokens: 800, finalTokens: 80 }, dir);
    const entries = readLog(dir);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].fileCount, 7);
    assert.strictEqual(entries[1].fileCount, 8);
  });
});

test('readLog skips corrupt lines without throwing', () => {
  withTempDir((dir) => {
    const logPath = path.join(dir, '.context', 'usage.ndjson');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, '{"valid":true}\nNOT_JSON\n{"valid":true}\n', 'utf8');
    const entries = readLog(dir);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].valid, true);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — summarize()
// ---------------------------------------------------------------------------

console.log('\nUnit tests — summarize()\n');

test('summarize returns zero stats for empty array', () => {
  const s = summarize([]);
  assert.strictEqual(s.totalRuns, 0);
  assert.strictEqual(s.avgReductionPct, 0);
  assert.strictEqual(s.firstRun, null);
});

test('summarize computes correct averages', () => {
  const entries = [
    { reductionPct: 80, finalTokens: 200, rawTokens: 1000, ts: '2026-01-01T00:00:00Z', overBudget: false },
    { reductionPct: 90, finalTokens: 300, rawTokens: 3000, ts: '2026-01-02T00:00:00Z', overBudget: false },
  ];
  const s = summarize(entries);
  assert.strictEqual(s.totalRuns, 2);
  assert.strictEqual(s.avgReductionPct, 85.0);
  assert.strictEqual(s.avgFinalTokens, 250);
});

test('summarize counts overBudgetRuns correctly', () => {
  const entries = [
    { reductionPct: 80, finalTokens: 7000, rawTokens: 10000, ts: '2026-01-01T00:00:00Z', overBudget: true },
    { reductionPct: 90, finalTokens: 3000, rawTokens: 30000, ts: '2026-01-02T00:00:00Z', overBudget: false },
  ];
  const s = summarize(entries);
  assert.strictEqual(s.overBudgetRuns, 1);
});

test('summarize sets firstRun and lastRun correctly', () => {
  const entries = [
    { reductionPct: 80, finalTokens: 200, rawTokens: 1000, ts: '2026-01-01T00:00:00Z', overBudget: false },
    { reductionPct: 90, finalTokens: 300, rawTokens: 3000, ts: '2026-03-01T00:00:00Z', overBudget: false },
  ];
  const s = summarize(entries);
  assert.strictEqual(s.firstRun, '2026-01-01T00:00:00Z');
  assert.strictEqual(s.lastRun, '2026-03-01T00:00:00Z');
});

// ---------------------------------------------------------------------------
// Integration tests — CLI --report --json
// ---------------------------------------------------------------------------

console.log('\nIntegration tests — --report --json\n');

test('--report --json outputs valid JSON', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --report --json`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.ok(parsed);
  });
});

test('--report --json output has version and timestamp fields', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --report --json`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.ok(parsed.version, 'should have version');
    assert.ok(parsed.timestamp, 'should have timestamp');
    assert.ok(typeof parsed.overBudget === 'boolean', 'should have overBudget');
    assert.ok(typeof parsed.budgetLimit === 'number', 'should have budgetLimit');
  });
});

test('--report --json has reductionPct field', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --report --json`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.ok(typeof parsed.reductionPct === 'number' && isFinite(parsed.reductionPct),
      'reductionPct should be a finite number');
  });
});

test('--report (human) output includes "version" line', () => {
  withTempProject((dir) => {
    const out = execSync(`node "${GEN_CONTEXT}" --report 2>&1`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(out.includes('version') || out.includes('0.9'), 'should show version in human report');
  });
});

// ---------------------------------------------------------------------------
// Integration tests — CLI --track
// ---------------------------------------------------------------------------

console.log('\nIntegration tests — --track\n');

test('--track creates .context/usage.ndjson', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}" --track`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(fs.existsSync(path.join(dir, '.context', 'usage.ndjson')));
  });
});

test('--track log entry is valid JSON with expected fields', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}" --track`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const raw = fs.readFileSync(path.join(dir, '.context', 'usage.ndjson'), 'utf8');
    const record = JSON.parse(raw.trim());
    assert.ok(record.ts, 'should have ts');
    assert.ok(record.version, 'should have version');
    assert.ok(typeof record.finalTokens === 'number', 'should have finalTokens');
    assert.ok(typeof record.reductionPct === 'number', 'should have reductionPct');
  });
});

test('without --track, no usage.ndjson is written', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}"`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(!fs.existsSync(path.join(dir, '.context', 'usage.ndjson')), 'log should NOT exist without --track');
  });
});

test('config tracking:true writes log without --track flag', () => {
  withTempProject((dir) => {
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ tracking: true }),
      'utf8'
    );
    execSync(`node "${GEN_CONTEXT}"`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(fs.existsSync(path.join(dir, '.context', 'usage.ndjson')));
  });
});

// ---------------------------------------------------------------------------
// Integration test — --report --history
// ---------------------------------------------------------------------------

console.log('\nIntegration tests — --report --history\n');

test('--report --history prints summary after --track runs', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}" --track`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = execSync(`node "${GEN_CONTEXT}" --report --history 2>&1`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(out.includes('total runs') || out.includes('totalRuns'), 'should show total runs');
  });
});

test('--report --history --json outputs valid JSON', () => {
  withTempProject((dir) => {
    execSync(`node "${GEN_CONTEXT}" --track`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = execSync(`node "${GEN_CONTEXT}" --report --history --json`, {
      cwd: dir, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    assert.ok(typeof parsed.totalRuns === 'number');
    assert.strictEqual(parsed.totalRuns, 1);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — scorer.js strategy-aware health score (v1.4)
// ---------------------------------------------------------------------------

console.log('\nUnit tests — health scorer (strategy-aware)\n');

const { score } = require('../../src/health/scorer');

test('score() returns an object with required fields', () => {
  withTempDir((dir) => {
    const result = score(dir);
    assert.ok(typeof result.score === 'number', 'score should be number');
    assert.ok(['A', 'B', 'C', 'D'].includes(result.grade), 'grade should be A/B/C/D');
    assert.ok(typeof result.strategy === 'string', 'strategy should be string');
    assert.ok(typeof result.totalRuns === 'number', 'totalRuns should be number');
    assert.ok(typeof result.overBudgetRuns === 'number', 'overBudgetRuns should be number');
  });
});

test('score() returns strategy:"full" when no config file', () => {
  withTempDir((dir) => {
    const result = score(dir);
    assert.strictEqual(result.strategy, 'full');
  });
});

test('score() returns strategy:"hot-cold" when config sets it', () => {
  withTempDir((dir) => {
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ strategy: 'hot-cold' }),
      'utf8'
    );
    const result = score(dir);
    assert.strictEqual(result.strategy, 'hot-cold');
  });
});

test('score() returns strategy:"per-module" when config sets it', () => {
  withTempDir((dir) => {
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ strategy: 'per-module' }),
      'utf8'
    );
    const result = score(dir);
    assert.strictEqual(result.strategy, 'per-module');
  });
});

test('score() does NOT penalise low reduction for hot-cold strategy', () => {
  withTempDir((dir) => {
    // Set hot-cold config
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ strategy: 'hot-cold' }),
      'utf8'
    );
    // Seed a usage log with 0% reduction (intentionally tiny hot output)
    logRun({ rawTokens: 1000, finalTokens: 950, reductionPct: 5, overBudget: false }, dir);

    const withHotCold = score(dir);

    // Compare to full strategy with same reduction — full should lose 20 pts
    const fullDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-obs-full-'));
    try {
      logRun({ rawTokens: 1000, finalTokens: 950, reductionPct: 5, overBudget: false }, fullDir);
      const withFull = score(fullDir);
      assert.ok(withHotCold.score >= withFull.score + 20,
        `hot-cold (${withHotCold.score}) should score at least 20 pts higher than full (${withFull.score}) on same low reduction`
      );
    } finally {
      fs.rmSync(fullDir, { recursive: true, force: true });
    }
  });
});

test('score() does NOT penalise low reduction for per-module strategy', () => {
  withTempDir((dir) => {
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ strategy: 'per-module' }),
      'utf8'
    );
    logRun({ rawTokens: 1000, finalTokens: 950, reductionPct: 5, overBudget: false }, dir);
    const result = score(dir);
    // Score should be 100 (no staleness, no over-budget, no reduction penalty)
    assert.strictEqual(result.score, 100, `per-module should not lose reduction points, got ${result.score}`);
  });
});

test('score() penalises low reduction for full strategy', () => {
  withTempDir((dir) => {
    // Default strategy (full), low reduction
    logRun({ rawTokens: 1000, finalTokens: 950, reductionPct: 5, overBudget: false }, dir);
    const result = score(dir);
    // Should lose 20 pts for low reduction
    assert.ok(result.score <= 80, `full strategy with 5% reduction should penalise, got ${result.score}`);
  });
});

test('score() strategyFreshnessDays is null for full strategy', () => {
  withTempDir((dir) => {
    const result = score(dir);
    assert.strictEqual(result.strategyFreshnessDays, null);
  });
});

test('score() strategyFreshnessDays is null for hot-cold when context-cold.md absent', () => {
  withTempDir((dir) => {
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ strategy: 'hot-cold' }),
      'utf8'
    );
    const result = score(dir);
    assert.strictEqual(result.strategyFreshnessDays, null,
      'Should be null when context-cold.md does not exist');
  });
});

test('score() strategyFreshnessDays is a number when context-cold.md exists (hot-cold)', () => {
  withTempDir((dir) => {
    fs.writeFileSync(
      path.join(dir, 'gen-context.config.json'),
      JSON.stringify({ strategy: 'hot-cold' }),
      'utf8'
    );
    const ghDir = path.join(dir, '.github');
    fs.mkdirSync(ghDir, { recursive: true });
    fs.writeFileSync(path.join(ghDir, 'context-cold.md'), '# cold context\n', 'utf8');
    const result = score(dir);
    assert.ok(typeof result.strategyFreshnessDays === 'number',
      `strategyFreshnessDays should be a number, got ${result.strategyFreshnessDays}`);
    assert.ok(result.strategyFreshnessDays >= 0, 'strategyFreshnessDays should be >= 0');
  });
});

test('score() grade is A when project is fully healthy', () => {
  withTempDir((dir) => {
    // No runs, no staleness, full strategy (defaults) → score = 100 → A
    const result = score(dir);
    assert.strictEqual(result.grade, 'A');
    assert.strictEqual(result.score, 100);
  });
});

test('score() never returns score outside 0-100', () => {
  withTempDir((dir) => {
    // Simulate worst-case: stale, low reduction, over-budget
    logRun({ rawTokens: 100, finalTokens: 99, reductionPct: 1, overBudget: true }, dir);
    logRun({ rawTokens: 100, finalTokens: 99, reductionPct: 1, overBudget: true }, dir);
    // Write a stale context file
    const ghDir = path.join(dir, '.github');
    fs.mkdirSync(ghDir, { recursive: true });
    // Use a file and manipulate its mtime via utimes to simulate 30-day staleness
    const ctxFile = path.join(ghDir, 'copilot-instructions.md');
    fs.writeFileSync(ctxFile, '# stale\n', 'utf8');
    const thirtyDaysAgo = (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(ctxFile, thirtyDaysAgo, thirtyDaysAgo);

    const result = score(dir);
    assert.ok(result.score >= 0, 'score should not go below 0');
    assert.ok(result.score <= 100, 'score should not exceed 100');
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`observability: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
