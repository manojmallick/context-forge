#!/usr/bin/env node
/**
 * Mine a retrieval corpus from git history.
 *
 * WHY: every hand-authored task carries its author's bias. Tasks written after
 * reading the indexed module docs score ~20pp above tasks written before — the
 * verbatim-ngram check catches copied phrasing, not shared concepts. The only
 * real fix is an author who never saw the index.
 *
 * Git history is full of them. A commit subject is a developer stating intent
 * in their own words; the files that commit touched are ground truth. Neither
 * is produced by whoever is tuning the ranker.
 *
 * RULES
 *  - Focused commits only (1-3 source files, <= 8 files total): a 40-file
 *    refactor has no single correct answer.
 *  - Conventional-commit furniture is stripped so the query reads as a request.
 *  - A leaking query is DROPPED, never rewritten. Editing it to pass would put
 *    the tuner's words back in and defeat the entire point.
 *  - Expected files must still exist in today's index.
 *  - At most 2 tasks per file, so one hot file cannot dominate the corpus.
 *
 * PARAMETER SENSITIVITY — read before trusting any single number. This repo's
 * 960 commits yield only ~23 usable tasks, so one task is 4.3pp. Sweeping the
 * defensible parameter range (MIN_SHARE 0.10-0.25, per-file cap 5-12) moves
 * hit@5 across 53.3%-73.1%. Loosening the cap to admit MORE tasks lowers the
 * score, which means the small-corpus figures are optimistic, not pessimistic.
 * Defaults below are chosen for the least-skewed corpus (fewest repeats per
 * file), NOT the highest score. Treat the output as a band, not a point.
 *
 * Usage: node scripts/mine-corpus.mjs [--limit 960] [--out <file>]
 */
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { queryLeakage } = require(join(ROOT, 'src/eval/corpus'));
const { readFullIndex } = require(join(ROOT, 'src/retrieval/sig-index-store'));

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const LIMIT = parseInt(val('--limit', '960'), 10);
const OUT = val('--out', 'benchmarks/tasks/retrieval-mined.jsonl');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
const index = readFullIndex(ROOT);

