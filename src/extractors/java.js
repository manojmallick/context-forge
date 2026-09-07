'use strict';

const { lineAt, withAnchor } = require('./line-anchor');
const { capWithNotice, capMembersWithNotice } = require('../util/truncate');

// Class bodies are scanned to this many characters. Generated JVM sources
// (MyBatis/JPA entities) routinely run past 10KB, so the ceiling only guards
// against pathological input rather than trimming ordinary classes.
const MAX_CLASS_BODY_CHARS = 200000;

// Per-class member ceiling. Sits above the default `maxSigsPerFile` so the
// caller's configured budget governs the output rather than this file.
const MAX_MEMBERS_PER_CLASS = 120;

// Per-file signature ceiling, likewise above the configured default.
const MAX_SIGS_PER_FILE = 200;

/**
 * Extract signatures from Java source code.
 * Signatures carry `:start-end` line anchors (Surgical Context); the comment
 * strip below is newline-preserving so anchor lines match the original file.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];
  const docHints = buildDocHints(src);
  // Append the Javadoc hint after the anchor as `  # <hint>` — same convention
  // as the Python/JS extractors' doc hints.
  const hinted = (sig, name) => (docHints.has(name) ? `${sig}  # ${docHints.get(name)}` : sig);

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));

  // Classes and interfaces
  const typeRegex = /^(?:public\s+|protected\s+)?(?:abstract\s+|final\s+)?(class|interface|enum)\s+(\w+)(?:\s+extends\s+[\w<>, .]+)?(?:\s+implements\s+[\w<>, .]+)?\s*\{/gm;
  for (const m of stripped.matchAll(typeRegex)) {
    const bodyStart = m.index + m[0].length;
    const block = extractBlock(stripped, bodyStart);
    sigs.push(hinted(withAnchor(`${m[1]} ${m[2]}`, lineAt(stripped, m.index), lineAt(stripped, bodyStart + block.length)), m[2]));
    for (const meth of extractMembers(block)) {
      // The disclosure marker carries no offsets; anchor it at the class body.
      const declIdx = meth.declIdx || 0;
      const endIdx = meth.endIdx || 0;
      sigs.push(hinted(withAnchor(`  ${meth.text}`, lineAt(stripped, bodyStart + declIdx), lineAt(stripped, bodyStart + endIdx)), meth.name));
    }
  }

  return capWithNotice(sigs, MAX_SIGS_PER_FILE, 'signatures');
}

function extractBlock(src, startIndex) {
  let depth = 1;
  let i = startIndex;
  const end = Math.min(src.length, startIndex + MAX_CLASS_BODY_CHARS);
  while (i < end && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(startIndex, i - 1);
}

function extractMembers(block) {
  const members = [];
  const methodRe = /^\s+(?:public|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s+)?([\w<>\[\], ?.]+)\s+(\w+)\s*\(([^)]*)\)/gm;
  for (const m of block.matchAll(methodRe)) {
    const ret = normalizeType(m[1]);
    const retStr = ret ? ` → ${ret}` : '';
    members.push({
      text: `${m[2]}(${normalizeParams(m[3])})${retStr}`,
      name: m[2],
      declIdx: m.index + (m[0].length - m[0].trimStart().length),
      endIdx: m.index + m[0].length,
    });
  }
  return capMembersWithNotice(members, MAX_MEMBERS_PER_CLASS);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

function normalizeType(type) {
  if (!type) return '';
  return type.trim().replace(/\s+/g, ' ').slice(0, 30);
}

// Javadoc: the `/** ... */` block directly above a type or public/protected
// member declaration → first prose sentence, 60-char cap. Runs on the
// ORIGINAL src (extract strips comments before matching). Annotation lines
// (`@Override` etc.) between the doc block and the declaration are tolerated.
// Body may not contain `*/` so a failed adjacency check can't expand across
// code to the next comment block and misattribute the hint.
function buildDocHints(src) {
  const hints = new Map();
  const patterns = [
    /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+|protected\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)/g,
    /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s+)?[\w<>\[\], ?.]+\s+(\w+)\s*\(/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const hint = firstDocSentence(m[1]);
      if (hint && !hints.has(m[2])) hints.set(m[2], hint);
    }
  }
  return hints;
}

// First non-tag prose line of a Javadoc body → first sentence, 60-char cap.
function firstDocSentence(body) {
  const line = String(body).split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .find((l) => l && !l.startsWith('@'));
  if (!line) return '';
  return line.split(/[.!?]/)[0].trim().slice(0, 60);
}

module.exports = { extract };
