'use strict';

/**
 * Extract signatures from JavaScript source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];
  const returnHints = buildReturnHints(src);

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Classes
  const classRegex = /^(export\s+(?:default\s+)?)?class\s+(\w+)(?:\s+extends\s+[\w.]+)?\s*\{/gm;
  for (const m of stripped.matchAll(classRegex)) {
    const prefix = m[1] ? m[1].trim() + ' ' : '';
    sigs.push(`${prefix}class ${m[2]}`);
    const block = extractBlock(stripped, m.index + m[0].length);
    for (const meth of extractClassMembers(block, returnHints)) sigs.push(`  ${meth}`);
  }

  // Exported named functions
  for (const m of stripped.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm)) {
    const asyncKw = /export\s+async/.test(m[0]) ? 'async ' : '';
    const retStr = formatReturnHint(returnHints.get(m[1]));
    sigs.push(`export ${asyncKw}function ${m[1]}(${normalizeParams(m[2])})${retStr}`);
  }

  // Exported arrow functions
  for (const m of stripped.matchAll(/^export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/gm)) {
    const asyncKw = m[0].includes('async') ? 'async ' : '';
    const retStr = formatReturnHint(returnHints.get(m[1]));
    sigs.push(`export const ${m[1]} = ${asyncKw}(${normalizeParams(m[2])}) =>${retStr}`);
  }

  // module.exports = { ... }
  const moduleExports = stripped.match(/^module\.exports\s*=\s*\{([^}]+)\}/m);
  if (moduleExports) {
    const names = moduleExports[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length > 0) sigs.push(`module.exports = { ${names.join(', ')} }`);
  }

  // Top-level named functions (non-exported)
  for (const m of stripped.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm)) {
    const asyncKw = m[0].startsWith('async') ? 'async ' : '';
    const retStr = formatReturnHint(returnHints.get(m[1]));
    sigs.push(`${asyncKw}function ${m[1]}(${normalizeParams(m[2])})${retStr}`);
  }

  return sigs.slice(0, 25);
}

function extractBlock(src, startIndex) {
  let depth = 1;
  let i = startIndex;
  const end = Math.min(src.length, startIndex + 4000);
  while (i < end && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(startIndex, i - 1);
}

function extractClassMembers(block, returnHints) {
  const members = [];
  for (const m of block.matchAll(/^\s+(?:static\s+|async\s+|get\s+|set\s+)*(\w+)\s*\(([^)]*)\)\s*\{/gm)) {
    if (/^_/.test(m[1])) continue;
    if (m[1] === 'constructor') { members.push(`constructor(${normalizeParams(m[2])})`); continue; }
    const isAsync = m[0].includes('async ') ? 'async ' : '';
    const isStatic = m[0].includes('static ') ? 'static ' : '';
    const retStr = formatReturnHint(returnHints.get(m[1]));
    members.push(`${isStatic}${isAsync}${m[1]}(${normalizeParams(m[2])})${retStr}`);
  }
  return members.slice(0, 8);
}

function buildReturnHints(src) {
  const hints = new Map();
  for (const m of src.matchAll(/\/\*\*[\s\S]*?@returns?\s+\{([^}]+)\}[\s\S]*?\*\/\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    hints.set(m[2], normalizeType(m[1]));
  }
  for (const m of src.matchAll(/\/\*\*[\s\S]*?@returns?\s+\{([^}]+)\}[\s\S]*?\*\/\s*export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/g)) {
    hints.set(m[2], normalizeType(m[1]));
  }
  for (const m of src.matchAll(/\/\*\*[\s\S]*?@returns?\s+\{([^}]+)\}[\s\S]*?\*\/\s*(?:static\s+|async\s+|get\s+|set\s+)*(\w+)\s*\(/g)) {
    hints.set(m[2], normalizeType(m[1]));
  }
  return hints;
}

function normalizeType(type) {
  if (!type) return '';
  return type.trim().replace(/\s+/g, ' ').slice(0, 25);
}

function formatReturnHint(type) {
  return type ? ` → ${type}` : '';
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

module.exports = { extract };
