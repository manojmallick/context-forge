'use strict';

/**
 * Extract signatures from Go source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Structs
  for (const m of stripped.matchAll(/^type\s+(\w+)\s+struct\s*\{/gm)) {
    sigs.push(`type ${m[1]} struct`);
  }

  // Interfaces
  for (const m of stripped.matchAll(/^type\s+(\w+)\s+interface\s*\{/gm)) {
    sigs.push(`type ${m[1]} interface`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const method of extractInterfaceMethods(block)) sigs.push(`  ${method}`);
  }

  // Functions and methods
  for (const m of stripped.matchAll(/^func\s+(?:\((\w+)\s+[\w*]+\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*[\w*()\[\],\s]+)?\s*\{/gm)) {
    const receiver = m[1] ? `(${m[1]}) ` : '';
    sigs.push(`func ${receiver}${m[2]}(${normalizeParams(m[3])})`);
  }

  return sigs.slice(0, 25);
}

function extractBlock(src, startIndex) {
  let depth = 1, i = startIndex;
  const end = Math.min(src.length, startIndex + 2000);
  while (i < end && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(startIndex, i - 1);
}

function extractInterfaceMethods(block) {
  const methods = [];
  for (const m of block.matchAll(/^\s+(\w+)\s*\(([^)]*)\)/gm)) {
    methods.push(`${m[1]}(${normalizeParams(m[2])})`);
  }
  return methods.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

module.exports = { extract };
