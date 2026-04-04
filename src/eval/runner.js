'use strict';

/**
 * SigMap benchmark runner.
 * Zero npm dependencies.
 *
 * Loads evaluation tasks from a JSONL file, runs signature-based retrieval
 * against a target repo, and returns scored results.
 *
 * Usage (programmatic):
 *   const { run } = require('./src/eval/runner');
 *   const results = run('benchmarks/tasks/retrieval.jsonl', cwd);
 *   // results: { tasks: [...], metrics: { hitAt5, mrr, precisionAt5, avgTokens, tasks } }
 *
 * Usage (CLI via gen-context.js --benchmark):
 *   node gen-context.js --benchmark
 *   node gen-context.js --benchmark --json
 */

const fs = require('fs');
const path = require('path');
const { aggregate } = require('./scorer');

// ---------------------------------------------------------------------------
// Context file reader
// ---------------------------------------------------------------------------

/**
 * Read the generated context file and build a simple signature index:
 *   Map<filePath, string[]>  — file → list of signature strings
 *
 * The context file uses section headers like:
 *   ### src/extractors/python.js
 * followed by ``` blocks containing signatures.
 *
 * @param {string} cwd
 * @returns {Map<string, string[]>}
 */
function buildSigIndex(cwd) {
  const contextPath = path.join(cwd, '.github', 'copilot-instructions.md');
  const index = new Map();

  if (!fs.existsSync(contextPath)) return index;

  const content = fs.readFileSync(contextPath, 'utf8');
  const lines = content.split('\n');

  let currentFile = null;
  let inBlock = false;
  let sigs = [];

  for (const line of lines) {
    // Section header: ### path/to/file.js
    const headerMatch = line.match(/^###\s+(\S+\.\w+)\s*$/);
    if (headerMatch) {
      if (currentFile !== null) {
        index.set(currentFile, sigs);
      }
      currentFile = headerMatch[1];
      sigs = [];
      inBlock = false;
      continue;
    }

    if (line.startsWith('```')) {
      inBlock = !inBlock;
      continue;
    }

    if (inBlock && currentFile && line.trim()) {
      sigs.push(line.trim());
    }
  }

  // Flush last file
  if (currentFile !== null) {
    index.set(currentFile, sigs);
  }

  return index;
}

// ---------------------------------------------------------------------------
// Simple keyword-based ranking (pre-retrieval layer; v2.3 adds proper ranker)
// ---------------------------------------------------------------------------

/**
 * Tokenize a query or signature into lower-case word tokens.
 * Splits on whitespace, punctuation, camelCase, and snake_case.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text) return [];
  return text
    // split camelCase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // split snake/kebab
    .replace(/[_\-]/g, ' ')
    // drop non-word chars
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'of', 'to', 'for', 'and', 'or', 'is', 'are',
  'that', 'this', 'it', 'with', 'from', 'by', 'be', 'as', 'on', 'at',
]);

/**
 * Score a single file's signatures against a query.
 * Returns a non-negative number; higher = more relevant.
 * @param {string[]} sigs  - array of signature strings for this file
 * @param {string[]} queryTokens
 * @returns {number}
 */
function scoreFile(sigs, queryTokens) {
  if (!sigs || sigs.length === 0) return 0;

  const sigText = sigs.join(' ');
  const sigTokens = new Set(tokenize(sigText));

  let score = 0;
  for (const qt of queryTokens) {
    if (STOP_WORDS.has(qt)) continue;
    if (sigTokens.has(qt)) score += 1;
    // Partial match (prefix)
    for (const st of sigTokens) {
      if (st !== qt && st.startsWith(qt) && qt.length >= 4) score += 0.3;
    }
  }

  return score;
}

/**
 * Rank all files in the index against a query. Returns file paths sorted
 * by relevance score descending. Ties are broken by file path alphabetically.
 * @param {string} query
 * @param {Map<string, string[]>} index
 * @param {number} topK
 * @returns {{ file: string, score: number, sigs: string[] }[]}
 */
function rank(query, index, topK = 10) {
  const queryTokens = tokenize(query);
  const scored = [];

  for (const [file, sigs] of index.entries()) {
    const score = scoreFile(sigs, queryTokens);
    scored.push({ file, score, sigs });
  }

  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return scored.slice(0, topK);
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate token count from character count (chars/4, ±5%).
 * @param {string[]} sigs
 * @returns {number}
 */
function estimateTokens(sigs) {
  const text = (sigs || []).join('\n');
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Task loader
// ---------------------------------------------------------------------------

/**
 * Load tasks from a JSONL file.
 * Each line: { id, query, expected_files, repo }
 * Invalid or blank lines are silently skipped.
 * @param {string} tasksFile - absolute or relative path
 * @returns {Array<{id:string, query:string, expected:string[], repo:string}>}
 */
function loadTasks(tasksFile) {
  if (!fs.existsSync(tasksFile)) return [];
  const lines = fs.readFileSync(tasksFile, 'utf8').split('\n');
  const tasks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.query && Array.isArray(obj.expected_files)) {
        tasks.push({
          id: obj.id || String(tasks.length + 1),
          query: obj.query,
          expected: obj.expected_files,
          repo: obj.repo || '.',
        });
      }
    } catch {
      // skip invalid JSON lines
    }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

/**
 * Run all tasks in tasksFile against the repo at cwd.
 *
 * @param {string} tasksFile - path to JSONL task file (absolute or relative to cwd)
 * @param {string} cwd       - project root
 * @param {object} [opts]
 * @param {number} [opts.topK=10] - how many results to rank per query
 * @returns {{
 *   tasks: Array<{id, query, expected, ranked, hit5, rr, precAt5, tokens}>,
 *   metrics: { hitAt5, mrr, precisionAt5, avgTokens, tasks }
 * }}
 */
function run(tasksFile, cwd, opts = {}) {
  const topK = opts.topK || 10;

  // Resolve paths
  const resolvedTasksFile = path.isAbsolute(tasksFile)
    ? tasksFile
    : path.resolve(cwd, tasksFile);

  const tasks = loadTasks(resolvedTasksFile);
  if (tasks.length === 0) {
    return {
      tasks: [],
      metrics: { hitAt5: 0, mrr: 0, precisionAt5: 0, avgTokens: 0, tasks: 0 },
    };
  }

  // Build index once (re-used across all tasks in the same repo)
  const index = buildSigIndex(cwd);

  const taskResults = [];
  for (const task of tasks) {
    const ranked = rank(task.query, index, topK).map((r) => r.file);
    const topResult = rank(task.query, index, topK);
    const tokens = topResult.reduce((sum, r) => sum + estimateTokens(r.sigs), 0);

    const { hitAtK, reciprocalRank, precisionAtK } = require('./scorer');
    const hit5 = hitAtK(ranked, task.expected, 5);
    const rr = reciprocalRank(ranked, task.expected);
    const precAt5 = precisionAtK(ranked, task.expected, 5);

    taskResults.push({
      id: task.id,
      query: task.query,
      expected: task.expected,
      ranked,
      hit5,
      rr,
      precAt5,
      tokens,
    });
  }

  const metrics = aggregate(
    taskResults.map((r) => ({ ranked: r.ranked, expected: r.expected, tokens: r.tokens })),
  );

  return { tasks: taskResults, metrics };
}

// ---------------------------------------------------------------------------
// Table formatter
// ---------------------------------------------------------------------------

/**
 * Format task results as a markdown table string.
 * @param {Array} taskResults - from run()
 * @returns {string}
 */
function formatTable(taskResults) {
  const header = '| Task | Query | hit@5 | RR | Tokens |';
  const divider = '|---|---|:---:|:---:|---:|';
  const rows = taskResults.map((r) => {
    const q = r.query.length > 40 ? r.query.slice(0, 37) + '...' : r.query;
    return `| ${r.id} | ${q} | ${r.hit5 ? '✓' : '✗'} | ${r.rr.toFixed(2)} | ${r.tokens} |`;
  });
  return [header, divider, ...rows].join('\n');
}

/**
 * Format aggregate metrics as a human-readable string.
 * @param {object} metrics - from aggregate()
 * @returns {string}
 */
function formatMetrics(metrics) {
  return [
    `[sigmap] benchmark results:`,
    `  tasks       : ${metrics.tasks}`,
    `  hit@5       : ${(metrics.hitAt5 * 100).toFixed(1)}%`,
    `  MRR         : ${metrics.mrr.toFixed(3)}`,
    `  precision@5 : ${(metrics.precisionAt5 * 100).toFixed(1)}%`,
    `  avg tokens  : ${metrics.avgTokens}`,
  ].join('\n');
}

module.exports = { run, rank, loadTasks, buildSigIndex, formatTable, formatMetrics, tokenize };
