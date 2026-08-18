'use strict';

/**
 * Shared tokenizer-grade scanning core (G4 increment 1, #526).
 *
 * Hand-rolled string/comment state + delimiter depth — generalizes the
 * masking in src/graph/call-graph.js (maskJs) and the balanced reader in the
 * R extractor. NOT a parser, NOT tree-sitter: three small, deterministic,
 * zero-dependency passes that let extractors find real declaration
 * boundaries instead of truncating at the first `)`.
 *
 * All transforms are length- and newline-preserving, so character offsets
 * and line anchors computed on the output align 1:1 with the input.
 */

/**
 * Blank comments only — string-aware, so `//` or `/*` INSIDE a string
 * literal survives (the naive regex strip corrupted e.g. `url = "https://x"`).
 * Comment bytes become spaces; newlines and everything else are preserved.
 * @param {string} src
 * @returns {string} same length, comments blanked
 */
function stripComments(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = i + 2; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && d === '*') { let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++; j = Math.min(n, j + 2); blank(i, j); i = j; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; if (c !== '`' && src[j] === '\n') break; j++; }
      i = Math.min(n, j + 1); continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * Blank comments AND string/template contents (quotes included) — the
 * boundary-scanning surface: delimiters found here are always structural.
 * @param {string} src
 * @returns {string} same length, comments + strings blanked
 */
function maskCode(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = i + 2; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && d === '*') { let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++; j = Math.min(n, j + 2); blank(i, j); i = j; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; if (c !== '`' && src[j] === '\n') break; j++; }
      j = Math.min(n, j + 1); blank(i, j); i = j; continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * Index of the delimiter that closes the one open at `openIdx`, matched by
 * depth over MASKED text (strings/comments already blanked, so every
 * delimiter seen is structural). -1 when unbalanced within the cap.
 * @param {string} masked  output of maskCode
 * @param {number} openIdx index of the opening delimiter
 * @param {string} [open='(']
 * @param {string} [close=')']
 * @param {number} [cap=4000] scan ceiling in chars
 * @returns {number}
 */
function readBalanced(masked, openIdx, open = '(', close = ')', cap = 4000) {
  if (masked[openIdx] !== open) return -1;
  let depth = 1;
  const end = Math.min(masked.length, openIdx + cap);
  for (let i = openIdx + 1; i < end; i++) {
    const ch = masked[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

module.exports = { stripComments, maskCode, readBalanced };
