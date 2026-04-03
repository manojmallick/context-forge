'use strict';

/**
 * Compare signature arrays and produce compact diff markers.
 * @param {string[]} baseSigs
 * @param {string[]} currentSigs
 * @returns {{added:string[], removed:string[], modified:string[]}}
 */
function diffSignatures(baseSigs, currentSigs) {
  const base = new Set(baseSigs || []);
  const curr = new Set(currentSigs || []);

  const added = [...curr].filter((s) => !base.has(s));
  const removed = [...base].filter((s) => !curr.has(s));

  const byName = (arr) => {
    const m = new Map();
    for (const s of arr) {
      const n = extractName(s);
      if (!n) continue;
      if (!m.has(n)) m.set(n, []);
      m.get(n).push(s);
    }
    return m;
  };

  const aBy = byName(added);
  const rBy = byName(removed);
  const modified = [];

  for (const [name] of aBy) {
    if (rBy.has(name)) modified.push(name);
  }

  return { added, removed, modified };
}

function extractName(sig) {
  if (!sig) return '';
  const t = sig.trim();
  const m = t.match(/(?:def|function|func|class|interface|trait|struct|enum|record)?\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|$)/);
  return m ? m[1] : '';
}

module.exports = { diffSignatures, extractName };
