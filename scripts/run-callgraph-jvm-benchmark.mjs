#!/usr/bin/env node
/**
 * JVM call-graph gate — the regression guard for #560, #562 and #564.
 *
 *   node scripts/run-callgraph-jvm-benchmark.mjs           # run, print table
 *   node scripts/run-callgraph-jvm-benchmark.mjs --json    # machine-readable
 *   node scripts/run-callgraph-jvm-benchmark.mjs --save    # write the baseline
 *   node scripts/run-callgraph-jvm-benchmark.mjs --gate    # exit 1 on regression
 *
 * WHY: the Java call graph produced zero edges for a long time and nothing
 * noticed, because every gated retrieval corpus is JavaScript and a retrieval
 * corpus measures ranking, not graph edges. This asserts the graph directly.
 *
 * Two kinds of check:
 *   1. GROUND TRUTH — named caller→callee pairs that must resolve. These are
 *      real call sites read out of the cloned repos, each one an instance of a
 *      pattern a specific fix added, so a silent revert fails loudly.
 *   2. VOLUME — symbols and edges against a committed baseline, to catch a
 *      change that keeps the named pairs but guts everything else.
 *
 * Offline and deterministic: no network, no LLM, no mining. Exits 0 when the
 * repos are absent so a fresh checkout is never broken by it.
 *
 * Scope: `.java` only — the call graph does not extract Kotlin or Scala defs,
 * so the JVM repos in those languages are not covered here.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildCallGraph } = require(path.join(ROOT, 'src/graph/call-graph.js'));

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const save = argv.includes('--save');
const gate = argv.includes('--gate');

const REPOS_DIR = path.join(ROOT, 'benchmarks', 'repos');
const BASELINE = path.join(ROOT, 'benchmarks', 'callgraph-jvm-baseline.json');

/**
 * Each pair is a real call site in the cloned repo. `why` names the fix that
 * makes it resolve, so a failure points straight at what broke.
 */
const REPOS = [
  {
    name: 'spring-petclinic',
    srcDirs: ['src'],
    truth: [
      { from: 'VetController.java#findPaginated', to: 'VetRepository.java#findAll',
        why: 'receiver-typed call through an @Autowired field (#562)' },
      { from: 'VetController.java#showVetList', to: 'Vets.java#getVetList',
        why: 'receiver-typed call on a local declaration (#562)' },
    ],
  },
  // okhttp and akka are deliberately absent: the call graph supports `.java`
  // only (JAVA_EXTS), so Kotlin and Scala yield zero symbols. Listing them
  // would show an empty row that reads as a failure rather than a gap in
  // language coverage. Add them here if/when .kt/.scala defs are supported.
];

const edgeCount = (g) => { let n = 0; for (const s of g.forward.values()) n += s.length; return n; };
const has = (g, fromSub, toSub) => {
  const from = [...g.forward.keys()].find((k) => k.endsWith(fromSub));
  if (!from) return false;
  return (g.forward.get(from) || []).some((t) => t.endsWith(toSub));
};

const results = [];
for (const repo of REPOS) {
  const dir = path.join(REPOS_DIR, repo.name);
  if (!fs.existsSync(dir)) { results.push({ repo: repo.name, skipped: 'not cloned' }); continue; }

  const g = buildCallGraph(dir, { srcDirs: repo.srcDirs });
  const conf = { high: 0, medium: 0 };
  for (const v of g.edgeConfidence.values()) conf[v] = (conf[v] || 0) + 1;

  const truth = repo.truth.map((t) => ({ ...t, ok: has(g, t.from, t.to) }));
  results.push({
    repo: repo.name,
    symbols: g.defs.size,
    edges: edgeCount(g),
    high: conf.high,
    medium: conf.medium,
    truth,
  });
}

const live = results.filter((r) => !r.skipped);
const missing = live.flatMap((r) => (r.truth || []).filter((t) => !t.ok).map((t) => ({ repo: r.repo, ...t })));

// Volume regression: a >20% drop in either symbols or edges is a real change,
// not noise — this graph is deterministic, so any movement is a code change.
let regressions = [];
let baseline = null;
if (fs.existsSync(BASELINE)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  for (const r of live) {
    const b = (baseline.repos || []).find((x) => x.repo === r.repo);
    if (!b) continue;
    for (const k of ['symbols', 'edges']) {
      if (b[k] > 0 && r[k] < b[k] * 0.8) {
        regressions.push(`${r.repo}: ${k} ${b[k]} → ${r[k]} (−${(100 * (1 - r[k] / b[k])).toFixed(0)}%)`);
      }
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ repos: results, missing, regressions }, null, 2));
} else {
  console.log('');
  console.log('[sigmap] JVM call-graph gate');
  console.log('');
  console.log('  repo                symbols    edges     high   medium');
  console.log('  ' + '-'.repeat(56));
  for (const r of results) {
    if (r.skipped) { console.log(`  ${r.repo.padEnd(20)}${'— ' + r.skipped}`); continue; }
    console.log(`  ${r.repo.padEnd(20)}${String(r.symbols).padStart(7)}${String(r.edges).padStart(9)}${String(r.high).padStart(9)}${String(r.medium).padStart(9)}`);
  }
  console.log('');
  const allTruth = live.flatMap((r) => (r.truth || []).map((t) => ({ repo: r.repo, ...t })));
  if (allTruth.length) {
    console.log('  ground-truth call sites');
    for (const t of allTruth) {
      console.log(`    ${t.ok ? '✓' : '✗'}  ${t.from} → ${t.to}`);
      if (!t.ok) console.log(`         expected via ${t.why}`);
    }
    console.log('');
  }
  if (regressions.length) { console.log('  volume regressions vs baseline:'); regressions.forEach((x) => console.log('    ' + x)); console.log(''); }
  if (!live.length) console.log('  no JVM repos cloned — nothing to check\n');
}

if (save) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({
    generated_note: 'Deterministic counts from the cloned JVM repos. Regenerate with --save.',
    repos: live.map(({ repo, symbols, edges, high, medium }) => ({ repo, symbols, edges, high, medium })),
  }, null, 2) + '\n');
  console.log(`[callgraph-jvm] baseline → ${path.relative(ROOT, BASELINE)}`);
}

if (gate) {
  if (!live.length) { console.log('[callgraph-jvm] repos not cloned — gate skipped'); process.exit(0); }
  if (missing.length || regressions.length) {
    for (const m of missing) console.error(`[callgraph-jvm] FAIL ${m.repo}: ${m.from} → ${m.to} did not resolve (${m.why})`);
    for (const r of regressions) console.error(`[callgraph-jvm] FAIL ${r}`);
    process.exit(1);
  }
  console.log('[callgraph-jvm] PASS');
}
