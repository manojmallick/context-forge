'use strict';

/**
 * sigmap-cli — thin CLI wrapper around sigmap-core.
 *
 * This module is required by the root gen-context.js entry point.
 * All --flag handling lives here; business logic lives in src/ or packages/core.
 *
 * NOTE: This file intentionally does NOT duplicate business logic.
 * It re-exports the entry-point function from gen-context.js so that
 * `require('sigmap-cli')` can be used by tooling that wraps SigMap.
 *
 * In v2.4 the root gen-context.js is kept fully intact for backward compat.
 * packages/cli is a forward-compat shim for the v3.0 adapter architecture.
 */

const path = require('path');

/**
 * The CLI entry point path.
 * External tools can use this to spawn the CLI as a child process.
 */
const CLI_ENTRY = path.resolve(__dirname, '..', '..', 'gen-context.js');

/**
 * Run the SigMap CLI programmatically with the given argv array.
 *
 * @param {string[]} [argv]  - Arguments to pass (default: process.argv)
 * @param {string}   [cwd]   - Working directory (default: process.cwd())
 * @returns {void}
 *
 * @example
 *   const { run } = require('sigmap-cli');
 *   run(['--report'], '/path/to/project');
 */
function run(argv, cwd) {
  const origArgv = process.argv;
  const origCwd = process.cwd();

  if (cwd) {
    try { process.chdir(cwd); } catch (_) {}
  }

  if (argv) {
    process.argv = [process.argv[0], CLI_ENTRY, ...argv];
  }

  try {
    require(CLI_ENTRY);
  } finally {
    process.argv = origArgv;
    if (cwd) {
      try { process.chdir(origCwd); } catch (_) {}
    }
  }
}

module.exports = {
  /** Absolute path to the gen-context.js entry point */
  CLI_ENTRY,
  /** Run the SigMap CLI programmatically */
  run,
};
