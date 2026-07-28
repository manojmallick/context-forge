'use strict';

/**
 * Standalone text redaction (v8.24 G3a) — the same pattern bank the
 * generation-time scanner uses (security/patterns.js), applied to arbitrary
 * text. Unlike scanner.js (which replaces whole signature lines), this masks
 * only the matched secret substring so surrounding text stays readable.
 *
 * Zero dependencies; never throws — on any error the original text is
 * returned unredacted.
 */

const { PATTERNS } = require('./patterns');

// Global variants of the pattern regexes (needed for replace-all per line).
const GLOBAL_PATTERNS = PATTERNS.map((p) => ({
  name: p.name,
  regex: new RegExp(p.regex.source, p.regex.flags.includes('g') ? p.regex.flags : p.regex.flags + 'g'),
}));

/**
 * Redact secrets in arbitrary text.
 * @param {string} text
 * @returns {{
 *   text: string, redacted: boolean,
 *   findings: Array<{ line: number, pattern: string }>,
 *   counts: Object<string, number>
 * }}
 */
function redactText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: typeof text === 'string' ? text : '', redacted: false, findings: [], counts: {} };
  }
  try {
    const findings = [];
    const counts = {};
    const lines = text.split('\n');
    const out = lines.map((line, i) => {
      let masked = line;
      for (const p of GLOBAL_PATTERNS) {
        p.regex.lastIndex = 0;
        if (!p.regex.test(masked)) continue;
        p.regex.lastIndex = 0;
        masked = masked.replace(p.regex, `[REDACTED:${p.name}]`);
        findings.push({ line: i + 1, pattern: p.name });
        counts[p.name] = (counts[p.name] || 0) + 1;
      }
      return masked;
    });
    return { text: out.join('\n'), redacted: findings.length > 0, findings, counts };
  } catch (_) {
    return { text, redacted: false, findings: [], counts: {} };
  }
}

module.exports = { redactText };
