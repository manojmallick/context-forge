'use strict';

/**
 * Extract signatures from Dart source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Classes and abstract classes
  for (const m of stripped.matchAll(/^(?:abstract\s+)?class\s+(\w+)(?:<[^{]*>)?(?:\s+extends\s+[\w<>, ]+)?(?:\s+(?:implements|with|on)\s+[\w<>, ]+)?\s*\{/gm)) {
    const abs = m[0].trimStart().startsWith('abstract') ? 'abstract ' : '';
    sigs.push(`${abs}class ${m[1]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const meth of extractMembers(block)) sigs.push(`  ${meth}`);
  }

  // Top-level functions — capture return type (prefix before name) and show as suffix
  for (const m of stripped.matchAll(/^((?:Future<[\w<>?,\s]*>|[\w<>?]+))\s+(\w+)\s*\(([^)]*)\)/gm)) {
    if (m[2].startsWith('_')) continue;
    const retStr = (m[1] && m[1] !== 'void') ? ` \u2192 ${m[1].replace(/\s+/g, '').slice(0, 25)}` : '';
    sigs.push(`${m[2]}(${normalizeParams(m[3])})${retStr}`);
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
  for (const m of block.matchAll(/^\s+(?:@override\s+)?(?:@\w+\s+)*((?:Future<[\w<>?,\s]*>|[\w<>?]+))\s+(\w+)\s*\(([^)]*)\)/gm)) {
    if (m[2].startsWith('_')) continue;
    const retStr = (m[1] && m[1] !== 'void') ? ` \u2192 ${m[1].replace(/\s+/g, '').slice(0, 25)}` : '';
    members.push(`${m[2]}(${normalizeParams(m[3])})${retStr}`);
  }
  return members.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { extract };
