'use strict';

/**
 * Extract import dependencies from Python and TypeScript/JavaScript files.
 * Returns compact dependency arrays for the dep-map section of the context output.
 */

const PYTHON_STDLIB = new Set([
  'os', 'sys', 're', 'json', 'time', 'threading', 'logging', 'typing',
  'dataclasses', 'datetime', 'uuid', 'pathlib', 'collections', 'functools',
  'itertools', 'math', 'random', 'string', 'struct', 'io', 'copy', 'pprint',
  'traceback', 'inspect', 'abc', 'enum', 'contextlib', 'weakref', 'gc',
  'socket', 'ssl', 'http', 'urllib', 'email', 'html', 'xml', 'csv', 'sqlite3',
  'argparse', 'subprocess', 'shutil', 'tempfile', 'glob', 'fnmatch', 'stat',
  'hashlib', 'hmac', 'base64', 'binascii', 'codecs', 'unicodedata', 'locale',
  'decimal', 'fractions', 'numbers', 'cmath', 'heapq', 'bisect', 'array',
  'queue', 'asyncio', 'concurrent', 'multiprocessing', 'signal', 'mmap',
  'builtins', 'warnings', 'operator', 'textwrap', 'difflib', 'readline',
]);

/**
 * Extract project-level import dependencies from Python source.
 * @param {string} src
 * @returns {string[]}
 */
function extractPythonDeps(src) {
  const deps = new Set();
  for (const m of src.matchAll(/^from\s+([\w.]+)\s+import/gm)) {
    const mod = m[1];
    const root = mod.replace(/^\.+/, '').split('.')[0];
    // Include relative imports and non-stdlib modules
    if (mod.startsWith('.') || (root && !PYTHON_STDLIB.has(root))) {
      deps.add(root || mod);
    }
  }
  for (const m of src.matchAll(/^import\s+([\w.]+)/gm)) {
    const root = m[1].split('.')[0];
    if (root && !PYTHON_STDLIB.has(root)) deps.add(root);
  }
  return [...deps].filter(Boolean).slice(0, 5);
}

/**
 * Extract relative import dependencies from TypeScript/JavaScript source.
 * @param {string} src
 * @returns {string[]}
 */
function extractTSDeps(src) {
  // Strip single-line comments to avoid matching commented-out imports
  const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const deps = new Set();
  for (const m of stripped.matchAll(/from\s+['"](\.[\/\w.-]+)['"]/g)) {
    // Normalise: '../store/authStore' → store/authStore, './utils' → utils
    const clean = m[1]
      .replace(/^\.\.\//, '')
      .replace(/^\.\//,  '')
      .replace(/\.\w+$/, '');
    if (clean) deps.add(clean);
  }
  return [...deps].slice(0, 5);
}

// R base packages — present in every install, not informative as deps.
const R_BASE_PKGS = new Set([
  'base', 'stats', 'utils', 'graphics', 'grDevices', 'methods', 'datasets',
  'parallel', 'splines', 'stats4', 'tools', 'tcltk', 'grid', 'compiler',
]);

/**
 * Extract project-level import dependencies from R source.
 * Captures `library(pkg)`, `require(pkg)`, `requireNamespace("pkg")`, and
 * `pkg::fn` references, skipping base packages.
 * @param {string} src
 * @returns {string[]}
 */
function extractRDeps(src) {
  const deps = new Set();
  // Strip line comments so commented-out library() calls don't match.
  const stripped = (src || '').replace(/#.*$/gm, '');
  for (const m of stripped.matchAll(/\b(?:library|require)\s*\(\s*["']?([\w.]+)["']?\s*\)/g)) {
    if (m[1] && !R_BASE_PKGS.has(m[1])) deps.add(m[1]);
  }
  for (const m of stripped.matchAll(/\brequireNamespace\s*\(\s*["']([\w.]+)["']/g)) {
    if (m[1] && !R_BASE_PKGS.has(m[1])) deps.add(m[1]);
  }
  for (const m of stripped.matchAll(/\b([A-Za-z][\w.]*)::[A-Za-z]/g)) {
    if (m[1] && !R_BASE_PKGS.has(m[1])) deps.add(m[1]);
  }
  return [...deps].slice(0, 5);
}

/**
 * Extract Lua require() module dependencies.
 * Captures `require "mod"` and `require("mod")`, returning compact module
 * names as they appear in source.
 * @param {string} src
 * @returns {string[]}
 */
function extractLuaDeps(src) {
  const deps = new Set();
  const stripped = stripLuaComments(src || '');
  for (const m of stripped.matchAll(/\brequire\s*(?:\(\s*)?["']([A-Za-z0-9_.\/-]+)["']\s*\)?/g)) {
    if (m[1]) deps.add(m[1]);
  }
  return [...deps].slice(0, 5);
}

function stripLuaComments(src) {
  return String(src || '')
    .replace(/--\[\[[\s\S]*?\]\]/g, '')
    .replace(/--.*$/gm, '');
}

/**
 * Build reverse dependency map from forward map.
 * @param {Map<string, string[]>} forwardMap
 * @returns {Map<string, string[]>}
 */
function buildReverseDepMap(forwardMap) {
  const reverse = new Map();
  if (!forwardMap || typeof forwardMap.entries !== 'function') return reverse;
  for (const [file, deps] of forwardMap.entries()) {
    if (!Array.isArray(deps)) continue;
    for (const dep of deps) {
      if (!reverse.has(dep)) reverse.set(dep, []);
      reverse.get(dep).push(file);
    }
  }
  return reverse;
}

module.exports = { extractPythonDeps, extractTSDeps, extractRDeps, extractLuaDeps, buildReverseDepMap };
