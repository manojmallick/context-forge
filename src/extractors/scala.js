'use strict';

/**
 * Extract signatures from Scala source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Classes, traits, objects
  const typeRe = /^(?:case\s+)?(?:class|trait|object)\s+(\w+)(?:\[[\w, ]+\])?(?:[^{]*)\{/gm;
  for (const m of stripped.matchAll(typeRe)) {
    const kind = m[0].trimStart().startsWith('case class') ? 'case class' :
      m[0].trimStart().startsWith('trait') ? 'trait' :
      m[0].trimStart().startsWith('object') ? 'object' : 'class';
    sigs.push(`${kind} ${m[1]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const fn of extractMembers(block)) sigs.push(`  ${fn}`);
  }

  // Top-level defs
  for (const m of stripped.matchAll(/^def\s+(\w+)(?:\[[\w, ]+\])?\s*(?:\(([^)]*)\))?(?:\s*:\s*([^=\n{]+))?/gm)) {
    if (m[1].startsWith('_')) continue;
    const params = m[2] ? `(${normalizeParams(m[2])})` : '';
    const ret = normalizeType(m[3]);
    const retStr = ret ? ` → ${ret}` : '';
    sigs.push(`def ${m[1]}${params}${retStr}`);
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
  for (const m of block.matchAll(/^\s+def\s+(\w+)(?:\[[\w, ]+\])?\s*(?:\(([^)]*)\))?(?:\s*:\s*([^=\n{]+))?/gm)) {
    if (m[1].startsWith('_')) continue;
    const params = m[2] ? `(${normalizeParams(m[2])})` : '';
    const ret = normalizeType(m[3]);
    const retStr = ret ? ` → ${ret}` : '';
    members.push(`def ${m[1]}${params}${retStr}`);
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

function normalizeType(type) {
  if (!type) return '';
  return type.trim().replace(/\s+/g, ' ').slice(0, 25);
}

module.exports = { extract };
