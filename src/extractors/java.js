'use strict';

/**
 * Extract signatures from Java source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Classes and interfaces
  const typeRegex = /^(?:public\s+|protected\s+)?(?:abstract\s+|final\s+)?(class|interface|enum)\s+(\w+)(?:\s+extends\s+[\w<>, .]+)?(?:\s+implements\s+[\w<>, .]+)?\s*\{/gm;
  for (const m of stripped.matchAll(typeRegex)) {
    sigs.push(`${m[1]} ${m[2]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const meth of extractMembers(block)) sigs.push(`  ${meth}`);
  }

  return sigs.slice(0, 25);
}

function extractBlock(src, startIndex) {
  let depth = 1;
  let i = startIndex;
  const end = Math.min(src.length, startIndex + 5000);
  while (i < end && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(startIndex, i - 1);
}

function extractMembers(block) {
  const members = [];
  const methodRe = /^\s+(?:public|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s+)?([\w<>\[\], ?.]+)\s+(\w+)\s*\(([^)]*)\)/gm;
  for (const m of block.matchAll(methodRe)) {
    const ret = normalizeType(m[1]);
    const retStr = ret ? ` → ${ret}` : '';
    members.push(`${m[2]}(${normalizeParams(m[3])})${retStr}`);
  }
  return members.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

function normalizeType(type) {
  if (!type) return '';
  return type.trim().replace(/\s+/g, ' ').slice(0, 30);
}

module.exports = { extract };
