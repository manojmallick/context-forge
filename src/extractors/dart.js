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

  // Top-level functions
  for (const m of stripped.matchAll(/^(?:Future|void|[\w<>?]+)\s+(\w+)\s*\(([^)]*)\)/gm)) {
    if (m[1].startsWith('_')) continue;
    sigs.push(`${m[1]}(${normalizeParams(m[2])})`);
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
  for (const m of block.matchAll(/^\s+(?:@override\s+)?(?:Future|void|[\w<>?]+)\s+(\w+)\s*\(([^)]*)\)/gm)) {
    if (m[1].startsWith('_')) continue;
    members.push(`${m[1]}(${normalizeParams(m[2])})`);
  }
  return members.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { extract };
