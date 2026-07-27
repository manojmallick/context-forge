#!/usr/bin/env node
'use strict';

/**
 * validate-task-corpus.mjs — leakage gate for benchmarks/tasks/*.jsonl (A3).
 *
 * A hard-split task whose query shares a stemmed token with an expected file's
 * basename is a violation: the "hard" label would be a lie. Easy-split leakage
 * is reported as information only — easy tasks are allowed to leak.
 *
 *   node scripts/validate-task-corpus.mjs           # table; exit 1 on hard violations
 *   node scripts/validate-task-corpus.mjs --json    # report JSON to stdout
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(ROOT, 'benchmarks', 'tasks');

const JSON_OUT = process.argv.includes('--json');

const { validateTasks } = require(path.join(ROOT, 'src', 'eval', 'corpus.js'));

const files = fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith('.jsonl')).sort();
const report = { files: [], totals: { tasks: 0, hard: 0, hardViolations: 0, easyLeaky: 0 } };

for (const f of files) {
  const tasks = fs.readFileSync(path.join(TASKS_DIR, f), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const { results, hardViolations } = validateTasks(tasks);
  const easyLeaky = results.filter((r) => r.split === 'easy' && !r.clean).length;
  const hard = results.filter((r) => r.split === 'hard').length;
  report.files.push({ file: f, tasks: results.length, hard, hardViolations, easyLeaky });
  report.totals.tasks += results.length;
  report.totals.hard += hard;
  report.totals.hardViolations += hardViolations.length;
  report.totals.easyLeaky += easyLeaky;
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\n  task file                  tasks  hard  hard-violations  easy-leaky');
  console.log('  -------------------------  -----  ----  ---------------  ----------');
  for (const r of report.files) {
    console.log(`  ${r.file.padEnd(25)} ${String(r.tasks).padStart(6)} ${String(r.hard).padStart(5)}  ${String(r.hardViolations.length).padStart(15)}  ${String(r.easyLeaky).padStart(10)}`);
    for (const v of r.hardViolations) {
      console.log(`      LEAK ${v.id}: [${v.leaked.join(', ')}]`);
    }
  }
  const t = report.totals;
  console.log(`\n  ${t.tasks} tasks · ${t.hard} hard · ${t.hardViolations} hard violation(s) · ${t.easyLeaky} easy task(s) leak (allowed)`);
}

process.exit(report.totals.hardViolations > 0 ? 1 : 0);
