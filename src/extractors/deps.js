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

module.exports = { extractPythonDeps, extractTSDeps, buildReverseDepMap };
