#!/usr/bin/env node
'use strict';

/**
 * run-honest-benchmark.mjs — SigMap ranker vs an honest grep-agent baseline.
 *
 * The task-benchmark's published baseline is random file selection
 * (min(1, 5/fileCount)) — nobody works that way. This benchmark scores the
 * production ranker against what an agent's grep loop actually does: scan the
 * whole repo for the query's terms and rank files by term coverage, then
 * occurrence count. Same task corpus (benchmarks/tasks/*.jsonl), same scorer
 * (src/eval/scorer.js), single-shot for both sides.
 *
 * The baseline is implemented internally (pure Node fs scan — no ripgrep, no
 * child processes) so the benchmark is zero-dependency and deterministic.
 * Directories skipped mirror ripgrep defaults: VCS/vendor dirs plus top-level
 * directory patterns from the scanned repo's .gitignore.
 *
 * SigMap's side reads each repo's committed context output via
 * src/eval/runner.js — run scripts/run-retrieval-benchmark.mjs first if a
 * repo's context file is missing.
 *
 *   node scripts/run-honest-benchmark.mjs           # print comparison table
 *   node scripts/run-honest-benchmark.mjs --save    # also write benchmarks/reports/honest-baseline.json
 *   node scripts/run-honest-benchmark.mjs --json    # print report JSON to stdout
 *
 * No LLM API. All metrics are retrieval-rank math.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(ROOT, 'benchmarks', 'tasks');
const REPOS_DIR = path.join(ROOT, 'benchmarks', 'repos');
const REPORT_PATH = path.join(ROOT, 'benchmarks', 'reports', 'honest-baseline.json');

const SAVE = process.argv.includes('--save');
const JSON_OUT = process.argv.includes('--json');

const runner = require(path.join(ROOT, 'src', 'eval', 'runner.js'));
const scorer = require(path.join(ROOT, 'src', 'eval', 'scorer.js'));
const { STOP } = require(path.join(ROOT, 'src', 'retrieval', 'bm25.js'));
const { sizeBucket } = require(path.join(ROOT, 'src', 'eval', 'corpus.js'));

// Dirs a grep agent never scans (ripgrep skips VCS + honors .gitignore).
const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'vendor', 'dist', 'build', 'target',
  'out', 'coverage', '.next', '__pycache__', '.venv', 'venv', '.tox',
]);
const MAX_FILE_BYTES = 1024 * 1024; // grep-realistic cap; skips lockfile giants

const round = (n, d = 3) => Math.round(Number(n) * 10 ** d) / 10 ** d;
const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

/** Significant literal query terms — no stemming; grep matches literals. */
function terms(query) {
  return [...new Set(
    String(query).toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  )];
}

/** Top-level directory patterns from a repo's .gitignore (simple names only). */
function gitignoreDirs(repoPath) {
  const dirs = new Set();
  try {
    const src = fs.readFileSync(path.join(repoPath, '.gitignore'), 'utf8');
    for (const raw of src.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('!')) continue;
      const m = line.match(/^\/?([A-Za-z0-9._-]+)\/?$/);
      if (m) dirs.add(m[1]);
    }
  } catch (_) { /* no .gitignore — nothing to skip */ }
  return dirs;
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack, needle) {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) { n++; i = haystack.indexOf(needle, i + needle.length); }
  return n;
}

/**
 * Scan a repo once and rank files for every task's term set.
 * @returns {{ ranked: Map<string, string[]>, filesScanned: number }}
 *   ranked: task id → top-10 relative file paths; filesScanned: repo size
 *   basis for the A3 bucket (files the scan visited — NOT the budget-capped
 *   context index, which measures maxTokens rather than the repo).
 */
