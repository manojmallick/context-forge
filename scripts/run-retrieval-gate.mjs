#!/usr/bin/env node
/**
 * Retrieval quality benchmark + regression gate.
 *
 *   node scripts/run-retrieval-gate.mjs             # report only
 *   node scripts/run-retrieval-gate.mjs --gate      # exit 1 below the floor
 *   node scripts/run-retrieval-gate.mjs --gate --no-regress
 *   node scripts/run-retrieval-gate.mjs --save      # record a new baseline
 *   node scripts/run-retrieval-gate.mjs --min 0.55  # override the floor
 *
 * KNOWN BIAS: tasks h031+ were authored after module-doc prose was indexed,
 * so their phrasing shares the header's CONCEPTS even where the verbatim-ngram
 * check passes. They score ~20pp above the tasks written before that (81.7% vs
 * 61.1%). Treat the absolute number as optimistic relative to a real user's
 * queries; the gate's job is detecting REGRESSION, which is unaffected.
 *
 * The gate is scored on `retrieval-hard.jsonl` — the leak-free split. The easy
 * corpus is reported for context but NEVER gated: 11 of its 20 queries contain
 * the answer's own filename, so it measures index coverage far more than it
 * measures ranking, and it moves ~3x further than reality for any given change.
 *
 * Reproducibility: run with `learned: false` so a developer's local
 * .context/weights.json cannot change the numbers CI sees. The retrieval index
 * (.context/sig-index.json) is gitignored, so a fresh checkout is regenerated
 * before scoring.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, } from 'child_process';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };

const GATE = has('--gate');
const NO_REGRESS = has('--no-regress');
const SAVE = has('--save');
const MIN = parseFloat(val('--min', '0.70'));
// The mined corpus is smaller and genuinely harder — no author bias propping it up.
// Floor set below the whole sensitivity band (53.3%-73.1% across defensible
// miner parameters) so the gate catches genuine regression rather than firing
// on corpus-parameter noise.
const MIN_MINED = parseFloat(val('--min-mined', '0.50'));
const BASELINE = join(ROOT, 'benchmarks', 'retrieval-baseline.json');
const EPS = 1e-9;

// The retrieval index is gitignored — regenerate on a cold checkout.
if (!existsSync(join(ROOT, '.context', 'sig-index.json'))) {
  console.log('[retrieval-gate] no retrieval index found — running generate first');
  execFileSync('node', [join(ROOT, 'gen-context.js')], { cwd: ROOT, stdio: 'ignore' });
}

const { run } = require(join(ROOT, 'src/eval/runner'));
const { queryLeakage } = require(join(ROOT, 'src/eval/corpus'));

function score(file) {
  const m = run(join('benchmarks/tasks', file), ROOT, { topK: 5, learned: false }).metrics;
  return { hitAt5: m.hitAt5, mrr: m.mrr, precisionAt5: m.precisionAt5, tasks: m.tasks };
}

/** The hard split is worthless if it ever starts leaking — verify every run. */
function assertLeakFree(file) {
  const tasks = readFileSync(join(ROOT, 'benchmarks/tasks', file), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const leaking = tasks.filter((t) => !queryLeakage(t.query, t.expected_files).clean);
  return { total: tasks.length, leaking: leaking.map((t) => t.id) };
}

const hard = score('retrieval-hard.jsonl');
const easy = score('retrieval.jsonl');
const mined = score('retrieval-mined.jsonl');
const leak = assertLeakFree('retrieval-hard.jsonl');
const leakMined = assertLeakFree('retrieval-mined.jsonl');

const pct = (n) => (n * 100).toFixed(1) + '%';
console.log('\n[sigmap] retrieval quality\n');
console.log('  corpus            tasks   hit@5     MRR     P@5');
console.log('  ' + '-'.repeat(48));
console.log(`  hard (gated)      ${String(hard.tasks).padStart(5)}   ${pct(hard.hitAt5).padStart(6)}   ${hard.mrr.toFixed(3)}   ${pct(hard.precisionAt5).padStart(6)}`);
console.log(`  mined (gated)     ${String(mined.tasks).padStart(5)}   ${pct(mined.hitAt5).padStart(6)}   ${mined.mrr.toFixed(3)}   ${pct(mined.precisionAt5).padStart(6)}`);
console.log(`  easy (reference)  ${String(easy.tasks).padStart(5)}   ${pct(easy.hitAt5).padStart(6)}   ${easy.mrr.toFixed(3)}   ${pct(easy.precisionAt5).padStart(6)}`);
console.log('\n  mined = commit subjects + the files that commit touched. Nobody tuning');
console.log('  the ranker wrote them, so it is the only unbiased number here.');
console.log('  It is also SMALL: 1 task = ' + (100 / mined.tasks).toFixed(1) + 'pp, and the defensible miner');
console.log('  parameter range spans 53-73%. Read it as a band, not a point.');

const prior = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
if (prior && prior.hard) {
  const dm2 = prior.mined ? mined.hitAt5 - prior.mined.hitAt5 : 0;
  const d = hard.hitAt5 - prior.hard.hitAt5;
  const dm = hard.mrr - prior.hard.mrr;
  console.log(`\n  vs baseline       hard ${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp   mined ${dm2 >= 0 ? '+' : ''}${(dm2 * 100).toFixed(1)}pp   MRR ${dm >= 0 ? '+' : ''}${dm.toFixed(3)}`);
}

if (SAVE) {
  writeFileSync(BASELINE, JSON.stringify({ hard, mined, easy, recordedBy: 'run-retrieval-gate.mjs' }, null, 2) + '\n');
  console.log(`\n[retrieval-gate] baseline saved → ${BASELINE.replace(ROOT + '/', '')}`);
}

const reasons = [];
if (leakMined.leaking.length > 0) {
  reasons.push(`mined split leaks basename tokens in ${leakMined.leaking.length} task(s)`);
}
if (mined.hitAt5 < MIN_MINED - EPS) {
  reasons.push(`mined hit@5 ${pct(mined.hitAt5)} below floor ${pct(MIN_MINED)}`);
}
if (NO_REGRESS && prior && prior.mined && mined.hitAt5 < prior.mined.hitAt5 - EPS) {
  reasons.push(`mined hit@5 regressed ${pct(prior.mined.hitAt5)} -> ${pct(mined.hitAt5)}`);
}
if (leak.leaking.length > 0) {
  reasons.push(`hard split leaks basename tokens in ${leak.leaking.length} task(s): ${leak.leaking.join(', ')}`);
}
if (hard.hitAt5 < MIN - EPS) {
  reasons.push(`hard hit@5 ${pct(hard.hitAt5)} below floor ${pct(MIN)}`);
}
if (NO_REGRESS && prior && prior.hard && hard.hitAt5 < prior.hard.hitAt5 - EPS) {
  reasons.push(`hard hit@5 regressed ${pct(prior.hard.hitAt5)} → ${pct(hard.hitAt5)}`);
}

// One task is worth 100/N points. Compute headroom in TASKS, not in
// percentage points — float division of a k/N ratio rounds the answer off by one.
const perTask = 100 / hard.tasks;
const hits = Math.round(hard.hitAt5 * hard.tasks);
const minHits = Math.ceil(MIN * hard.tasks - EPS);
console.log(`\n  floor ${pct(MIN)}  ·  ${hits}/${hard.tasks} tasks pass  ·  1 task = ${perTask.toFixed(1)}pp  ·  ${Math.max(0, hits - minHits)} task(s) of headroom`);

if (!GATE) {
  console.log('\n[retrieval-gate] report only (pass --gate to enforce)\n');
  process.exit(0);
}
if (reasons.length > 0) {
  console.error('\n[retrieval-gate] FAIL');
  for (const r of reasons) console.error('  ✗ ' + r);
  console.error('');
  process.exit(1);
}
console.log('\n[retrieval-gate] PASS\n');
