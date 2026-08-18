'use strict';

/**
 * Arity-checked verification (D1, #529).
 *
 * With JS/TS params exact (v8.27 balanced scanner) and Python params from the
 * AST, the signature index carries real parameter lists — so verification can
 * check not just "does this function exist" but "is this call's argument
 * count plausible". Deliberately conservative: only uniquely-resolved,
 * non-variadic, top-level functions from exact-param languages are checked,
 * and dotted method calls are never flagged.
 */

const path = require('path');
const { maskCode, readBalanced } = require('../extractors/scan');

// Files whose signature params are exact (JS/TS via scan.js, Python via AST).
const EXACT_PARAM_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py']);

const CTRL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await',
  'do', 'else', 'try', 'finally', 'new', 'in', 'of', 'not', 'and', 'or',
  'print', 'super', 'this',
]);

// Top-level callable sig shapes (indented member sigs are excluded on purpose
// — method calls are dotted in answers and dotted calls are skipped anyway).
const CALLABLE_RES = [
  /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
  /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/,
  /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/,
];

/** Strip the `  :start-end` anchor and `  # hint` tail from a sig line. */
function cleanSig(sig) {
  return String(sig).replace(/\s{2}#\s.*$/, '').replace(/\s*:\d+(?:-\d+)?\s*$/, '');
}

/**
 * Parse a parameter-list string into an arity range.
 * Depth- and quote-aware top-level comma split; `=` defaults and trailing `?`
 * lower `min`; `...rest` / `*args` / `**kwargs` mark the signature variadic;
 * destructuring patterns count as one parameter.
 * @param {string} paramText text between the signature's parens
 * @returns {{ min: number, max: number, variadic: boolean }}
 */
function parseParams(paramText) {
  const text = String(paramText || '').trim();
  if (!text) return { min: 0, max: 0, variadic: false };
  const masked = maskCode(text);
  const pieces = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) { pieces.push({ raw: text.slice(start, i), masked: masked.slice(start, i) }); start = i + 1; }
  }
  pieces.push({ raw: text.slice(start), masked: masked.slice(start) });

  let min = 0;
  let max = 0;
  let variadic = false;
  for (const piece of pieces) {
    const p = piece.raw.trim();
    if (!p) continue;
    if (/^(\.\.\.|\*)/.test(p)) { variadic = true; continue; }
    max++;
    // Optional: a top-level `=` default (scan the masked piece at depth 0) or
    // a `?`-suffixed name (TS optional, survives type stripping as `x?`).
    let d = 0;
    let optional = /^[A-Za-z_$][\w$]*\s*\?$/.test(p);
    const pm = piece.masked;
    for (let i = 0; i < pm.length && !optional; i++) {
      const ch = pm[i];
      if (ch === '(' || ch === '[' || ch === '{') d++;
      else if (ch === ')' || ch === ']' || ch === '}') d--;
      else if (ch === '=' && d === 0 && pm[i + 1] !== '>' && pm[i - 1] !== '=' && pm[i - 1] !== '!' && pm[i - 1] !== '<' && pm[i - 1] !== '>') optional = true;
    }
    if (!optional) min++;
  }
  return { min, max, variadic };
}

/**
 * Build a per-name arity index from a SigMap signature index.
 * Only top-level callables from exact-param languages are included; a name
 * whose signatures disagree across files is marked ambiguous (never checked).
 * @param {Map<string, string[]>} sigIndex Map<file, sigs[]>
 * @returns {Map<string, { min, max, variadic, file, sig } | 'ambiguous'>}
 */
function buildArityIndex(sigIndex) {
  const index = new Map();
  if (!sigIndex || !(sigIndex instanceof Map)) return index;
  for (const [file, sigs] of sigIndex.entries()) {
    if (!EXACT_PARAM_EXTS.has(path.extname(file))) continue;
    for (const sig of sigs || []) {
      const cleaned = cleanSig(sig);
      let name = null;
      for (const re of CALLABLE_RES) {
        const m = cleaned.match(re);
        if (m) { name = m[1]; break; }
      }
      if (!name) continue;
      const openIdx = cleaned.indexOf('(', cleaned.indexOf(name));
      if (openIdx === -1) continue;
      const masked = maskCode(cleaned);
      const closeIdx = readBalanced(masked, openIdx);
      if (closeIdx === -1) continue;
      const arity = parseParams(cleaned.slice(openIdx + 1, closeIdx));
      const entry = { ...arity, file, sig: cleaned.trim() };
      const existing = index.get(name);
      if (existing === undefined) index.set(name, entry);
      else if (existing === 'ambiguous') continue;
      else if (existing.min !== entry.min || existing.max !== entry.max || existing.variadic !== entry.variadic) {
        index.set(name, 'ambiguous');
      }
    }
  }
  return index;
}

/**
 * Extract call sites with argument counts from answer code.
 * Dotted/property calls and keyword-preceded definitions are skipped for
 * precision; nested calls and comma-containing strings count correctly
 * because the scan is over masked text.
 * @param {string} code
 * @returns {{ name: string, args: number, line: number }[]}
 */
function extractCallArgCounts(code) {
  const src = String(code || '');
  const masked = maskCode(src);
  const calls = [];
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const name = m[1];
    if (CTRL_KEYWORDS.has(name)) continue;
    let k = m.index - 1;
    while (k >= 0 && (masked[k] === ' ' || masked[k] === '\t')) k--;
    if (k >= 0 && (masked[k] === '.' || masked[k] === '$')) continue;
    const before = masked.slice(Math.max(0, m.index - 12), m.index);
    if (/(?:function|def|class|new)\s+$/.test(before)) continue;
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = readBalanced(masked, openIdx);
    if (closeIdx === -1) continue;
    const inner = masked.slice(openIdx + 1, closeIdx);
    let args = 0;
    // Emptiness is judged on the ORIGINAL text — masking blanks string
    // contents, so `f("a,b")` would otherwise look like zero arguments.
    if (src.slice(openIdx + 1, closeIdx).trim()) {
      args = 1;
      let depth = 0;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === ',' && depth === 0) args++;
      }
    }
    calls.push({ name, args, line: src.slice(0, m.index).split('\n').length });
  }
  return calls;
}

/**
 * Check one call against the arity index.
 * @returns {null | { min, max, variadic, file, sig }} the offended entry, or null when fine/unknowable
 */
function checkArity(name, argCount, arityIndex) {
  const entry = arityIndex.get(name);
  if (!entry || entry === 'ambiguous') return null;
  if (entry.variadic) return argCount < entry.min ? entry : null;
  if (argCount < entry.min || argCount > entry.max) return entry;
  return null;
}

module.exports = { parseParams, buildArityIndex, extractCallArgCounts, checkArity, cleanSig, EXACT_PARAM_EXTS };
