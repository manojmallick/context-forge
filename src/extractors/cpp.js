'use strict';

/**
 * Extract signatures from C/C++ source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Classes and structs
  const classRe = /^(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|protected|private)\s+[\w:]+)?\s*\{/gm;
  for (const m of stripped.matchAll(classRe)) {
    const kind = m[0].trimStart().startsWith('class') ? 'class' : 'struct';
    sigs.push(`${kind} ${m[1]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const meth of extractMembers(block)) sigs.push(`  ${meth}`);
  }

  // Top-level function declarations/definitions (not inside a class)
  for (const m of stripped.matchAll(/^(?!class|struct|if|for|while|switch)[\w:*&<> ]+\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?\{/gm)) {
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
  const methodRe = /^\s+(?:virtual\s+|static\s+|inline\s+)?(?!private:|protected:|public:)[\w:*&<> ]+\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?(?:=\s*0\s*)?;/gm;
  for (const m of block.matchAll(methodRe)) {
    if (m[1].startsWith('_')) continue;
    members.push(`${m[1]}(${normalizeParams(m[2])})`);
  }
  return members.slice(0, 8);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

module.exports = { extract };
