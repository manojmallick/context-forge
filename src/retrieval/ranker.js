'use strict';

/**
 * SigMap zero-dependency relevance ranker.
 *
 * Ranks all files in a signature index against a natural-language query.
 * Scoring weights:
 *   - keyword overlap (exact token match against sigs)
 *   - symbol match (token appears in a top-level identifier / function name)
 *   - partial prefix match (token is prefix of a sig token, length ≥ 4)
 *   - path relevance (query token appears in the file path)
 *   - recency boost (applied externally via recency map)
 *
 * Usage:
 *   const { rank } = require('./src/retrieval/ranker');
 *   const results = rank(query, sigIndex, { topK: 10 });
 *   // results: [{ file, score, sigs, tokens }]
 */

const { tokenize, STOP_WORDS } = require('./tokenizer');

// ---------------------------------------------------------------------------
// Default weights
// ---------------------------------------------------------------------------
const DEFAULT_WEIGHTS = {
  exactToken: 1.0,       // query token exactly in sig tokens
  symbolMatch: 0.5,      // bonus if token appears in a function/class name line
  prefixMatch: 0.3,      // partial prefix hit (query token ≥ 4 chars)
  pathMatch: 0.8,        // query token appears in the file path
  recencyBoost: 1.5,     // multiplier applied when file is in recencySet
};

/**
 * Score a single file against a query.
 *
 * @param {string}   filePath   - relative file path (e.g. 'src/extractors/python.js')
 * @param {string[]} sigs       - signature strings for this file
 * @param {string[]} queryTokens - pre-tokenized query
 * @param {object}   weights
 * @returns {number}
 */
function scoreFile(filePath, sigs, queryTokens, weights) {
  if (!sigs || sigs.length === 0) return 0;

  const w = weights || DEFAULT_WEIGHTS;

  // Build token set from all signatures
  const sigText = sigs.join(' ');
  const sigTokenSet = new Set(tokenize(sigText));

  // Build token set from the file path
  const pathTokenSet = new Set(tokenize(filePath));

  let score = 0;

  for (const qt of queryTokens) {
    if (STOP_WORDS.has(qt)) continue;

    // Exact token match in sigs
    if (sigTokenSet.has(qt)) {
      score += w.exactToken;

      // Bonus: appears directly in a function/class/method name line
      const nameLineMatch = sigs.some((sig) => {
        const nt = tokenize(sig.replace(/[^a-zA-Z0-9_\s]/g, ' '));
        return nt.includes(qt);
      });
      if (nameLineMatch) score += w.symbolMatch;
    }

    // Prefix match (e.g. query "python" matches "pythonDeps")
    if (qt.length >= 4) {
      for (const st of sigTokenSet) {
        if (st !== qt && st.startsWith(qt)) {
          score += w.prefixMatch;
          break; // one bonus per query token
        }
      }
    }

    // Path token match
    if (pathTokenSet.has(qt)) {
      score += w.pathMatch;
    }
  }

  return score;
}

/**
 * Rank all files in a signature index against a query.
 *
 * @param {string}              query     - natural language query
 * @param {Map<string,string[]>} sigIndex - Map<file, sigs[]>
 * @param {object}  [opts]
 * @param {number}  [opts.topK=10]               - max results to return
 * @param {number}  [opts.recencyBoost=1.5]       - multiplier for recent files
 * @param {Set<string>} [opts.recencySet]         - set of recently-changed file paths
 * @param {object}  [opts.weights]               - override scoring weights
 * @returns {{ file: string, score: number, sigs: string[], tokens: number }[]}
 */
function rank(query, sigIndex, opts) {
  if (!query || typeof query !== 'string') return [];
  if (!sigIndex || !(sigIndex instanceof Map) || sigIndex.size === 0) return [];

  const topK = (opts && opts.topK) || 10;
  const recencyMultiplier = (opts && opts.recencyBoost) || DEFAULT_WEIGHTS.recencyBoost;
  const recencySet = (opts && opts.recencySet) || null;
  const weights = (opts && opts.weights) ? Object.assign({}, DEFAULT_WEIGHTS, opts.weights) : DEFAULT_WEIGHTS;

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // Empty query: return top-K by file count (most signatures = most useful)
    const all = [];
    for (const [file, sigs] of sigIndex.entries()) {
      all.push({ file, score: sigs.length, sigs, tokens: Math.ceil(sigs.join('\n').length / 4) });
    }
    all.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
    return all.slice(0, topK);
  }

  const scored = [];
  for (const [file, sigs] of sigIndex.entries()) {
    let score = scoreFile(file, sigs, queryTokens, weights);

    // Recency boost
    if (recencySet && recencySet.has(file) && score > 0) {
      score *= recencyMultiplier;
    }

    scored.push({
      file,
      score,
      sigs,
      tokens: Math.ceil(sigs.join('\n').length / 4),
    });
  }

  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return scored.slice(0, topK);
}

/**
 * Build a signature index from the generated context file.
 * Returns Map<filePath, string[]> where filePath is the relative path
 * as it appears in the ### headers of copilot-instructions.md.
 *
 * @param {string} cwd
 * @returns {Map<string, string[]>}
 */
function buildSigIndex(cwd) {
  const fs   = require('fs');
  const path = require('path');
  const contextPath = path.join(cwd, '.github', 'copilot-instructions.md');
  const index = new Map();

  if (!fs.existsSync(contextPath)) return index;

  const content = fs.readFileSync(contextPath, 'utf8');
  const lines = content.split('\n');

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

/**
 * Format ranked results as a markdown table string.
 *
 * @param {{ file: string, score: number, sigs: string[], tokens: number }[]} results
 * @param {string} query
 * @returns {string}
 */
function formatRankTable(results, query) {
  if (!results || results.length === 0) {
    return `No matching files found for query: "${query}"\n`;
  }

  const lines = [
    `## Query: ${query}`,
    '',
    '| Rank | File | Score | Sigs | Tokens |',
    '|------|------|-------|------|--------|',
    ...results.map((r, i) =>
      `| ${i + 1} | ${r.file} | ${r.score.toFixed(2)} | ${r.sigs.length} | ${r.tokens} |`
    ),
    '',
  ];

  // Add signature details for top results
  for (const r of results.slice(0, 3)) {
    if (r.sigs.length > 0) {
      lines.push(`### ${r.file}`);
      lines.push('```');
      lines.push(...r.sigs.slice(0, 10));
      if (r.sigs.length > 10) lines.push(`... (${r.sigs.length - 10} more)`);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format ranked results as a structured JSON-serialisable object.
 *
 * @param {{ file: string, score: number, sigs: string[], tokens: number }[]} results
 * @param {string} query
 * @returns {object}
 */
function formatRankJSON(results, query) {
  return {
    query,
    results: (results || []).map((r, i) => ({
      rank: i + 1,
      file: r.file,
      score: r.score,
      sigs: r.sigs,
      tokens: r.tokens,
    })),
    totalResults: (results || []).length,
  };
}

module.exports = { rank, buildSigIndex, scoreFile, formatRankTable, formatRankJSON, DEFAULT_WEIGHTS };
