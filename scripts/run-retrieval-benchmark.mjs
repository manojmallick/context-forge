#!/usr/bin/env node
/**
 * SigMap retrieval benchmark — 18 real repos, 90 tasks
 *
 * For each repo:
 *   1. Runs `node gen-context.js` to build the SigMap output
 *   2. Parses .github/copilot-instructions.md into a signature index
 *   3. Scores 5 retrieval queries against that index
 *   4. Computes random baseline: min(1, 5/fileCount)
 *   5. Maps hit rank → quality tier (Correct / Partial / Wrong)
 *
 * No LLM API. All metrics are retrieval-rank math.
 *
 * Usage:
 *   node scripts/run-retrieval-benchmark.mjs
 *   node scripts/run-retrieval-benchmark.mjs --save
 *   node scripts/run-retrieval-benchmark.mjs --json
 *   node scripts/run-retrieval-benchmark.mjs --skip-run  (use existing output files)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPOS_DIR = path.join(ROOT, 'benchmarks', 'repos');
const TASKS_DIR = path.join(ROOT, 'benchmarks', 'tasks');
const REPORTS_DIR = path.join(ROOT, 'benchmarks', 'reports');

const SAVE = process.argv.includes('--save');
const JSON_OUT = process.argv.includes('--json');
const SKIP_RUN = process.argv.includes('--skip-run');
const COMPARE = process.argv.includes('--compare');

// ---------------------------------------------------------------------------
// Repos config
// ---------------------------------------------------------------------------
const REPOS = [
  { repo: 'express',          fileCount: 6    },
  { repo: 'flask',            fileCount: 19   },
  { repo: 'gin',              fileCount: 107  },
  { repo: 'spring-petclinic', fileCount: 13   },
  { repo: 'rails',            fileCount: 1179 },
  { repo: 'axios',            fileCount: 25   },
  { repo: 'rust-analyzer',    fileCount: 635  },
  { repo: 'abseil-cpp',       fileCount: 700  },
  { repo: 'serilog',          fileCount: 99   },
  { repo: 'riverpod',         fileCount: 446  },
  { repo: 'okhttp',           fileCount: 18   },
  { repo: 'laravel',          fileCount: 1533 },
  { repo: 'akka',             fileCount: 211  },
  { repo: 'vapor',            fileCount: 131  },
  { repo: 'vue-core',         fileCount: 232  },
  { repo: 'svelte',           fileCount: 370  },
  { repo: 'fastify',          fileCount: 31   },
  { repo: 'fastapi',          fileCount: 48   },
  // R language (v6.10.10+)
  { repo: 'ggplot2',          fileCount: 201  },
  { repo: 'dplyr',            fileCount: 106  },
  { repo: 'shiny',            fileCount: 101  },
];

// Explicit srcDirs prevent test/, docs/, .idea/ etc. from polluting the index.
// Single source of truth shared by every suite that regenerates repo contexts —
// divergent copies caused the #522 cross-suite skew (a repo regenerated with a
// different config scores differently in every later suite).
const CONFIG_OVERRIDES = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'benchmarks', 'config-overrides.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Ranking — identifier-aware BM25, shared with src/eval/runner.js (#395)
// ---------------------------------------------------------------------------
const { bm25rank } = require('../src/retrieval/bm25.js');

// ---------------------------------------------------------------------------
// Sig index parser — reads copilot-instructions.md
// ---------------------------------------------------------------------------
function buildSigIndex(contextPath) {
  const index = new Map();
  if (!fs.existsSync(contextPath)) return index;

  const lines = fs.readFileSync(contextPath, 'utf8').split('\n');
  let currentFile = null;
  let inBlock = false;
  let sigs = [];

  for (const line of lines) {
    const headerMatch = line.match(/^###\s+(\S+)\s*$/);
    if (headerMatch) {
      if (currentFile !== null) index.set(currentFile, sigs);
      currentFile = headerMatch[1];
      sigs = [];
      inBlock = false;
      continue;
    }
    if (line.startsWith('```')) { inBlock = !inBlock; continue; }
    if (inBlock && currentFile && line.trim()) sigs.push(line.trim());
  }
  if (currentFile !== null) index.set(currentFile, sigs);
  return index;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function rank(query, index, topK = 10) {
  const candidates = [];
  for (const [file, sigs] of index.entries()) {
    candidates.push({ file, sigs });
  }
  return bm25rank(query, candidates).slice(0, topK).map(r => r.file);
}

function normalizePath(p) {
  return String(p).replace(/^\.\//, '').replace(/\\/g, '/');
}

function firstRank(ranked, expected) {
  const expSet = new Set(expected.map(normalizePath));
  for (let i = 0; i < ranked.length; i++) {
    if (expSet.has(normalizePath(ranked[i]))) return i + 1;
  }
  return Infinity;
}

function hitAtK(ranked, expected, k = 5) {
  return firstRank(ranked, expected) <= k ? 1 : 0;
}

function reciprocalRank(ranked, expected) {
  const r = firstRank(ranked, expected);
  return r === Infinity ? 0 : 1 / r;
}

// tier: Correct=rank1, Partial=rank2-5, Wrong=not found
function qualityTier(ranked, expected) {
  const r = firstRank(ranked, expected);
  if (r === 1) return 'correct';
  if (r <= 5) return 'partial';
  return 'wrong';
}

// ---------------------------------------------------------------------------
// Task loader
// ---------------------------------------------------------------------------
function loadTasks(tasksFile) {
  if (!fs.existsSync(tasksFile)) return [];
  return fs.readFileSync(tasksFile, 'utf8').split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .filter(t => t.query && Array.isArray(t.expected_files))
    .map(t => ({ id: t.id, query: t.query, expected: t.expected_files }));
}

// ---------------------------------------------------------------------------
// Gen-context runner
// ---------------------------------------------------------------------------
function runGenContext(repo, repoDir) {
  const configPath = path.join(repoDir, 'gen-context.config.json');
  const configOverride = CONFIG_OVERRIDES[repo];
  const existingConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;

  // Always apply override when present — even if a config already exists.
  // Without this, repos with pre-existing configs (e.g. spring-petclinic with
  // srcDirs:["."] that picks up .idea/) bypass the benchmark srcDirs constraint.
  if (configOverride) {
    fs.writeFileSync(configPath, JSON.stringify(configOverride, null, 2));
  }

  try {
    execSync(`node "${path.join(ROOT, 'gen-context.js')}"`, {
      cwd: repoDir,
      stdio: 'pipe',
      timeout: 60_000,
    });
    return true;
  } catch {
    return false;
  } finally {
    if (configOverride) {
      try {
        if (existingConfig !== null) {
          fs.writeFileSync(configPath, existingConfig);
        } else {
          fs.unlinkSync(configPath);
        }
      } catch (_) {}
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const results = [];

for (const { repo, fileCount } of REPOS) {
  const repoDir = path.join(REPOS_DIR, repo);
  const contextPath = path.join(repoDir, '.github', 'copilot-instructions.md');
  const tasksFile = path.join(TASKS_DIR, `${repo}.jsonl`);

  if (!fs.existsSync(repoDir)) {
    if (!JSON_OUT) process.stderr.write(`[skip] ${repo}: not cloned\n`);
    continue;
  }

  if (!fs.existsSync(tasksFile)) {
    if (!JSON_OUT) process.stderr.write(`[skip] ${repo}: no task file\n`);
    continue;
  }

  // Step 1: run gen-context (or use existing output)
  if (!SKIP_RUN) {
    if (!JSON_OUT) process.stderr.write(`[run]  ${repo} ...\n`);
    const ok = runGenContext(repo, repoDir);
    if (!ok && !fs.existsSync(contextPath)) {
      if (!JSON_OUT) process.stderr.write(`[fail] ${repo}: gen-context failed\n`);
      continue;
    }
  }

  if (!fs.existsSync(contextPath)) {
    if (!JSON_OUT) process.stderr.write(`[skip] ${repo}: no context file (run without --skip-run)\n`);
    continue;
  }

  // Step 2: build sig index
  const index = buildSigIndex(contextPath);
  const sigCount = index.size;

  // Step 3: run tasks
  const tasks = loadTasks(tasksFile);
  let totalHit = 0, totalRR = 0;
  const tierCounts = { correct: 0, partial: 0, wrong: 0 };
  const taskDetails = [];

  for (const task of tasks) {
    const ranked = rank(task.query, index, 10);
    const hit = hitAtK(ranked, task.expected, 5);
    const rr = reciprocalRank(ranked, task.expected);
    const tier = qualityTier(ranked, task.expected);

    totalHit += hit;
    totalRR += rr;
    tierCounts[tier]++;

    taskDetails.push({
      id: task.id,
      query: task.query,
      expected: task.expected,
      top1: ranked[0] || null,
      firstHitRank: firstRank(ranked, task.expected),
      tier,
    });
  }

  const n = tasks.length;
  // Random baseline: probability that any one random file matches, up to top-5
  const randomHit5 = Math.min(1, 5 / fileCount);

  results.push({
    repo,
    fileCount,
    sigCount,
    tasks: n,
    hitAt5: Math.round((totalHit / n) * 1000) / 1000,
    mrr: Math.round((totalRR / n) * 1000) / 1000,
    randomBaseline: Math.round(randomHit5 * 1000) / 1000,
    improvement: n > 0 ? Math.round(((totalHit / n) / randomHit5) * 10) / 10 : null,
    tiers: tierCounts,
    taskDetails,
  });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (JSON_OUT) {
  console.log(JSON.stringify({ generated: new Date().toISOString(), repos: results }, null, 2));
  process.exit(0);
}

// Terminal table
const W = { repo: 16, files: 7, sigs: 5, rand: 8, sigmap: 9, lift: 7, correct: 8, partial: 8, wrong: 7 };
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

console.log('\n' + '─'.repeat(90));
console.log(
  pad('Repo', W.repo) +
  padL('Files', W.files) +
  padL('Sigs', W.sigs) +
  padL('Random', W.rand) +
  padL('SigMap', W.sigmap) +
  padL('Lift', W.lift) +
  padL('Correct', W.correct) +
  padL('Partial', W.partial) +
  padL('Wrong', W.wrong)
);
console.log('─'.repeat(90));

let totHit = 0, totRand = 0, totTasks = 0;
let totCorrect = 0, totPartial = 0, totWrong = 0;

for (const r of results) {
  totHit += r.hitAt5 * r.tasks;
  totRand += r.randomBaseline * r.tasks;
  totTasks += r.tasks;
  totCorrect += r.tiers.correct;
  totPartial += r.tiers.partial;
  totWrong += r.tiers.wrong;

  const pct = v => (v * 100).toFixed(0) + '%';
  const lift = r.improvement !== null ? r.improvement + '×' : 'n/a';

  console.log(
    pad(r.repo, W.repo) +
    padL(r.fileCount, W.files) +
    padL(r.sigCount, W.sigs) +
    padL(pct(r.randomBaseline), W.rand) +
    padL(pct(r.hitAt5), W.sigmap) +
    padL(lift, W.lift) +
    padL(r.tiers.correct + '/5', W.correct) +
    padL(r.tiers.partial + '/5', W.partial) +
    padL(r.tiers.wrong + '/5', W.wrong)
  );
}

console.log('─'.repeat(90));
const avgHit = totHit / totTasks;
const avgRand = totRand / totTasks;
const avgLift = (avgHit / avgRand).toFixed(1);
const pct = v => (v * 100).toFixed(1) + '%';
console.log(
  pad('AVERAGE', W.repo) +
  padL('', W.files) +
  padL('', W.sigs) +
  padL(pct(avgRand), W.rand) +
  padL(pct(avgHit), W.sigmap) +
  padL(avgLift + '×', W.lift) +
  padL(totCorrect + '/' + totTasks, W.correct) +
  padL(totPartial + '/' + totTasks, W.partial) +
  padL(totWrong + '/' + totTasks, W.wrong)
);
console.log('─'.repeat(90));

console.log(`\nMethodology:`);
console.log(`  Random baseline = min(1, 5/fileCount) — probability of a random 5-file selection containing the target`);
console.log(`  Correct = target file is rank-1 result`);
console.log(`  Partial = target file in ranks 2–5`);
console.log(`  Wrong   = target file not in top-5`);
console.log(`  No LLM API used. All scores are retrieval rank math.\n`);

if (SAVE) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, 'retrieval.json');
  fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), repos: results }, null, 2));
  console.log(`[saved] ${outPath}`);
}

if (COMPARE) {
  const sigTokens = results.reduce((s, r) => s + (r.sigCount || 0), 0);
  const baseTokens = results.reduce((s, r) => s + Math.round(r.fileCount * 4000), 0);
  process.stdout.write(JSON.stringify({
    sigmap:   { hitAt5: avgHit,  tokens: Math.round(sigTokens  / Math.max(results.length, 1)) },
    baseline: { hitAt5: avgRand, tokens: Math.round(baseTokens / Math.max(results.length, 1)) },
  }) + '\n');
}

// Append to benchmark history
{
  const histPath = path.join(ROOT, '.context', 'benchmark-history.ndjson');
  try {
    fs.mkdirSync(path.dirname(histPath), { recursive: true });
    let version = 'unknown';
    try { version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'unknown'; } catch (_) {}
    fs.appendFileSync(histPath, JSON.stringify({
      ts: new Date().toISOString(),
      type: 'retrieval',
      version,
      hitAt5: Math.round(avgHit * 1000) / 1000,
      hitAt5Pct: parseFloat((avgHit * 100).toFixed(1)),
      repos: results.length,
      tasks: totTasks,
    }) + '\n', 'utf8');
  } catch (_) {}
}
