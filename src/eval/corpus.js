'use strict';

/**
 * Task-corpus hygiene (A3, v8.22 "Hard Corpus").
 *
 * A benchmark query "leaks" when it shares a token with the basenames of its
 * expected files — hit@5 then partly measures filename matching, not
 * retrieval. The criterion is deterministic and reuses the production
 * tokenizer (identifier splitting + stemming from src/retrieval/bm25.js), so
 * "payments" leaks against payment.js and "InterceptorManager" leaks against
 * "interceptor manager" the same way the ranker would see them.
 *
 * Tasks carry an optional `split` field: 'hard' tasks MUST be leak-free
 * (validateTasks reports them as violations); 'easy' tasks (the default) may
 * leak — that is what makes them easy.
 *
 * Size buckets group repos by indexed file count so large repos stop being
 * averaged away by tiny ones. Thresholds are the rough tertiles of the
 * current benchmarks/repos corpus (43 repos, 27–3450 source files).
 */

const { tokenize } = require('../retrieval/bm25');

const BUCKET_LIMITS = { small: 200, medium: 1000 }; // files; large = above medium

/**
 * Stemmed tokens of a file path's basename (extension stripped).
 * @param {string} filePath
 * @returns {string[]}
 */
function basenameTokens(filePath) {
  const base = String(filePath).split('/').pop() || '';
  return tokenize(base.replace(/\.[^.]*$/, ''));
}

/**
 * Leaked tokens between a query and its expected files' basenames.
 * @param {string} query
 * @param {string[]} expectedFiles
 * @returns {{ leaked: string[], clean: boolean }}
 */
function queryLeakage(query, expectedFiles) {
  const qToks = new Set(tokenize(query));
  const leaked = new Set();
  for (const f of expectedFiles || []) {
    for (const t of basenameTokens(f)) {
      if (qToks.has(t)) leaked.add(t);
    }
  }
  return { leaked: [...leaked].sort(), clean: leaked.size === 0 };
}

/**
 * Validate a task list: every task gets a leakage result; hard-split tasks
 * that leak are violations.
 * @param {Array<{id?:string, query:string, expected_files?:string[], split?:string}>} tasks
 * @returns {{ results: object[], hardViolations: object[] }}
 */
function validateTasks(tasks) {
  const results = [];
  const hardViolations = [];
  for (const t of tasks || []) {
    const split = t.split === 'hard' ? 'hard' : 'easy';
    const { leaked, clean } = queryLeakage(t.query, t.expected_files);
    const row = { id: t.id || '?', split, leaked, clean };
    results.push(row);
    if (split === 'hard' && !clean) hardViolations.push(row);
  }
  return { results, hardViolations };
}

/**
 * Size bucket for a repo by indexed file count.
 * @param {number} fileCount
 * @returns {'small'|'medium'|'large'}
 */
function sizeBucket(fileCount) {
  if (fileCount < BUCKET_LIMITS.small) return 'small';
  if (fileCount <= BUCKET_LIMITS.medium) return 'medium';
  return 'large';
}

module.exports = { basenameTokens, queryLeakage, validateTasks, sizeBucket, BUCKET_LIMITS };
