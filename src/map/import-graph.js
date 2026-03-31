'use strict';

/**
 * Import graph analyzer.
 * Extracts relative import relationships from JS/TS/Python files
 * and detects circular dependencies.
 *
 * @param {string[]} files — absolute file paths to analyze
 * @param {string}   cwd   — project root for relative path display
 * @returns {string} formatted section content (empty string if nothing found)
 */

const fs = require('fs');
const path = require('path');

const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PY_EXTS = new Set(['.py', '.pyw']);

// ---------------------------------------------------------------------------
// Import extraction per language
// ---------------------------------------------------------------------------
function extractImports(filePath, content, fileSet) {
  const ext = path.extname(filePath).toLowerCase();
  const dir = path.dirname(filePath);
  const found = [];

  if (JS_EXTS.has(ext)) {
    // ES: import ... from './foo'  or  import './side-effect'
    const re1 = /(?:^|[\r\n])\s*import\s+(?:[^'";\r\n]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = re1.exec(content)) !== null) {
      const resolved = resolveJsPath(dir, m[1], fileSet);
      if (resolved) found.push(resolved);
    }
    // CommonJS: require('./foo')
    const re2 = /\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    while ((m = re2.exec(content)) !== null) {
      const resolved = resolveJsPath(dir, m[1], fileSet);
      if (resolved) found.push(resolved);
    }
  }

  if (PY_EXTS.has(ext)) {
    // from .module import ...  /  from ..pkg import ...
    const re = /^[ \t]*from\s+(\.+[\w.]*)\s+import/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
      const dotCount = (m[1].match(/^\.+/) || [''])[0].length;
      const modPart = m[1].slice(dotCount).replace(/\./g, '/');
      let base = dir;
      for (let i = 1; i < dotCount; i++) base = path.dirname(base);
      const candidate = modPart ? path.join(base, modPart + '.py') : null;
      if (candidate && fileSet.has(candidate)) found.push(candidate);
    }
  }

  return [...new Set(found)];
}

function resolveJsPath(dir, importStr, fileSet) {
  const base = path.resolve(dir, importStr);
  const candidates = [
    base,
    base + '.ts', base + '.tsx',
    base + '.js', base + '.jsx',
    base + '/index.ts', base + '/index.js',
  ];
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cycle detection (DFS with path tracking)
// ---------------------------------------------------------------------------
function detectCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const onStack = new Set();
  const stackArr = [];

  function dfs(node) {
    if (onStack.has(node)) {
      const start = stackArr.indexOf(node);
      if (start !== -1) cycles.push([...stackArr.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;

    onStack.add(node);
    stackArr.push(node);
    for (const dep of (graph.get(node) || [])) dfs(dep);
    stackArr.pop();
    onStack.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node);
  }
  return cycles;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function analyze(files, cwd) {
  const fileSet = new Set(files.map((f) => path.resolve(f)));
  const graph = new Map();

  for (const filePath of files) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { continue; }
    const deps = extractImports(path.resolve(filePath), content, fileSet);
    if (deps.length > 0) graph.set(path.resolve(filePath), deps);
  }

  if (graph.size === 0) return '';

  const cycles = detectCycles(graph);
  const cycleNodeSet = new Set(cycles.flatMap((c) => c));

  const lines = [];
  const sorted = [...graph.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [fp, deps] of sorted) {
    const rel = path.relative(cwd, fp).replace(/\\/g, '/');
    const depList = deps.map((d) => {
      const drel = path.relative(cwd, d).replace(/\\/g, '/');
      return cycleNodeSet.has(d) ? `${drel} ⚠` : drel;
    });
    lines.push(`${rel} → ${depList.join(', ')}`);
  }

  if (cycles.length > 0) {
    lines.push('');
    lines.push('Circular dependencies detected:');
    for (const cycle of cycles) {
      const relPath = cycle.map((n) => path.relative(cwd, n).replace(/\\/g, '/')).join(' → ');
      lines.push(`  ⚠ ${relPath}`);
    }
  }

  return lines.join('\n');
}

module.exports = { analyze };
