'use strict';

/**
 * source-meta.mjs — single derivation of SigMap's source-derived counts.
 *
 * One place computes the language list, extractor/test/MCP-tool counts so the
 * llms.txt generator and the version.json metadata gate can never disagree
 * (Trust Hygiene H3). Zero dependencies; pure functions of the repo root.
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Extractor modules that are infrastructure, not user-facing languages
 * (helpers, the dispatcher, the generic fallback). Excluded from the language
 * list / count, but still counted as extractor modules.
 */
export const EXTRACTOR_HELPERS = new Set([
  'line-anchor', 'deps', 'coverage', 'patterns', 'python_ast', 'scan',
  'python_dataclass', 'todos', 'prdiff', 'dispatch', 'generic',
]);

/** All extractor module basenames (`.js`) under src/extractors, sorted. */
export function extractorModules(root) {
  return readdirSync(join(root, 'src', 'extractors'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/\.js$/, ''))
    .sort();
}

/** Total number of extractor modules (languages + helpers). */
export function countExtractors(root) {
  return extractorModules(root).length;
}

/** User-facing language extractor names (helpers removed), sorted. */
export function deriveLanguages(root) {
  return extractorModules(root).filter((n) => !EXTRACTOR_HELPERS.has(n));
}

/** Count files under `dir` (recursive) whose name matches `re`. */
function countFiles(dir, re) {
  let n = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) n += countFiles(full, re);
    else if (e.isFile() && re.test(e.name)) n += 1;
  }
  return n;
}

/** Number of test files: test/**\/*.test.js + test/**\/test_*.py (unittest-named, not fixtures) */
export function countTests(root) {
  return countFiles(join(root, 'test'), /\.test\.js$/) +
         countFiles(join(root, 'test'), /^test_.*\.py$/);
}

/** Number of MCP tools registered in src/mcp/tools.js. */
export function countMcpTools(root) {
  const { TOOLS } = require(join(root, 'src', 'mcp', 'tools.js'));
  return TOOLS.length;
}

/** All source-derived counts for version.json. */
export function deriveCounts(root) {
  return {
    languages: deriveLanguages(root).length,
    extractors: countExtractors(root),
    mcp_tools: countMcpTools(root),
    tests: countTests(root),
  };
}
