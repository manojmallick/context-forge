'use strict';

/**
 * Default configuration values for ContextForge.
 * All keys documented here. Override via gen-context.config.json.
 */
const DEFAULTS = {
  // Primary output file (used when outputs includes 'copilot')
  output: '.github/copilot-instructions.md',

  // Output targets: 'copilot' | 'claude' | 'cursor' | 'windsurf'
  outputs: ['copilot'],

  // Directories to scan (relative to project root)
  srcDirs: ['src', 'app', 'lib', 'packages', 'services', 'api'],

  // Directory/file names to exclude entirely
  exclude: [
    'node_modules', '.git', 'dist', 'build', 'out',
    '__pycache__', '.next', 'coverage', 'target', 'vendor',
    '.context',
  ],

  // Maximum directory depth to recurse
  maxDepth: 6,

  // Maximum signatures extracted per file
  maxSigsPerFile: 25,

  // Maximum tokens in final output before budget enforcement kicks in
  maxTokens: 6000,

  // Scan signatures for secrets and redact matches
  secretScan: true,

  // Auto-detect monorepo packages and write per-package output files
  monorepo: false,

  // Sort recently git-committed files higher in output
  diffPriority: true,

  // Append model routing hints section to the context output
  // Routes files to fast/balanced/powerful model tiers based on complexity
  routing: false,

  // Output format: 'default' (markdown only) | 'cache' (also write Anthropic prompt-cache JSON)
  format: 'default',

  // Append run metrics to .context/usage.ndjson after each generate
  tracking: false,

  // MCP server configuration
  mcp: {
    autoRegister: true,
  },
};

module.exports = { DEFAULTS };
