'use strict';

/**
 * Extract signatures from Swift source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Classes, structs, protocols, enums
  const typeRe = /^(?:public\s+|internal\s+|open\s+)?(?:final\s+)?(class|struct|protocol|enum|actor)\s+(\w+)(?:<[^{]*>)?(?:\s*:\s*[\w, <>.]+)?\s*\{/gm;
  for (const m of stripped.matchAll(typeRe)) {
    sigs.push(`${m[1]} ${m[2]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const fn of extractMembers(block)) sigs.push(`  ${fn}`);
  }

  // Top-level public functions — capture everything after ) to end of line for arrow type
  for (const m of stripped.matchAll(/^(?:public\s+|internal\s+)?(?:static\s+)?(?:async\s+)?func\s+(\w+)(?:<[^(]*>)?\s*\(([^)]*)\)([^{\n]*)/gm)) {
    const asyncKw = m[0].includes('async') ? 'async ' : '';
    const retStr = extractArrowType(m[3]);
    sigs.push(`${asyncKw}func ${m[1]}(${normalizeParams(m[2])})${retStr}`);
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
  for (const m of block.matchAll(/^\s+(?:public\s+|internal\s+|open\s+)?(?:static\s+|class\s+)?(?:mutating\s+)?(?:async\s+)?func\s+(\w+)(?:<[^(]*>)?\s*\(([^)]*)\)([^{\n]*)/gm)) {
    if (m[1].startsWith('_')) continue;
    const asyncKw = m[0].includes('async') ? 'async ' : '';
    const retStr = extractArrowType(m[3]);
    members.push(`${asyncKw}func ${m[1]}(${normalizeParams(m[2])})${retStr}`);
  }
  return members.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim()
    .split(',')
    .map((p) => p.trim().split(':')[0].trim())
    .filter(Boolean)
    .join(', ');
}

function extractArrowType(str) {
  if (!str) return '';
  const m = str.match(/->\s*([^\n{]+)/);
  if (!m) return '';
  const rt = m[1].trim().replace(/\s+/g, ' ');
  return ` \u2192 ${rt.length > 25 ? rt.slice(0, 22) + '...' : rt}`;
}

module.exports = { extract };
