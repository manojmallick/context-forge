'use strict';

/**
 * Extract signatures from Rust source code.
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
  for (const m of stripped.matchAll(/^pub\s+struct\s+(\w+)(?:<[^{]*>)?/gm)) {
    sigs.push(`pub struct ${m[1]}`);
  }

  // Enums
  for (const m of stripped.matchAll(/^pub\s+enum\s+(\w+)(?:<[^{]*>)?/gm)) {
    sigs.push(`pub enum ${m[1]}`);
  }

  // Traits
  for (const m of stripped.matchAll(/^pub\s+trait\s+(\w+)(?:<[^{]*>)?/gm)) {
    sigs.push(`pub trait ${m[1]}`);
  }

  // impl blocks
  for (const m of stripped.matchAll(/^impl(?:<[^>]*>)?\s+(?:[\w:]+\s+for\s+)?(\w+)(?:<[^{]*>)?\s*\{/gm)) {
    sigs.push(`impl ${m[1]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const fn of extractMethods(block)) sigs.push(`  ${fn}`);
  }

  // Top-level pub fns — capture everything after ) up to { or ; for return type
  for (const m of stripped.matchAll(/^pub(?:\s+async)?\s+fn\s+(\w+)(?:<[^(]*>)?\s*\(([^)]*)\)([^{;]*)/gm)) {
    const asyncKw = m[0].includes('async') ? 'async ' : '';
    const retStr = extractReturnType(m[3]);
    sigs.push(`pub ${asyncKw}fn ${m[1]}(${normalizeParams(m[2])})${retStr}`);
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

function extractMethods(block) {
  const methods = [];
  for (const m of block.matchAll(/^\s+pub(?:\s+async)?\s+fn\s+(\w+)(?:<[^(]*>)?\s*\(([^)]*)\)([^{;]*)/gm)) {
    const asyncKw = m[0].includes('async') ? 'async ' : '';
    const retStr = extractReturnType(m[3]);
    methods.push(`pub ${asyncKw}fn ${m[1]}(${normalizeParams(m[2])})${retStr}`);
  }
  return methods.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

function extractReturnType(afterParen) {
  if (!afterParen) return '';
  const m = afterParen.match(/->\s*([^{;]+)/);
  if (!m) return '';
  const rt = m[1].trim().replace(/\s+/g, ' ');
  return ` \u2192 ${rt.length > 30 ? rt.slice(0, 27) + '...' : rt}`;
}

module.exports = { extract };
