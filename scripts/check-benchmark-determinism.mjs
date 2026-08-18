#!/usr/bin/env node
'use strict';

/**
 * check-benchmark-determinism.mjs — the #522 reproducibility gate.
 *
 *   node scripts/check-benchmark-determinism.mjs                # two-run check
 *   node scripts/check-benchmark-determinism.mjs --cross-suite  # + quality run between
 *
 * Two-run mode: runs `benchmark:honest` twice with nothing in between and
 * fails unless the reports are identical (minus the `generated` timestamp).
 *
 * Cross-suite mode: additionally runs the quality suite between two honest
 * runs and asserts the scores still match — proving the quality suite's
 * context regeneration no longer skews the shared benchmark repos (the
 * override-mismatch bug this gate exists for).
 *
 * Requires cached benchmark repos with generated context (run the retrieval
 * benchmark first). Exit 1 on any divergence, with a per-repo diff.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CROSS_SUITE = process.argv.includes('--cross-suite');

function runJson(script, args = []) {
  const res = spawnSync('node', [path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024,
  });
  if (res.status !== 0) {
    console.error(`[determinism] ${script} exited ${res.status}\n${(res.stderr || '').slice(0, 800)}`);
    process.exit(1);
  }
  return JSON.parse(res.stdout);
}

function canonical(report) {
  const { generated, ...rest } = report;
  return JSON.stringify(rest, null, 2);
}

function diffRepos(a, b, label) {
  const f = (x) => Object.fromEntries(x.repos.map((r) => [r.repo, r.sigmapHitAt5]));
  const ra = f(a), rb = f(b);
  let diverged = false;
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (ra[k] !== rb[k]) {
      diverged = true;
      console.error(`  DIVERGED [${label}] ${k}: ${ra[k]} → ${rb[k]}`);
    }
  }
  return diverged;
}

console.log('[determinism] run 1: benchmark:honest');
const run1 = runJson('run-honest-benchmark.mjs', ['--json']);

if (CROSS_SUITE) {
  console.log('[determinism] cross-suite: running the quality suite between honest runs');
  const q = spawnSync('node', [path.join(ROOT, 'scripts', 'run-quality-benchmark.mjs')], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024,
  });
  if (q.status !== 0) {
    console.error(`[determinism] quality suite exited ${q.status} — cannot verify cross-suite stability`);
    process.exit(1);
  }
}

console.log('[determinism] run 2: benchmark:honest');
const run2 = runJson('run-honest-benchmark.mjs', ['--json']);

if (canonical(run1) === canonical(run2)) {
  console.log(`[determinism] OK — ${CROSS_SUITE ? 'cross-suite ' : ''}runs identical`
    + ` (hit@5 ${(run1.summary.sigmap.hitAt5 * 100).toFixed(1)}%, ${run1.summary.tasks} tasks)`);
  process.exit(0);
}

console.error(`[determinism] FAIL — ${CROSS_SUITE ? 'the quality suite skewed the shared contexts' : 'consecutive runs diverged'}`);
console.error(`  run 1 hit@5 ${(run1.summary.sigmap.hitAt5 * 100).toFixed(1)}%  →  run 2 hit@5 ${(run2.summary.sigmap.hitAt5 * 100).toFixed(1)}%`);
diffRepos(run1, run2, CROSS_SUITE ? 'quality-skew' : 'rerun');
process.exit(1);
