'use strict';

/**
 * SigMap evaluation scorer.
 * Zero npm dependencies.
 *
 * Computes retrieval quality metrics:
 *   hit@k     — fraction of tasks where the correct file appears in top-k results
 *   MRR       — mean reciprocal rank (1/rank of first correct result)
 *   precision@k — fraction of top-k results that are correct
 *
 * All functions are pure and never throw.
 */

/**
 * Return the 1-based rank of the first expected file found in the ranked
 * result list, or Infinity if none found.
 * @param {string[]} ranked   - Ordered list of file paths returned by the system
 * @param {string[]} expected - List of acceptable correct files (any match counts)
 * @returns {number}
 */
function firstRank(ranked, expected) {
  if (!Array.isArray(ranked) || !Array.isArray(expected)) return Infinity;
  const expSet = new Set(expected.map((f) => normalizePath(f)));
  for (let i = 0; i < ranked.length; i++) {
    if (expSet.has(normalizePath(ranked[i]))) return i + 1;
  }
  return Infinity;
}

/**
 * Normalize a file path for comparison (trim leading ./, lowercase on
 * case-insensitive platforms is intentionally NOT done — keep paths as-is
 * but trim leading directory separators and ./).
 * @param {string} p
 * @returns {string}
 */
function normalizePath(p) {
  return String(p).replace(/^\.\//, '').replace(/\\/g, '/');
}

/**
 * Compute hit@k for one task.
 * @param {string[]} ranked   - Ordered results
 * @param {string[]} expected - Correct files
 * @param {number}   k        - Cut-off (default 5)
 * @returns {0|1}
 */
function hitAtK(ranked, expected, k = 5) {
  return firstRank(ranked, expected) <= k ? 1 : 0;
}

/**
 * Compute reciprocal rank for one task.
 * @param {string[]} ranked
 * @param {string[]} expected
 * @returns {number} value in (0, 1]
 */
function reciprocalRank(ranked, expected) {
  const rank = firstRank(ranked, expected);
  return rank === Infinity ? 0 : 1 / rank;
}

/**
 * Compute precision@k for one task.
 * Fraction of the top-k results that appear in expected.
 * @param {string[]} ranked
 * @param {string[]} expected
 * @param {number}   k
 * @returns {number} value in [0, 1]
 */
function precisionAtK(ranked, expected, k = 5) {
  if (!ranked || ranked.length === 0) return 0;
  const expSet = new Set(expected.map((f) => normalizePath(f)));
  const topK = ranked.slice(0, k);
  const hits = topK.filter((f) => expSet.has(normalizePath(f))).length;
  return hits / topK.length;
}

/**
 * Aggregate metrics across all task results.
 *
 * @param {Array<{ranked: string[], expected: string[], tokens: number}>} results
 * @param {number} k - cut-off (default 5)
 * @returns {{
 *   hitAt5: number,    // fraction [0,1]
 *   mrr: number,       // mean reciprocal rank [0,1]
 *   precisionAt5: number,
 *   avgTokens: number,
 *   tasks: number
 * }}
 */
function aggregate(results, k = 5) {
  if (!Array.isArray(results) || results.length === 0) {
    return { hitAt5: 0, mrr: 0, precisionAt5: 0, avgTokens: 0, tasks: 0 };
  }

  let totalHit = 0;
  let totalRR = 0;
  let totalPrec = 0;
  let totalTokens = 0;

  for (const r of results) {
    const ranked = r.ranked || [];
    const expected = r.expected || [];
    totalHit += hitAtK(ranked, expected, k);
    totalRR += reciprocalRank(ranked, expected);
    totalPrec += precisionAtK(ranked, expected, k);
    totalTokens += (typeof r.tokens === 'number' ? r.tokens : 0);
  }

  const n = results.length;
  return {
    hitAt5: round(totalHit / n),
    mrr: round(totalRR / n),
    precisionAt5: round(totalPrec / n),
    avgTokens: Math.round(totalTokens / n),
    tasks: n,
  };
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}

module.exports = { hitAtK, reciprocalRank, precisionAtK, aggregate, firstRank };
