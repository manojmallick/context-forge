'use strict';

/**
 * sigmap-core — public programmatic API
 *
 * Usage:
 *   const { extract, rank, scan, score } = require('sigmap');
 *
 * All functions are zero-dependency and never throw.
 */

const path = require('path');

// ---------------------------------------------------------------------------
// Language extractor registry
// ---------------------------------------------------------------------------
const EXT_MAP = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',     '.pyw': 'python',
  '.java': 'java',
  '.kt': 'kotlin',     '.kts': 'kotlin',
  '.go': 'go',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.c': 'cpp', '.h': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.rb': 'ruby',       '.rake': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.dart': 'dart',
  '.scala': 'scala',   '.sc': 'scala',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.html': 'html',     '.htm': 'html',
  '.css': 'css',       '.scss': 'css', '.sass': 'css', '.less': 'css',
  '.yml': 'yaml',      '.yaml': 'yaml',
  '.sh': 'shell',      '.bash': 'shell', '.zsh': 'shell', '.fish': 'shell',
};

const SRC_ROOT = path.resolve(__dirname, '..', '..', 'src');

function _resolveExtractor(language) {
  const extPath = path.join(SRC_ROOT, 'extractors', language + '.js');
  try {
    return require(extPath);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// extract(src, language) → string[]
// ---------------------------------------------------------------------------
/**
 * Extract code signatures from source text for the given language.
 *
 * @param {string} src       - Raw source file content
 * @param {string} language  - Language name (e.g. 'typescript', 'python')
 *                             OR a file path/name with a recognised extension
 * @returns {string[]} Array of signature strings (never throws)
 *
 * @example
 *   const sigs = extract('function hello() {}', 'javascript');
 *   // → ['function hello()']
 *
 *   const sigs2 = extract(src, 'src/server.ts');
 *   // → detected as typescript via extension
 */
function extract(src, language) {
  if (!src || typeof src !== 'string') return [];
  if (!language || typeof language !== 'string') return [];

  // If language looks like a file path, derive language from extension
  let lang = language;
  if (language.includes('.') || language.includes('/') || language.includes('\\')) {
    const ext = path.extname(language).toLowerCase();
    const base = path.basename(language);
    if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) {
      lang = 'dockerfile';
    } else {
      lang = EXT_MAP[ext] || null;
    }
    if (!lang) return [];
  } else {
    // Normalise e.g. 'JavaScript' → 'javascript'
    lang = language.toLowerCase();
  }

  const mod = _resolveExtractor(lang);
  if (!mod || typeof mod.extract !== 'function') return [];

  try {
    const result = mod.extract(src);
    return Array.isArray(result) ? result : [];
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// rank(query, sigIndex, opts?) → { file, score, sigs, tokens }[]
// ---------------------------------------------------------------------------
/**
 * Rank files in a signature index against a natural-language query.
 *
 * @param {string} query   - Natural language or keyword query
 * @param {Map<string, string[]>} sigIndex - File → signatures map
 * @param {object} [opts]
 * @param {number} [opts.topK=10]        - Maximum results to return
 * @param {number} [opts.recencyBoost]   - Score multiplier for recent files
 * @param {Set<string>} [opts.recencySet] - Set of file paths considered recent
 * @param {object} [opts.weights]        - Override default scoring weights
 * @returns {{ file: string, score: number, sigs: string[], tokens: number }[]}
 *
 * @example
 *   const { rank, buildSigIndex } = require('sigmap');
 *   const index = buildSigIndex('/path/to/project');
 *   const results = rank('add a new language extractor', index, { topK: 5 });
 */
function rank(query, sigIndex, opts) {
  try {
    const { rank: _rank } = require(path.join(SRC_ROOT, 'retrieval', 'ranker.js'));
    return _rank(query, sigIndex, opts);
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// buildSigIndex(cwd) → Map<string, string[]>
// ---------------------------------------------------------------------------
/**
 * Build a file→signatures index from the generated context file.
 * Requires gen-context.js to have been run first.
 *
 * @param {string} cwd - Project root directory
 * @returns {Map<string, string[]>}
 */
function buildSigIndex(cwd) {
  try {
    const { buildSigIndex: _build } = require(path.join(SRC_ROOT, 'retrieval', 'ranker.js'));
    return _build(cwd);
  } catch (_) {
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// scan(sigs, filePath) → { safe: string[], redacted: boolean }
// ---------------------------------------------------------------------------
/**
 * Scan an array of signature strings for secrets and redact any matches.
 *
 * @param {string[]} sigs      - Signature strings to scan
 * @param {string}   filePath  - Source file path (used in redaction message)
 * @returns {{ safe: string[], redacted: boolean }}
 *
 * @example
 *   const { safe, redacted } = scan(['const KEY = "AKIAEXAMPLE123..."'], 'config.js');
 *   // redacted === true — key was replaced with [REDACTED — AWS Access Key ...]
 */
function scan(sigs, filePath) {
  try {
    const { scan: _scan } = require(path.join(SRC_ROOT, 'security', 'scanner.js'));
    return _scan(sigs, filePath);
  } catch (_) {
    return { safe: Array.isArray(sigs) ? sigs : [], redacted: false };
  }
}

// ---------------------------------------------------------------------------
// score(cwd) → { score, grade, ... }
// ---------------------------------------------------------------------------
/**
 * Compute a composite health score for the project at cwd.
 *
 * @param {string} cwd - Project root directory
 * @returns {{
 *   score: number,
 *   grade: 'A'|'B'|'C'|'D',
 *   strategy: string,
 *   tokenReductionPct: number|null,
 *   daysSinceRegen: number|null,
 *   totalRuns: number,
 *   overBudgetRuns: number,
 * }}
 *
 * @example
 *   const health = score('/path/to/project');
 *   console.log(health.grade); // 'A'
 */
function score(cwd) {
  try {
    const { score: _score } = require(path.join(SRC_ROOT, 'health', 'scorer.js'));
    return _score(cwd);
  } catch (_) {
    return { score: 0, grade: 'D', strategy: 'full', tokenReductionPct: null, daysSinceRegen: null, totalRuns: 0, overBudgetRuns: 0 };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  /** Extract signatures from source text */
  extract,
  /** Rank project files against a query */
  rank,
  /** Build a signature index from the generated context file */
  buildSigIndex,
  /** Scan signatures for secrets (redacts matches) */
  scan,
  /** Compute project health score */
  score,
};
