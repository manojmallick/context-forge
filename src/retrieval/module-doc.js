'use strict';

/**
 * Module-level documentation extractor (retrieval only).
 *
 * Signatures describe a file's SHAPE — names, params, return types. A module's
 * leading comment describes its PURPOSE, in prose, using the words a person
 * would actually search with. That prose is the bridge between a behavioural
 * query ("what fraction of the repo made it into the output") and the code
 * that implements it (`coverageScore(cwd, fileEntries, config)`), which shares
 * not one token with the query.
 *
 * This text is added to the RETRIEVAL INDEX ONLY — never to the generated
 * context file. The prompt artifact is token-budgeted and prose is expensive
 * there; the index is not injected into any prompt, so it can afford the words
 * that make a file findable.
 *
 * Zero-dependency, pure, bundle-safe.
 */

// Enough to characterise a module without letting one verbose header dominate
// BM25 length normalisation for the whole corpus.
const MAX_CHARS = 400;
const MAX_SCAN_LINES = 60;

// Legal boilerplate is high-frequency noise: it appears in many files, shares no
// vocabulary with real queries, and would flatten idf across the corpus.
const BOILERPLATE = /\b(copyright|licensed under|SPDX-License|all rights reserved|permission is hereby granted)\b/i;

const BLOCK_LANGS = new Set(['js', 'jsx', 'ts', 'tsx', 'java', 'go', 'rs', 'kt', 'swift', 'scala', 'cs', 'php', 'dart', 'c', 'cpp', 'h']);
const HASH_LANGS = new Set(['py', 'rb', 'r', 'sh', 'yml', 'yaml', 'toml']);

function _extOf(filePath) {
  const m = String(filePath).match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

/** Strip comment furniture, JSDoc tags, and markup from one raw comment line. */
function _cleanLine(line) {
  return String(line)
    .replace(/^\s*[/*#-]+\s?/, '')      // leading // /* * # ---
    .replace(/\*+\/\s*$/, '')            // trailing */
    .replace(/^\s*@\w+.*$/, '')          // @param / @returns tag lines
    .replace(/[*_`]/g, '')               // markdown emphasis / code ticks
    .trim();
}

/**
 * Extract a module's leading documentation prose.
 *
 * @param {string} src       file contents
 * @param {string} filePath  used only to pick a comment syntax
 * @returns {string} collapsed prose, capped, or '' when there is none
 */
function extractModuleDoc(src, filePath) {
  if (!src || typeof src !== 'string') return '';
  const ext = _extOf(filePath);
  const lines = src.split('\n', MAX_SCAN_LINES);

  const collected = [];
  let inBlock = false;
  let started = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!started) {
      // Skip preamble that precedes the real header comment.
      if (!line) continue;
      if (line.startsWith('#!')) continue;                       // shebang
      if (/^['"]use strict['"];?$/.test(line)) continue;
      if (/^(package|import|from|using|#include)\b/.test(line)) continue;
    }

    if (BLOCK_LANGS.has(ext) || ext === '') {
      if (!inBlock && line.startsWith('/*')) { inBlock = true; started = true; }
      if (inBlock) {
        const cleaned = _cleanLine(line);
        if (cleaned) collected.push(cleaned);
        if (line.includes('*/')) break;
        continue;
      }
      if (line.startsWith('//')) {                                // run of // lines
        started = true;
        const cleaned = _cleanLine(line);
        if (cleaned) collected.push(cleaned);
        continue;
      }
      if (started || collected.length) break;
      break;                                                      // first real code — no header
    }

    if (HASH_LANGS.has(ext)) {
      if (/^("""|''')/.test(line)) {                              // python docstring
        started = true; inBlock = !inBlock;
        const cleaned = _cleanLine(line.replace(/^("""|''')/, '').replace(/("""|''')$/, ''));
        if (cleaned) collected.push(cleaned);
        if (!inBlock) break;
        continue;
      }
      if (inBlock) { const c = _cleanLine(line); if (c) collected.push(c); continue; }
      if (line.startsWith('#')) { started = true; const c = _cleanLine(line); if (c) collected.push(c); continue; }
      if (collected.length) break;
      break;
    }
    break;
  }

  const text = collected.join(' ').replace(/\s+/g, ' ').trim();
  if (!text || BOILERPLATE.test(text)) return '';
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS).replace(/\s+\S*$/, '');        // never cut mid-word
}

/** Render as an index-only pseudo-signature, or '' when there is no doc. */
function moduleDocSig(src, filePath) {
  const doc = extractModuleDoc(src, filePath);
  return doc ? `# module: ${doc}` : '';
}

module.exports = { extractModuleDoc, moduleDocSig, MAX_CHARS };
