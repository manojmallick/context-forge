'use strict';

/**
 * Default configuration values for SigMap.
 * All keys documented here. Override via gen-context.config.json.
 */
const DEFAULTS = {
  // Primary output file (used when outputs includes 'copilot')
  output: '.github/copilot-instructions.md',

  // Output targets: 'copilot' | 'claude' | 'cursor' | 'windsurf'
  outputs: ['copilot'],

  // Directories to scan (relative to project root)
  srcDirs: [
    'src', 'app', 'lib', 'packages', 'services', 'api',
    // common monorepo / multi-project top-level names
    'server', 'client', 'web', 'frontend', 'backend',
    'desktop', 'mobile', 'shared', 'common', 'core',
    'workers', 'functions', 'lambda', 'cmd',
  ],

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

  // Context strategy controls how the output is split and injected.
  // 'full'       -> single context file (default)
  // 'per-module' -> one context-<module>.md per top-level srcDir + thin overview
  // 'hot-cold'   -> recent files in primary output, older files in context-cold.md
  strategy: 'full',

  // For hot-cold strategy: how many recent git commits count as "hot"
  hotCommits: 10,

  // Debounce delay (ms) between file-system events and regeneration in watch mode
  watchDebounce: 300,

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

  // Include a compact import dependency map at top of output
  depMap: true,

  // Include TODO/FIXME/HACK/XXX comments as compact section
  todos: true,

  // Include compact recent git changes section
  changes: true,

  // Number of commits used for changes section
  changesCommits: 5,

  // Add test coverage markers to extracted function signatures (opt-in)
  testCoverage: false,

  // Directories scanned for tests when testCoverage is enabled
  testDirs: ['tests', 'test', '__tests__', 'spec'],

  // Add reverse dependency usage hints on file headings (opt-in)
  impactRadius: false,

  // Query-aware retrieval settings (v2.3)
  retrieval: {
    // Maximum number of files to return for --query
    topK: 10,
    // Multiplier applied to recently-changed files (>1 boosts them up)
    recencyBoost: 1.5,
  },
};

module.exports = { DEFAULTS };
