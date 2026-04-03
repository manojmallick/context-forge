'use strict';

/**
 * Extract signatures from PHP source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/#.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Classes and interfaces
  const typeRe = /^(?:abstract\s+)?(?:class|interface|trait)\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w, ]+)?\s*\{/gm;
  for (const m of stripped.matchAll(typeRe)) {
    const kind = m[0].trimStart().startsWith('interface') ? 'interface' :
      m[0].trimStart().startsWith('trait') ? 'trait' : 'class';
    sigs.push(`${kind} ${m[1]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const meth of extractMembers(block)) sigs.push(`  ${meth}`);
  }

  // Top-level functions
  for (const m of stripped.matchAll(/^function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^\n{]+))?/gm)) {
    const ret = normalizeType(m[3]);
    const retStr = ret ? ` → ${ret}` : '';
    sigs.push(`function ${m[1]}(${normalizeParams(m[2])})${retStr}`);
  }

  return sigs.slice(0, 25);
}

function extractBlock(src, startIndex) {
  let depth = 1, i = startIndex;
  const end = Math.min(src.length, startIndex + 4000);
  while (i < end && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(startIndex, i - 1);
}

function extractMembers(block) {
  const members = [];
  const methodRe = /^\s+(?:public|protected)\s+(?:static\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^\n{]+))?/gm;
  for (const m of block.matchAll(methodRe)) {
    if (m[1].startsWith('_')) continue;
    const isStatic = m[0].includes('static ') ? 'static ' : '';
    const ret = normalizeType(m[3]);
    const retStr = ret ? ` → ${ret}` : '';
    members.push(`${isStatic}function ${m[1]}(${normalizeParams(m[2])})${retStr}`);
  }
  return members.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

function normalizeType(type) {
  if (!type) return '';
  return type.trim().replace(/[;\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 25);
}

module.exports = { extract };
