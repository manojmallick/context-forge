'use strict';

const { lineAt, withAnchor } = require('./line-anchor');
const { capWithNotice, capMembersWithNotice } = require('../util/truncate');
const { stripComments, maskCode, readBalanced } = require('./scan');

/**
 * Extract signatures from TypeScript source code.
 * Top-level declarations carry a `:start-end` line anchor (see line-anchor.js);
 * indented members do not.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];
  // docHintFor[i] is the doc-comment hint for sigs[i] (exported top-level
  // functions only), appended after the anchor as `  # <hint>` — same
  // convention as the Python extractor's extractDocHint.
  const docHintFor = [];
  const docHints = buildDocHints(src);
  // anchors[i] is [start, end] for a top-level sig, or null for an indented member.
  // Kept parallel to `sigs` so existing push/mutation logic stays untouched;
  // anchors are applied once at return.
  const anchors = [];

  // stripComments is string-aware (a `//` inside a string literal survives);
  // maskCode additionally blanks string/template contents so every delimiter
  // found on it is structural. Both are length- and newline-preserving, so
  // offsets and line anchors align across all three views (#526).
  const stripped = stripComments(src);
  const masked = maskCode(src);

  // Full params for a declaration whose `(` sits at openIdx (see javascript.js).
  const paramsFrom = (openIdx) => {
    const closeIdx = readBalanced(masked, openIdx);
    if (closeIdx === -1) {
      const naive = stripped.indexOf(')', openIdx);
      return { params: stripped.slice(openIdx + 1, naive === -1 ? openIdx + 1 : naive), closeIdx: naive };
    }
    return { params: stripped.slice(openIdx + 1, closeIdx), closeIdx };
  };

  // Index of the closing brace for a block whose body starts at bodyStart.
  const blockEndIdx = (bodyStart) => bodyStart + extractBlock(masked, bodyStart).length;

  // Exported interfaces
  for (const m of stripped.matchAll(/^export\s+interface\s+(\w+)(?:<[^{]*>)?\s*(?:extends\s+[^{]+)?\{/gm)) {
    const bodyStart = m.index + m[0].length;
    sigs.push(`export interface ${m[1]}`);
    anchors.push([lineAt(stripped, m.index), lineAt(stripped, blockEndIdx(bodyStart))]);
    // Collect members
    const block = extractBlock(stripped, bodyStart);
    const members = extractInterfaceMembers(block);
    for (const mem of members) {
      sigs.push(`  ${mem.text}`);
      anchors.push([lineAt(stripped, bodyStart + mem.start), lineAt(stripped, bodyStart + mem.end)]);
    }
  }

  // Exported type aliases
  for (const m of stripped.matchAll(/^export\s+type\s+(\w+)(?:<[^=]*>)?\s*=/gm)) {
    sigs.push(`export type ${m[1]}`);
    anchors.push([lineAt(stripped, m.index), lineAt(stripped, m.index + m[0].length)]);
  }

  // Exported enums
  for (const m of stripped.matchAll(/^export\s+(?:const\s+)?enum\s+(\w+)\s*\{/gm)) {
    const bodyStart = m.index + m[0].length;
    sigs.push(`export enum ${m[1]}`);
    anchors.push([lineAt(stripped, m.index), lineAt(stripped, blockEndIdx(bodyStart))]);
  }

  // Classes (exported and internal)
  const classRegex = /^(export\s+)?(abstract\s+)?class\s+(\w+)(?:<[^{]*>)?(?:\s+extends\s+[\w<>, .]+)?(?:\s+implements\s+[\w<> ,]+)?\s*\{/gm;
  for (const m of stripped.matchAll(classRegex)) {
    const prefix = m[1] ? 'export ' : '';
    const abs = m[2] ? 'abstract ' : '';
    const bodyStart = m.index + m[0].length;
    const blockEnd = blockEndIdx(bodyStart);
    sigs.push(`${prefix}${abs}class ${m[3]}`);
    anchors.push([lineAt(stripped, m.index), lineAt(stripped, blockEnd)]);
    const block = stripped.slice(bodyStart, blockEnd);
    const maskedBlock = masked.slice(bodyStart, blockEnd);
    const methods = extractClassMembers(block, maskedBlock);
    for (const meth of methods) {
      sigs.push(`  ${meth.text}`);
      anchors.push([lineAt(stripped, bodyStart + meth.start), lineAt(stripped, bodyStart + meth.end)]);
    }
  }

  // Exported top-level functions (not methods)
  for (const m of stripped.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^(]*>)?\s*\(/gm)) {
    const { params: rawParams, closeIdx } = paramsFrom(m.index + m[0].length - 1);
    if (closeIdx === -1) continue;
    // Declaration shape check + return-type capture, mirroring the old
    // `\)(?:\s*:\s*[^{]+)?\s*\{` tail against the text after the real close.
    const tail = masked.slice(closeIdx + 1, closeIdx + 200).match(/^(\s*:\s*[^{]+?)?\s*\{/);
    if (!tail) continue;
    const asyncKw = /export\s+async/.test(m[0]) ? 'async ' : '';
    const params = normalizeParams(rawParams);
    const retRaw = tail[1] ? stripped.slice(closeIdx + 1, closeIdx + 1 + tail[1].length).replace(/^\s*:\s*/, '') : '';
    const retType = retRaw ? retRaw.trim().replace(/\s+/g, ' ').slice(0, 30) : '';
    const retStr = retType ? ` → ${retType}` : '';
    const bodyStart = closeIdx + 1 + tail[0].length;
    sigs.push(`export ${asyncKw}function ${m[1]}(${params})${retStr}`);
    docHintFor[sigs.length - 1] = docHints.get(m[1]);
    anchors.push([lineAt(stripped, m.index), lineAt(stripped, blockEndIdx(bodyStart))]);

    // Hooks: capture compact return object shape for use* functions.
    if (m[1].startsWith('use')) {
      const body = stripped.slice(bodyStart, bodyStart + 800);
      const ret = body.match(/return\s*\{([^}]{1,260})\}/);
      if (ret) {
        const keys = ret[1]
          .split(',')
          .map((s) => s.trim().split(':')[0].split('(')[0].trim())
          .filter(Boolean)
          .slice(0, 8);
        if (keys.length) {
          sigs[sigs.length - 1] += ` → { ${keys.join(', ')} }`;
        }
      }
    }
  }

  // Exported arrow functions / const functions
  for (const m of stripped.matchAll(/^export\s+const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?\(/gm)) {
    const { params: rawParams, closeIdx } = paramsFrom(m.index + m[0].length - 1);
    if (closeIdx === -1) continue;
    // Arrow shape check, mirroring the old `\)\s*(?::\s*[^=>{]+)?\s*=>` tail.
    const tail = masked.slice(closeIdx + 1, closeIdx + 200).match(/^\s*(?::\s*[^=>{]+)?\s*=>/);
    if (!tail) continue;
    const asyncKw = /=\s*async\s+/.test(m[0]) ? 'async ' : '';
    const params = normalizeParams(rawParams);
    sigs.push(`export const ${m[1]} = ${asyncKw}(${params}) =>`);
    docHintFor[sigs.length - 1] = docHints.get(m[1]);
    const matchEnd = closeIdx + 1 + tail[0].length;
    const bodyStart = masked.indexOf('{', matchEnd);
    const endLn = bodyStart !== -1
      ? lineAt(stripped, blockEndIdx(bodyStart + 1))
      : lineAt(stripped, matchEnd);
    anchors.push([lineAt(stripped, m.index), endLn]);

    // Hooks: capture compact return object shape for use* functions.
    if (m[1].startsWith('use')) {
      if (bodyStart !== -1) {
        const body = stripped.slice(bodyStart, bodyStart + 800);
        const ret = body.match(/return\s*\{([^}]{1,260})\}/);
        if (ret) {
          const keys = ret[1]
            .split(',')
            .map((s) => s.trim().split(':')[0].split('(')[0].trim())
            .filter(Boolean)
            .slice(0, 8);
          if (keys.length) {
            sigs[sigs.length - 1] += ` → { ${keys.join(', ')} }`;
          }
        }
      }
    }
  }

  // Zustand stores: export const useXxxStore = create<State>()(...)
  for (const m of stripped.matchAll(/^export\s+const\s+(use\w+Store)\s*=\s*create(?:<[^>]*>)?\s*\(/gm)) {
    const stateType = m[0].match(/create<([\w]+)>/)?.[1] || '';
    const startLn = lineAt(stripped, m.index);
    sigs.push(`export const ${m[1]} = create<${stateType}>(...)`);
    anchors.push([startLn, startLn]);
    const ifaceRe = new RegExp(`interface\\s+${stateType}\\s*\\{([\\s\\S]*?)\\}`);
    const ifm = stripped.match(ifaceRe);
    if (ifm) {
      for (const fm of ifm[1].matchAll(/^\s+(\w+)\s*(?:\([^)]*\))?\s*:/gm)) { sigs.push(`  ${fm[1]}`); anchors.push(null); }
    }
  }

  // API client objects: const xxxApi = { method: async () => {} }
  for (const m of stripped.matchAll(/^(?:export\s+default\s+|const\s+)(\w*[Aa]pi\w*)\s*=\s*\{/gm)) {
    const bodyStart = m.index + m[0].length;
    const block = extractBlock(stripped, bodyStart);
    const methods = [...block.matchAll(/^\s+(\w+)\s*:\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/gm)].map(mm => mm[1]);
    if (methods.length) {
      sigs.push(`${m[1]}: { ${methods.join(', ')} }`);
      anchors.push([lineAt(stripped, m.index), lineAt(stripped, bodyStart + block.length)]);
    }
  }

  const withAnchors = sigs.map((s, i) => {
    const anchored = anchors[i] ? withAnchor(s, anchors[i][0], anchors[i][1]) : s;
    return docHintFor[i] ? `${anchored}  # ${docHintFor[i]}` : anchored;
  });
  return capWithNotice(withAnchors, 35, 'signatures');
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

// Returns members as { text, start, end } where start/end are char offsets
// WITHIN `block`, so the caller can resolve member line anchors.
function extractInterfaceMembers(block) {
  const maskedBlock = maskCode(block);
  const members = [];
  for (const m of block.matchAll(/^\s+(readonly\s+)?(\w+)(\??):\s*([^;]+);/gm)) {
    const readonly = m[1] ? 'readonly ' : '';
    const optional = m[3] ? '?' : '';
    const typeStr = m[4].trim().replace(/\s+/g, ' ').slice(0, 35);
    const start = m.index + (m[0].length - m[0].replace(/^\s+/, '').length);
    members.push({ text: `${readonly}${m[2]}${optional}: ${typeStr}`, start, end: m.index + m[0].length });
  }
  for (const m of maskedBlock.matchAll(/^\s+(\w+)\s*(?:<[^(]*>)?\s*\(/gm)) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = readBalanced(maskedBlock, openIdx);
    if (closeIdx === -1 || !/^\s*:/.test(maskedBlock.slice(closeIdx + 1, closeIdx + 40))) continue;
    const start = m.index + (m[0].length - m[0].replace(/^\s+/, '').length);
    members.push({ text: `${m[1]}(${normalizeParams(block.slice(openIdx + 1, closeIdx))})`, start, end: closeIdx + 1 });
  }
  return capMembersWithNotice(members, 8, 'members');
}

const _CTRL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'do', 'try', 'catch', 'finally', 'else', 'return']);

// Returns members as { text, start, end } where start/end are char offsets
// WITHIN `block` (end = the method's closing brace), so the caller can resolve
// per-method line anchors that span the method body.
function extractClassMembers(block, maskedBlock) {
  const masked = maskedBlock || maskCode(block);
  const members = [];
  // Public methods (skip private/protected/_ prefixed and control-flow keywords)
  const methodRe = /^\s+(?:public\s+|static\s+|async\s+|override\s+)*(\w+)\s*(?:<[^(]*>)?\s*\(/gm;
  for (const m of masked.matchAll(methodRe)) {
    if (_CTRL_KEYWORDS.has(m[1])) continue;
    if (/^(private|protected|_)/.test(m[1])) continue;
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = readBalanced(masked, openIdx);
    if (closeIdx === -1) continue;
    // Declaration tail check + return-type capture, mirroring the old
    // `\)(?:\s*:\s*[^{;]+)?\s*\{` shape against the text after the real close.
    const tail = masked.slice(closeIdx + 1, closeIdx + 200).match(/^(\s*:\s*[^{;]+?)?\s*\{/);
    if (!tail) continue;
    const params = block.slice(openIdx + 1, closeIdx);
    const bodyStart = closeIdx + 1 + tail[0].length; // just past the opening brace
    const end = bodyStart + extractBlock(masked, bodyStart).length;
    const start = m.index + (m[0].length - m[0].replace(/^\s+/, '').length);
    if (m[1] === 'constructor') { members.push({ text: `constructor(${normalizeParams(params)})`, start, end }); continue; }
    const isAsync = m[0].includes('async ') ? 'async ' : '';
    const isStatic = m[0].includes('static ') ? 'static ' : '';
    const retRaw = tail[1] ? block.slice(closeIdx + 1, closeIdx + 1 + tail[1].length).replace(/^\s*:\s*/, '') : '';
    const retType = retRaw ? retRaw.trim().replace(/\s+/g, ' ').slice(0, 20) : '';
    const retStr = retType ? ` → ${retType}` : '';
    members.push({ text: `${isStatic}${isAsync}${m[1]}(${normalizeParams(params)})${retStr}`, start, end });
  }
  return capMembersWithNotice(members, 8, 'methods');
}

function normalizeParams(params) {
  if (!params) return '';
  const compact = params.trim().replace(/\s+/g, ' ');
  // Strip `: type` annotations at top level only — nested delimiters in types
  // (e.g. `cb: (x: number) => void`, `m: Map<string, X>`) are consumed with
  // their annotation instead of truncating at the first `)` or `,` (#526).
  let out = '';
  let depth = 0;
  let inType = false;
  let quote = null;
  for (let i = 0; i < compact.length; i++) {
    const ch = compact[i];
    if (quote) {
      if (ch === '\\') { if (!inType) out += ch + (compact[i + 1] || ''); i++; continue; }
      if (ch === quote) quote = null;
      if (!inType) out += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; if (!inType) out += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') depth++;
    else if (ch === ')' || ch === ']' || ch === '}' || (ch === '>' && compact[i - 1] !== '=')) depth--;
    if (inType) {
      if (depth <= 0 && ch === ',') { inType = false; out += ch; }
      else if (depth <= 0 && ch === '=' && compact[i + 1] !== '>') { inType = false; out += ' ='; }
      continue;
    }
    if (depth === 0 && ch === ':') { inType = true; continue; }
    out += ch;
  }
  return out.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

// First prose sentence of the JSDoc block immediately preceding an exported
// top-level function (function or arrow-const form). Mirrors the Python
// extractor's extractDocHint: first sentence only, 60-char cap.
function buildDocHints(src) {
  const hints = new Map();
  // Body may not contain `*/` — otherwise a failed adjacency check would let
  // the match expand across a whole function to the next comment block and
  // misattribute the hint.
  const patterns = [
    /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*export\s+(?:async\s+)?function\s+(\w+)\s*[<(]/g,
    /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*export\s+const\s+(\w+)\s*[:=]/g,
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

module.exports = { extract };
