'use strict';

/**
 * Extract signatures from Kotlin source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Classes, objects, interfaces
  for (const m of stripped.matchAll(/^(?:public\s+|internal\s+)?(?:data\s+|sealed\s+|abstract\s+|open\s+)?(class|object|interface)\s+(\w+)(?:[^{]*)\{/gm)) {
    sigs.push(`${m[1]} ${m[2]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const meth of extractMembers(block)) sigs.push(`  ${meth}`);
  }

  // Top-level functions — capture `: RetType` after params
  for (const m of stripped.matchAll(/^(?:public\s+|internal\s+)?(?:suspend\s+)?fun\s+(\w+)\s*(?:<[^(]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\n{=]+))?/gm)) {
    const suspend = m[0].includes('suspend') ? 'suspend ' : '';
    const retType = m[3] ? m[3].trim().replace(/\s+/g, ' ') : '';
    const retStr = retType ? ` \u2192 ${retType.slice(0, 25)}` : '';
    sigs.push(`${suspend}fun ${m[1]}(${normalizeParams(m[2])})${retStr}`);
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
  for (const m of block.matchAll(/^\s+(?:public\s+|internal\s+|override\s+)?(?:suspend\s+)?fun\s+(\w+)\s*(?:<[^(]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\n{=]+))?/gm)) {
    if (m[1].startsWith('_')) continue;
    const suspend = m[0].includes('suspend') ? 'suspend ' : '';
    const retType = m[3] ? m[3].trim().replace(/\s+/g, ' ') : '';
    const retStr = retType ? ` \u2192 ${retType.slice(0, 25)}` : '';
    members.push(`${suspend}fun ${m[1]}(${normalizeParams(m[2])})${retStr}`);
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

module.exports = { extract };
