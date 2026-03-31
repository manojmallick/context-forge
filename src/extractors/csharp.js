'use strict';

/**
 * Extract signatures from C# source code.
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
  const typeRe = /^\s*(?:public\s+|internal\s+|protected\s+)?(?:abstract\s+|sealed\s+|static\s+)?(class|interface|enum|record|struct)\s+(\w+)(?:<[^{]*>)?(?:\s*:\s*[\w<>, .]+)?\s*\{/gm;
  for (const m of stripped.matchAll(typeRe)) {
    sigs.push(`${m[1]} ${m[2]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const meth of extractMembers(block)) sigs.push(`  ${meth}`);
  }

  return sigs.slice(0, 25);
}

function extractBlock(src, startIndex) {
  let depth = 1, i = startIndex;
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
  const methodRe = /^\s+(?:public|internal|protected)\s+(?:static\s+|virtual\s+|override\s+|async\s+)*(?:[\w<>\[\]?]+\s+)+(\w+)\s*\(([^)]*)\)/gm;
  for (const m of block.matchAll(methodRe)) {
    const sig = m[0].trim().split('{')[0].trim();
    members.push(sig);
  }
  return members.slice(0, 8);
}

module.exports = { extract };