function grepRank(repoPath, tasks) {
  const perTask = new Map(tasks.map((t) => [t.id, new Map()])); // id → file → {cover, occ}
  const termSets = tasks.map((t) => ({ id: t.id, terms: terms(t.query) }));
  const ignored = gitignoreDirs(repoPath);
  let filesScanned = 0;

  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name)); // deterministic order
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || ignored.has(e.name)) continue;
        walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      filesScanned++;
      let buf;
      try {
        if (fs.statSync(full).size > MAX_FILE_BYTES) continue;
        buf = fs.readFileSync(full);
      } catch (_) { continue; }
      if (buf.subarray(0, 8192).includes(0)) continue; // binary
      const text = buf.toString('utf8').toLowerCase();
      const rel = norm(path.relative(repoPath, full));

      const termCount = new Map(); // term → occurrences in this file (shared across tasks)
      for (const { id, terms: ts } of termSets) {
        let cover = 0, occ = 0;
        for (const t of ts) {
          if (!termCount.has(t)) termCount.set(t, countOccurrences(text, t));
          const c = termCount.get(t);
          if (c > 0) { cover++; occ += c; }
        }
        if (cover > 0) perTask.get(id).set(rel, { cover, occ });
      }
    }
  };
  walk(repoPath);

  const ranked = new Map();
  for (const [id, fileScores] of perTask) {
    ranked.set(id, [...fileScores.entries()]
      .sort((a, b) => b[1].cover - a[1].cover || b[1].occ - a[1].occ || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([file]) => file));
  }
  return { ranked, filesScanned };
}

function loadTasks(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ── run ──────────────────────────────────────────────────────────────────────
const taskFiles = fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith('.jsonl')).sort();
const perRepo = [];
const skipped = [];
let nTasks = 0;
const totals = { sigHit: 0, grepHit: 0, sigMrr: 0, grepMrr: 0 };

// A3: per-split (easy/hard) and per-repo-size-bucket accumulators.
const newAcc = () => ({ n: 0, sigHit: 0, grepHit: 0, sigMrr: 0, grepMrr: 0 });
const splits = { easy: newAcc(), hard: newAcc() };
const buckets = { small: newAcc(), medium: newAcc(), large: newAcc() };
const accAdd = (acc, sigH, grepH, sigRr, grepRr) => {
  acc.n++; acc.sigHit += sigH; acc.grepHit += grepH; acc.sigMrr += sigRr; acc.grepMrr += grepRr;
};
const accSummary = (acc) => (acc.n === 0 ? null : {
  tasks: acc.n,
  sigmap: { hitAt5: round(acc.sigHit / acc.n), mrr: round(acc.sigMrr / acc.n) },
  grepBaseline: { hitAt5: round(acc.grepHit / acc.n), mrr: round(acc.grepMrr / acc.n) },
});

for (const f of taskFiles) {
  const name = f.replace('.jsonl', '');
  const repoPath = name === 'retrieval' ? ROOT : path.join(REPOS_DIR, name);
  if (!fs.existsSync(repoPath)) { skipped.push({ repo: name, reason: 'repo not cloned' }); continue; }

  const sigIndex = runner.buildSigIndex(repoPath);
  if (!sigIndex || sigIndex.size === 0) {
    skipped.push({ repo: name, reason: 'no context output — run scripts/run-retrieval-benchmark.mjs' });
    continue;
  }

  const tasks = loadTasks(path.join(TASKS_DIR, f));
  const { ranked: grepRanked, filesScanned } = grepRank(repoPath, tasks);

  const bucket = sizeBucket(filesScanned);
  const row = { repo: name, tasks: tasks.length, sigHit: 0, grepHit: 0 };
  for (const t of tasks) {
    const expected = t.expected_files || [];
    const split = t.split === 'hard' ? 'hard' : 'easy';
    const sig = runner.rank(t.query, sigIndex, 10).map((r) => r.file);
    const grep = grepRanked.get(t.id) || [];
    const sigH = scorer.hitAtK(sig, expected, 5);
    const grepH = scorer.hitAtK(grep, expected, 5);
    const sigRr = scorer.reciprocalRank(sig, expected);
    const grepRr = scorer.reciprocalRank(grep, expected);
    row.sigHit += sigH;
    row.grepHit += grepH;
    totals.sigHit += sigH ? 1 : 0;
    totals.grepHit += grepH ? 1 : 0;
    totals.sigMrr += sigRr;
    totals.grepMrr += grepRr;
    accAdd(splits[split], sigH, grepH, sigRr, grepRr);
    accAdd(buckets[bucket], sigH, grepH, sigRr, grepRr);
    nTasks++;
  }
  perRepo.push({
    repo: name,
    tasks: tasks.length,
    bucket,
    // The 'retrieval' task set scores against the LIVE SigMap repo (ROOT), so
    // its context — and this row — legitimately drifts with every release.
    // Labeled so cross-release comparisons never mistake it for harness
    // instability (#522).
    ...(repoPath === ROOT ? { selfRepo: true } : {}),
    sigmapHitAt5: round(row.sigHit / tasks.length),
    grepHitAt5: round(row.grepHit / tasks.length),
  });
}

