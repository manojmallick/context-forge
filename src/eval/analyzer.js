'use strict';

/**
 * SigMap file analyzer — per-file diagnostic statistics.
 * Zero npm dependencies.
 *
 * Exports:
 *   analyzeFiles(files, cwd, opts) → stats[]
 *   formatAnalysisTable(stats)    → markdown table string
 *   formatAnalysisJSON(stats)     → plain object suitable for JSON.stringify
 */

const fs   = require('fs');
const path = require('path');

// Extension → extractor name (mirrors EXT_MAP in gen-context.js)
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

function isDockerfile(name) {
  return name === 'Dockerfile' || name.startsWith('Dockerfile.');
}

function getExtractorName(filePath) {
  const base = path.basename(filePath);
  const ext  = path.extname(base).toLowerCase();
  if (EXT_MAP[ext]) return EXT_MAP[ext];
  if (isDockerfile(base)) return 'dockerfile';
  return null;
}

/** Rough token estimate: chars / 4 */
function tokenCount(sigs) {
  return Math.ceil(sigs.reduce((sum, s) => sum + s.length, 0) / 4);
}

/**
 * Check whether a test file exists for this source file by looking for
 * *.test.* / *.spec.* patterns in the test/ directory tree.
 */
function hasCoverage(filePath, cwd) {
  const rel   = path.relative(cwd, filePath);
  const base  = path.basename(rel, path.extname(rel));  // e.g. "python"
  const testDirs = ['test', 'tests', '__tests__', 'spec'];
  for (const d of testDirs) {
    const abs = path.join(cwd, d);
    if (!fs.existsSync(abs)) continue;
    // Walk only one depth for speed
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (e.name.includes(base)) return true;
    }
  }
  return false;
}

/**
 * Load an extractor module from src/extractors/ relative to cwd.
 * Falls back to requiring from the module directory itself.
 */
function loadExtractor(name, cwd) {
  // Try repo-local src/extractors first (for projects that embed sigmap)
  const local = path.join(cwd, 'src', 'extractors', `${name}.js`);
  if (fs.existsSync(local)) {
    try { return require(local); } catch (_) {}
  }
  // Then standard node resolution from the current package
  try { return require(path.join(__dirname, '..', 'extractors', `${name}.js`)); } catch (_) {}
  return null;
}

/**
 * Analyze a list of absolute file paths.
 *
 * @param {string[]} files   - absolute paths to analyze
 * @param {string}   cwd     - project root
 * @param {object}  [opts]
 * @param {boolean} [opts.slow=false]  - if true, measure extraction time per file
 * @param {number}  [opts.slowMs=50]   - threshold (ms) before a file is "slow"
 * @param {number}  [opts.maxSigs=25]  - max sigs per file
 * @returns {object[]} array of per-file stat objects
 */
function analyzeFiles(files, cwd, opts) {
  const slow    = (opts && opts.slow)   || false;
  const slowMs  = (opts && opts.slowMs) || 50;
  const maxSigs = (opts && opts.maxSigs) || 25;

  const stats = [];
  const extractorCache = {};

  for (const filePath of files) {
    const extractorName = getExtractorName(filePath);
    if (!extractorName) continue;

    // Load extractor (cached)
    if (!extractorCache[extractorName]) {
      extractorCache[extractorName] = loadExtractor(extractorName, cwd);
    }
    const extractor = extractorCache[extractorName];
    if (!extractor || typeof extractor.extract !== 'function') continue;

    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { continue; }

    let sigs;
    let elapsedMs = 0;

    if (slow) {
      const t0 = Date.now();
      try { sigs = extractor.extract(content); } catch (_) { sigs = []; }
      elapsedMs = Date.now() - t0;
    } else {
      try { sigs = extractor.extract(content); } catch (_) { sigs = []; }
    }

    sigs = (Array.isArray(sigs) ? sigs : []).slice(0, maxSigs);

    const rel      = path.relative(cwd, filePath);
    const tokens   = tokenCount(sigs);
    const covered  = hasCoverage(filePath, cwd);
    const isSlow   = slow && elapsedMs > slowMs;

    stats.push({
      file:          rel,
      extractor:     extractorName,
      sigs:          sigs.length,
      tokens,
      covered,
      elapsedMs:     slow ? elapsedMs : undefined,
      slow:          slow ? isSlow : undefined,
    });
  }

  return stats;
}

/**
 * Format stats as a markdown table.
 *
 * @param {object[]} stats - output of analyzeFiles()
 * @param {boolean}  showSlow - whether to include the Elapsed column
 * @returns {string}
 */
function formatAnalysisTable(stats, showSlow) {
  if (!stats || stats.length === 0) return '_(no files analyzed)_\n';

  // Column widths
  const maxFile = Math.max(4, ...stats.map((s) => s.file.length));

  const header = showSlow
    ? `| ${'File'.padEnd(maxFile)} | Sigs | Tokens | Extractor   | Coverage   | Elapsed  |`
    : `| ${'File'.padEnd(maxFile)} | Sigs | Tokens | Extractor   | Coverage   |`;

  const sep = showSlow
    ? `|${'-'.repeat(maxFile + 2)}|------|--------|-------------|------------|----------|`
    : `|${'-'.repeat(maxFile + 2)}|------|--------|-------------|------------|`;

  const rows = stats.map((s) => {
    const cov  = s.covered ? '✓ tested  ' : '✗ untested';
    const file = s.file.padEnd(maxFile);
    const ext  = (s.extractor || '').padEnd(11);
    const base = `| ${file} | ${String(s.sigs).padStart(4)} | ${String(s.tokens).padStart(6)} | ${ext} | ${cov} |`;
    if (showSlow) {
      const ms = s.elapsedMs !== undefined ? `${s.elapsedMs}ms` : '';
      const flag = s.slow ? ' ⚠️' : '';
      return `${base} ${ms.padStart(6)}${flag} |`;
    }
    return base;
  });

  const totalSigs   = stats.reduce((n, s) => n + s.sigs,   0);
  const totalTokens = stats.reduce((n, s) => n + s.tokens, 0);
  const slotFile    = ''.padEnd(maxFile);
  const baseFoot    = `| ${slotFile} | ${String(totalSigs).padStart(4)} | ${String(totalTokens).padStart(6)} | **Total**   |            |`;
  const footer = showSlow ? `${baseFoot} ${' '.padStart(8)} |` : baseFoot;

  return [header, sep, ...rows, sep, footer].join('\n') + '\n';
}

/**
 * Format stats as a plain-object suitable for JSON.stringify.
 *
 * @param {object[]} stats
 * @returns {object}
 */
function formatAnalysisJSON(stats) {
  const totalSigs   = stats.reduce((n, s) => n + s.sigs,   0);
  const totalTokens = stats.reduce((n, s) => n + s.tokens, 0);
  const slowFiles   = stats.filter((s) => s.slow);

  return {
    files:       stats,
    totalSigs,
    totalTokens,
    slowFiles:   slowFiles.map((s) => ({ file: s.file, elapsedMs: s.elapsedMs })),
    fileCount:   stats.length,
  };
}

module.exports = { analyzeFiles, formatAnalysisTable, formatAnalysisJSON };