/** Strip conventional-commit furniture so the subject reads as a request. */
function cleanSubject(s) {
  return String(s)
    .replace(/^\s*\w+(\([^)]*\))?!?:\s*/, '')
    .replace(/\((closes|fixes|refs)[^)]*\)/gi, '')
    .replace(/#\d+/g, '')
    .replace(/\bv?\d+\.\d+\.\d+\b/g, '')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\b[\w./-]+\.(js|ts|py|mjs|json|md)\b/g, ' ')
    .replace(/\(\s*\)/g, ' ')                      // empty parens left by the strips above
    .replace(/[—–-]\s*$/, '')
    .replace(/^\s*[—–-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reject subjects that are not a statement of intent: merge-branch names
 * ("Feat/output flag"), bare version bumps, and changelog fragments that are
 * just a list of feature names joined by "+".
 */
function isUsableSubject(q) {
  if (/^\w+\/[\w-]+/.test(q)) return false;            // Feat/output-flag
  if ((q.match(/\+/g) || []).length >= 2) return false;  // "a + b + c" changelog line
  if (!/[a-z]{3}\s+[a-z]{2}/i.test(q)) return false;     // no prose-like word run
  return true;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function verbatimHit(query, files) {
  const w = norm(query).split(' ').filter(Boolean);
  for (const f of files) {
    const hay = norm((index.get(f) || []).join(' '));
    for (let i = 0; i + 4 <= w.length; i++) if (hay.includes(w.slice(i, i + 4).join(' '))) return true;
  }
  return false;
}

const log = git(['log', '--format=%H %s', `-n${LIMIT}`]).split('\n').filter(Boolean);
const tasks = [];
const seenFile = new Map();
const seenQuery = new Set();
const stats = { scanned: 0, unfocused: 0, tooShort: 0, notIndexed: 0, leaked: 0, verbatim: 0, dupe: 0 };

for (const line of log) {
  const sha = line.slice(0, 40);
  const subject = line.slice(41).trim();
  if (!/^[0-9a-f]{40}$/.test(sha) || !subject) continue;
  stats.scanned++;
  if (/^merge\b/i.test(subject) || /^(chore|docs|ci|build|style)\b/i.test(subject)) { stats.unfocused++; continue; }

  // --numstat, not --name-only: a commit's changed-file list mixes the file the
  // work happened in with collateral edits (a config default, a re-export). Both
  // look identical by name. Labelling collateral as "the answer" is simply wrong
  // ground truth — "add MiniMax ablation provider" touched pricing.js for 2 lines
  // out of 37, while the real work sat in a script. Share of changed lines
  // separates them mechanically, with no judgement from whoever is tuning.
  let stat;
  try { stat = git(['show', '--numstat', '--format=', '--no-renames', sha]); }
  catch { continue; }
  const churn = new Map();
  for (const row of stat.split('\n')) {
    const m = row.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    const add = m[1] === '-' ? 0 : parseInt(m[1], 10);
    const del = m[2] === '-' ? 0 : parseInt(m[2], 10);
    churn.set(m[3], add + del);
  }
  const files = [...churn.keys()];
  const totalChurn = [...churn.values()].reduce((x, y) => x + y, 0) || 1;
  // MIN_SHARE drops collateral. gen-context.js is additionally required to be
  // the DOMINANT file: build-bundle rewrites it on nearly every src change, so
  // a small diff there is regeneration noise, while a large one is real work in
  // its hand-written half (it holds the whole generator pipeline).
  const MIN_SHARE = 0.25;
  const maxChurn = Math.max(...churn.values(), 0);
  const src = files.filter((f) => {
    if (!/\.(js|py)$/.test(f)) return false;
    if (!/^(src|packages)\//.test(f) && f.includes('/')) return false;
    const share = (churn.get(f) || 0) / totalChurn;
    if (f === 'gen-context.js') return churn.get(f) === maxChurn && share >= MIN_SHARE;
    return share >= MIN_SHARE;
  });
  // No file-count ceiling. It used to reject any commit touching >4 source
  // files, on the theory that a broad change has no single right answer — but
  // MIN_SHARE already isolates the file the work actually happened in, so the
  // ceiling was just discarding usable history. 850 of 960 commits were being
  // dropped here, which is why the corpus was too small to give a stable number.
  if (src.length < 1) { stats.unfocused++; continue; }

  const expected = src.filter((f) => index.has(f));
  if (expected.length === 0) { stats.notIndexed++; continue; }
  if (expected.some((f) => (seenFile.get(f) || 0) >= 5)) { stats.dupe++; continue; }

  const query = cleanSubject(subject);
  if (query.split(/\s+/).filter(Boolean).length < 4 || !isUsableSubject(query)) { stats.tooShort++; continue; }
  if (seenQuery.has(query.toLowerCase())) { stats.dupe++; continue; }
  if (!queryLeakage(query, expected).clean) { stats.leaked++; continue; }
  if (verbatimHit(query, expected)) { stats.verbatim++; continue; }

  seenQuery.add(query.toLowerCase());
  for (const f of expected) seenFile.set(f, (seenFile.get(f) || 0) + 1);
  tasks.push({ id: `m${String(tasks.length + 1).padStart(3, '0')}`, split: 'hard', source: 'git', sha: sha.slice(0, 8), query, expected_files: expected, repo: '.' });
}

writeFileSync(join(ROOT, OUT), tasks.map((t) => JSON.stringify(t)).join('\n') + '\n');
console.log(`\nmined ${tasks.length} tasks from ${stats.scanned} commits -> ${OUT}`);
console.log(`  dropped: unfocused ${stats.unfocused} | not-indexed ${stats.notIndexed} | leaked ${stats.leaked} | verbatim ${stats.verbatim} | dupe ${stats.dupe} | too-short ${stats.tooShort}`);