if (nTasks === 0) {
  console.error('No tasks scored — clone benchmark repos and generate context first.');
  process.exit(1);
}

const sigHitAt5 = totals.sigHit / nTasks;
const grepHitAt5 = totals.grepHit / nTasks;
const report = {
  generated: new Date().toISOString(),
  methodology: {
    corpus: 'benchmarks/tasks/*.jsonl',
    scorer: 'src/eval/scorer.js hitAtK/reciprocalRank, k=5',
    sigmap: 'src/eval/runner.js buildSigIndex + rank over committed context output',
    baseline: 'internal single-shot grep-agent: whole-repo term scan, ranked by distinct-term coverage then occurrences; skips VCS/vendor dirs + top-level .gitignore dirs; files ≤1MB, non-binary',
    note: 'Single-shot floor for agentic grep — a live agent iterates above this at the cost of extra turns and tokens.',
  },
  summary: {
    tasks: nTasks,
    repos: perRepo.length,
    sigmap: { hitAt5: round(sigHitAt5), mrr: round(totals.sigMrr / nTasks) },
    grepBaseline: { hitAt5: round(grepHitAt5), mrr: round(totals.grepMrr / nTasks) },
    lift: round(grepHitAt5 > 0 ? sigHitAt5 / grepHitAt5 : 0, 2),
    deltaPts: round((sigHitAt5 - grepHitAt5) * 100, 1),
    splits: { easy: accSummary(splits.easy), hard: accSummary(splits.hard) },
    buckets: {
      small: accSummary(buckets.small),
      medium: accSummary(buckets.medium),
      large: accSummary(buckets.large),
    },
  },
  repos: perRepo,
  skipped,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = (v) => `${(v * 100).toFixed(0)}%`.padStart(5);
  console.log('\n  repo                 tasks  SigMap  grep-agent');
  console.log('  -------------------- -----  ------  ----------');
  for (const r of perRepo) {
    console.log(`  ${(r.repo + (r.selfRepo ? '*' : '')).padEnd(20)} ${String(r.tasks).padStart(5)}  ${pct(r.sigmapHitAt5)}  ${pct(r.grepHitAt5).padStart(9)}`);
  }
  const s = report.summary;
  console.log(`\n  SigMap        hit@5 ${(s.sigmap.hitAt5 * 100).toFixed(1)}%   MRR ${s.sigmap.mrr.toFixed(3)}`);
  console.log(`  grep baseline hit@5 ${(s.grepBaseline.hitAt5 * 100).toFixed(1)}%   MRR ${s.grepBaseline.mrr.toFixed(3)}`);
  console.log(`  honest lift   ${s.lift}×  (+${s.deltaPts}pt over ${s.tasks} tasks, ${s.repos} repos)`);
  const line = (label, a) => a && console.log(
    `  ${label.padEnd(13)} hit@5 ${(a.sigmap.hitAt5 * 100).toFixed(1)}%  MRR ${a.sigmap.mrr.toFixed(3)}  vs grep ${(a.grepBaseline.hitAt5 * 100).toFixed(1)}%  (${a.tasks} tasks)`);
  line('split easy', s.splits.easy);
  line('split hard', s.splits.hard);
  line('repos small', s.buckets.small);
  line('repos medium', s.buckets.medium);
  line('repos large', s.buckets.large);
  if (perRepo.some((r) => r.selfRepo)) {
    console.log('  * self-repo task set — scored against the live SigMap repo; drifts with development by design');
  }
  for (const sk of skipped) console.log(`  [skipped] ${sk.repo}: ${sk.reason}`);
}

if (SAVE) {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(`\n  saved → ${path.relative(ROOT, REPORT_PATH)}`);
}
