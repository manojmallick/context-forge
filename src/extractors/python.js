'use strict';

/**
 * Extract signatures from Python source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  // Strip comments and docstrings (simple approach)
  const stripped = src
    .replace(/#.*$/gm, '')
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '');

  // Classes
  for (const m of stripped.matchAll(/^class\s+(\w+)(?:\s*\(([^)]*)\))?\s*:/gm)) {
    const base = m[2] ? `(${m[2].trim()})` : '';
    sigs.push(`class ${m[1]}${base}`);
    // Get class body methods
    const bodyStart = m.index + m[0].length;
    const methods = extractClassMethods(stripped, bodyStart);
    for (const meth of methods) sigs.push(`  ${meth}`);
  }

  // Top-level functions
  for (const m of stripped.matchAll(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm)) {
    if (/^_/.test(m[1])) continue; // skip private
    const asyncKw = m[0].trimStart().startsWith('async') ? 'async ' : '';
    const params = normalizeParams(m[2]);
    sigs.push(`${asyncKw}def ${m[1]}(${params})`);
  }

  return sigs.slice(0, 25);
}

function extractClassMethods(src, startIndex) {
  const methods = [];
  // Extract indented block
  const lines = src.slice(startIndex).split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    // End of class body: line with no leading indent that is not blank
    const indent = line.match(/^(\s+)/);
    if (!indent) break;
    const m = line.match(/^\s+(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (m) {
      if (m[1].startsWith('__') && m[1] !== '__init__') continue;
      if (m[1].startsWith('_') && !m[1].startsWith('__')) continue;
      const asyncKw = line.trimStart().startsWith('async') ? 'async ' : '';
      const params = normalizeParams(m[2]).replace(/^self,?\s*/, '');
      methods.push(`${asyncKw}def ${m[1]}(${params})`);
    }
  }
  return methods.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim()
    .split(',')
    .map((p) => p.trim().split(':')[0].split('=')[0].trim())
    .filter(Boolean)
    .join(', ');
}

module.exports = { extract };
