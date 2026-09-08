'use strict';

/**
 * Extract signatures from Lua source code.
 *
 * Recognised constructs:
 *   - Global functions: `function name(args)`
 *   - Module-table functions: `function M.name(args)` / `function M:name(args)`
 *   - Local functions: `local function name(args)`
 *   - Assigned functions: `name = function(args)` / `M.name = function(args)`
 *   - Module imports: `local mod = require("mod")` as compact hints
 *   - LDoc-style doc comments (`---`) as first-sentence hints
 *
 * The extractor is regex-only and zero-dependency, matching SigMap's Tier-3
 * language extractor style.
 *
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];
  const hints = collectDocHints(src);
  const stripped = stripLuaComments(src);
  const seen = new Set();

  // local foo = require('bar.baz') — useful module-surface hint, capped low.
  for (const m of stripped.matchAll(/^\s*(?:local\s+)?([A-Za-z_]\w*)\s*=\s*require\s*\(\s*['"]([A-Za-z0-9_.\/-]+)['"]\s*\)/gm)) {
    pushUnique(sigs, seen, `require ${m[2]} as ${m[1]}`);
    if (sigs.length >= 30) return sigs.slice(0, 30);
  }

  // local function name(args)
  for (const m of stripped.matchAll(/^\s*local\s+function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/gm)) {
    if (m[1].startsWith('_')) continue;
    pushUnique(sigs, seen, `local function ${m[1]}(${normalizeParams(m[2])})${applyHint(hints, m[1])}`);
    if (sigs.length >= 30) return sigs.slice(0, 30);
  }

  // function name(args), function M.name(args), function M:name(args)
  for (const m of stripped.matchAll(/^\s*function\s+([A-Za-z_]\w*(?:(?:\.|:)[A-Za-z_]\w*)*)\s*\(([^)]*)\)/gm)) {
    const name = m[1];
    if (name.startsWith('_')) continue;
    pushUnique(sigs, seen, `function ${name}(${normalizeParams(m[2])})${applyHint(hints, name)}`);
    if (sigs.length >= 30) return sigs.slice(0, 30);
  }

  // name = function(args), M.name = function(args), M:name = function(args)
  for (const m of stripped.matchAll(/^\s*(?:local\s+)?([A-Za-z_]\w*(?:(?:\.|:)[A-Za-z_]\w*)*)\s*=\s*function\s*\(([^)]*)\)/gm)) {
    const name = m[1];
    if (name.startsWith('_')) continue;
    pushUnique(sigs, seen, `${name} = function(${normalizeParams(m[2])})${applyHint(hints, name)}`);
    if (sigs.length >= 30) return sigs.slice(0, 30);
  }

  return sigs.slice(0, 30);
}

function pushUnique(out, seen, sig) {
  if (!sig || seen.has(sig)) return;
  seen.add(sig);
  out.push(sig);
}

function normalizeParams(params) {
  return String(params || '')
    .replace(/--.*$/gm, '')
    .split(',')
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(', ');
}

function applyHint(hints, name) {
  const h = hints.get(name);
  return h ? `  # ${h}` : '';
}

/**
 * Attach each contiguous `---` doc block to the next function-like declaration
 * by its extracted symbol name.
 */
function collectDocHints(src) {
  const hints = new Map();
  const lines = src.split('\n');
  let block = [];
  for (const line of lines) {
    const doc = line.match(/^\s*---\s?(.*)$/);
    if (doc) {
      block.push(doc[1]);
    } else if (block.length > 0) {
      const decl = line.match(/^\s*local\s+function\s+([A-Za-z_]\w*)\s*\(/)
                || line.match(/^\s*function\s+([A-Za-z_]\w*(?:(?:\.|:)[A-Za-z_]\w*)*)\s*\(/)
                || line.match(/^\s*(?:local\s+)?([A-Za-z_]\w*(?:(?:\.|:)[A-Za-z_]\w*)*)\s*=\s*function\s*\(/);
      if (decl) {
        const hint = firstDocSentence(block);
        if (hint) hints.set(decl[1], hint);
      }
      block = [];
    }
  }
  return hints;
}

function firstDocSentence(block) {
  for (const raw of block) {
    const line = String(raw || '').trim();
    if (!line || line.startsWith('@')) continue;
    return line.replace(/\s+/g, ' ').slice(0, 60).replace(/[.,;:!?]+$/, '').trim();
  }
  return '';
}

/** Strip Lua line and long comments while preserving strings enough for regex scans. */
function stripLuaComments(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        if (src[i] === '\n') break;
        i++;
      }
      continue;
    }
    if (src.startsWith('--[[', i)) {
      const end = src.indexOf(']]', i + 4);
      blank(i, end === -1 ? src.length : end + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (src.startsWith('--', i)) {
      const end = src.indexOf('\n', i + 2);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    i++;
  }
  return out.join('');
}

module.exports = { extract };
