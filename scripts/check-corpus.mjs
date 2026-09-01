#!/usr/bin/env node
/**
 * Retrieval-corpus hygiene.
 *
 * `queryLeakage` catches BASENAME leakage — a query containing its answer's
 * filename. Once module-doc prose is indexed, a second, subtler leak appears:
 * a query paraphrased straight from the file's own header is trivially
 * retrievable for reasons that have nothing to do with ranking quality.
 *
 * So this also checks VERBATIM OVERLAP: no 4-word run from a query may appear
 * in its expected file's indexed text. Shared vocabulary is legitimate and
 * necessary — BM25 cannot work without it. Copied phrasing is not.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { queryLeakage } = require(join(ROOT, 'src/eval/corpus'));
const { readFullIndex } = require(join(ROOT, 'src/retrieval/sig-index-store'));

const NGRAM = 4;
const file = process.argv[2] || 'benchmarks/tasks/retrieval-hard.jsonl';
const tasks = readFileSync(join(ROOT, file), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const index = readFullIndex(ROOT);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function ngrams(text, n) {
  const w = norm(text).split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' '));
  return out;
}

let basenameLeaks = 0, verbatimLeaks = 0, missing = 0, unreachable = 0;
const problems = [];
for (const t of tasks) {
  const bl = queryLeakage(t.query, t.expected_files);
  if (!bl.clean) { basenameLeaks++; problems.push(`${t.id}  BASENAME LEAK ${JSON.stringify(bl.leaked)}`); }
  for (const f of t.expected_files) {
    if (!index.has(f)) {
      missing++;
      problems.push(`${t.id}  EXPECTED FILE NOT INDEXED: ${f}`);
      continue;
    }
    const hay = norm(index.get(f).join(' '));
    const hit = ngrams(t.query, NGRAM).find((g) => hay.includes(g));
    if (hit) { verbatimLeaks++; problems.push(`${t.id}  VERBATIM ${NGRAM}-GRAM in ${f}: "${hit}"`); }
  }
}

// A task nothing can retrieve is not "hard", it is broken.
const ids = new Set(tasks.map((t) => t.id));
if (ids.size !== tasks.length) problems.push(`DUPLICATE task ids (${tasks.length - ids.size})`);

console.log(`\ncorpus: ${file}`);
console.log(`  tasks             : ${tasks.length}`);
console.log(`  basename leaks    : ${basenameLeaks}`);
console.log(`  verbatim ${NGRAM}-grams : ${verbatimLeaks}`);
console.log(`  expected missing  : ${missing}`);
if (problems.length) {
  console.log('\nproblems:');
  for (const p of problems) console.log('  ✗ ' + p);
  console.log('');
  process.exit(1);
}
console.log('  ✓ clean\n');
