'use strict';

const { lineAt, withAnchor } = require('./line-anchor');
const { capWithNotice, capMembersWithNotice } = require('../util/truncate');
const { stripComments, maskCode, readBalanced } = require('./scan');

/**
 * Extract signatures from JavaScript source code.
 * Top-level declarations and class members carry a `:start-end` line anchor
 * (see line-anchor.js); kept parallel to `sigs` and applied once at return.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];
  const anchors = [];
  // docHintFor[i] is the doc-comment hint for sigs[i] (top-level functions
  // only), appended after the anchor as `  # <hint>` — same convention as the
  // Python extractor's extractDocHint.
  const docHintFor = [];
  const returnHints = buildReturnHints(src);
  const docHints = buildDocHints(src);

  // stripComments is string-aware (a `//` inside a string literal survives);
  // maskCode additionally blanks string/template contents so every delimiter
  // found on it is structural. Both are length- and newline-preserving, so
  // offsets and line anchors align across all three views (#526).
  const stripped = stripComments(src);
  const masked = maskCode(src);

  // Full params for a declaration whose `(` sits at openIdx: depth-matched
  // close over masked text; TEXT sliced from stripped so string defaults keep
  // their real content. Falls back to first-`)` when unbalanced (cap hit).
  const paramsFrom = (openIdx) => {
    const closeIdx = readBalanced(masked, openIdx);
    if (closeIdx === -1) {
      const naive = stripped.indexOf(')', openIdx);
      return { params: stripped.slice(openIdx + 1, naive === -1 ? openIdx + 1 : naive), closeIdx: naive };
    }
    return { params: stripped.slice(openIdx + 1, closeIdx), closeIdx };
  };

  const blockEndIdx = (bodyStart) => bodyStart + extractBlock(masked, bodyStart).length;
  // End line for a function whose params close just before `matchEnd`.
  const fnEndLine = (matchEnd, startLn) => {
    const brace = masked.indexOf('{', matchEnd);
    return brace !== -1 ? lineAt(stripped, blockEndIdx(brace + 1)) : startLn;
  };

  // Classes
  const classRegex = /^(export\s+(?:default\s+)?)?class\s+(\w+)(?:\s+extends\s+[\w.]+)?\s*\{/gm;
  for (const m of stripped.matchAll(classRegex)) {
    const prefix = m[1] ? m[1].trim() + ' ' : '';
    const bodyStart = m.index + m[0].length;
    const blockEnd = blockEndIdx(bodyStart);
    sigs.push(`${prefix}class ${m[2]}`);
    anchors.push([lineAt(stripped, m.index), lineAt(stripped, blockEnd)]);
    const block = stripped.slice(bodyStart, blockEnd);
    const maskedBlock = masked.slice(bodyStart, blockEnd);
    for (const meth of extractClassMembers(block, maskedBlock, returnHints)) {
      sigs.push(`  ${meth.text}`);
      anchors.push([lineAt(stripped, bodyStart + meth.start), lineAt(stripped, bodyStart + meth.end)]);
    }
  }

  // Exported named functions
  for (const m of stripped.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
    const asyncKw = /export\s+async/.test(m[0]) ? 'async ' : '';
    const retStr = formatReturnHint(returnHints.get(m[1]));
    const startLn = lineAt(stripped, m.index);
    const { params, closeIdx } = paramsFrom(m.index + m[0].length - 1);
    sigs.push(`export ${asyncKw}function ${m[1]}(${normalizeParams(params)})${retStr}`);
    docHintFor[sigs.length - 1] = docHints.get(m[1]);
    anchors.push([startLn, fnEndLine(closeIdx + 1, startLn)]);
  }

  // Exported arrow functions
  for (const m of stripped.matchAll(/^export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/gm)) {
    const { params, closeIdx } = paramsFrom(m.index + m[0].length - 1);
    if (closeIdx === -1 || !/^\s*=>/.test(masked.slice(closeIdx + 1, closeIdx + 40))) continue;
    const asyncKw = m[0].includes('async') ? 'async ' : '';
    const retStr = formatReturnHint(returnHints.get(m[1]));
    const startLn = lineAt(stripped, m.index);
    sigs.push(`export const ${m[1]} = ${asyncKw}(${normalizeParams(params)}) =>${retStr}`);
    docHintFor[sigs.length - 1] = docHints.get(m[1]);
    anchors.push([startLn, fnEndLine(closeIdx + 1, startLn)]);
  }

  // module.exports = { ... }
  const moduleExports = stripped.match(/^module\.exports\s*=\s*\{([^}]+)\}/m);
  if (moduleExports) {
    const names = moduleExports[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length > 0) {
      const startLn = lineAt(stripped, moduleExports.index);
      sigs.push(`module.exports = { ${names.join(', ')} }`);
      anchors.push([startLn, lineAt(stripped, moduleExports.index + moduleExports[0].length)]);
    }
  }

  // Top-level named functions (non-exported)
  for (const m of stripped.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
    const asyncKw = m[0].startsWith('async') ? 'async ' : '';
    const retStr = formatReturnHint(returnHints.get(m[1]));
    const startLn = lineAt(stripped, m.index);
    const { params, closeIdx } = paramsFrom(m.index + m[0].length - 1);
    sigs.push(`${asyncKw}function ${m[1]}(${normalizeParams(params)})${retStr}`);
    docHintFor[sigs.length - 1] = docHints.get(m[1]);
    anchors.push([startLn, fnEndLine(closeIdx + 1, startLn)]);
  }

  const withAnchors = sigs.map((s, i) => {
    const anchored = anchors[i] ? withAnchor(s, anchors[i][0], anchors[i][1]) : s;
    return docHintFor[i] ? `${anchored}  # ${docHintFor[i]}` : anchored;
  });
  return capWithNotice(withAnchors, 25, 'signatures');
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

const _CTRL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'do', 'try', 'catch', 'finally', 'else', 'return']);

// Returns members as { text, start, end } where start/end are char offsets
// WITHIN `block` (end = the method's closing brace), so the caller can resolve
// per-method line anchors that span the method body. `maskedBlock` is the
// same-offset maskCode slice used for balanced-delimiter scanning.
function extractClassMembers(block, maskedBlock, returnHints) {
  const members = [];
  for (const m of maskedBlock.matchAll(/^\s+(?:static\s+|async\s+|get\s+|set\s+)*(\w+)\s*\(/gm)) {
    if (/^_/.test(m[1])) continue;
    if (_CTRL_KEYWORDS.has(m[1])) continue;
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = readBalanced(maskedBlock, openIdx);
    if (closeIdx === -1) continue;
    const braceMatch = maskedBlock.slice(closeIdx + 1, closeIdx + 40).match(/^\s*\{/);
    if (!braceMatch) continue;
    const params = block.slice(openIdx + 1, closeIdx);
    const bodyStart = closeIdx + 1 + braceMatch[0].length; // just past the opening brace
    const end = bodyStart + extractBlock(maskedBlock, bodyStart).length;
    const start = m.index + (m[0].length - m[0].replace(/^\s+/, '').length);
    if (m[1] === 'constructor') { members.push({ text: `constructor(${normalizeParams(params)})`, start, end }); continue; }
    const isAsync = m[0].includes('async ') ? 'async ' : '';
    const isStatic = m[0].includes('static ') ? 'static ' : '';
    const retStr = formatReturnHint(returnHints.get(m[1]));
    members.push({ text: `${isStatic}${isAsync}${m[1]}(${normalizeParams(params)})${retStr}`, start, end });
  }
  return capMembersWithNotice(members, 8, 'methods');
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

// First prose sentence of the JSDoc block immediately preceding a top-level
// function (same three shapes as buildReturnHints). Mirrors the Python
// extractor's extractDocHint: first sentence only, 60-char cap.
function buildDocHints(src) {
  const hints = new Map();
  // Body may not contain `*/` — otherwise a failed adjacency check would let
  // the match expand across a whole function to the next comment block and
  // misattribute the hint.
  const patterns = [
    /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
    /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const hint = firstDocSentence(m[1]);
      if (hint && !hints.has(m[2])) hints.set(m[2], hint);
    }
  }
  return hints;
}

// First non-tag prose line of a JSDoc body → first sentence, 60-char cap.
function firstDocSentence(body) {
  const line = String(body).split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .find((l) => l && !l.startsWith('@'));
  if (!line) return '';
  return line.split(/[.!?]/)[0].trim().slice(0, 60);
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
