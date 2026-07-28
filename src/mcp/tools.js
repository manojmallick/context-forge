'use strict';

/**
 * MCP tool definitions for SigMap (20 tools).
 * read_context, search_signatures, get_map, create_checkpoint, get_routing,
 * explain_file, list_modules, query_context, get_method_impact, get_impact,
 * get_lines, read_memory, get_callee_signatures, sigmap_notify_file_created,
 * sigmap_notify_symbol_added, sigmap_notify_file_deleted, get_diff_context,
 * get_architecture_overview, verify_suggestion, squeeze_output.
 */

const TOOLS = [
  {
    name: 'read_context',
    description:
      'Read extracted code signatures for the project or a specific module path. ' +
      'Returns the full copilot-instructions.md content (~500–4K tokens) or a ' +
      'filtered subset when a module path is provided (~50–500 tokens).',
    inputSchema: {
      type: 'object',
      properties: {
        module: {
          type: 'string',
          description:
            'Optional subdirectory path to scope results (e.g. "src/services"). ' +
            'Omit to get the full codebase context.',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_signatures',
    description:
      'Search extracted code signatures for a keyword, function name, or class name. ' +
      'Returns matching signature lines with their file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword to search for in signatures (case-insensitive).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_map',
    description:
      'Read a section from PROJECT_MAP.md — import graph, class hierarchy, or route table. ' +
      'Requires gen-project-map.js to have been run first.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['imports', 'classes', 'routes'],
          description: 'Which section to retrieve: imports, classes, or routes.',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'create_checkpoint',
    description:
      'Create a session checkpoint summarising current project state. ' +
      'Returns recent git commits, active branch, token count, and a ' +
      'compact snapshot of the codebase context — ideal for session handoffs ' +
      'or periodic saves during long coding sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        note: {
          type: 'string',
          description: 'Optional free-text note to include in the checkpoint (e.g. what you were working on).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_routing',
    description:
      'Get model routing hints for this project — which files belong to which complexity ' +
      'tier (fast/balanced/powerful) and which AI model to use for each type of task. ' +
      'Helps reduce API costs by 40–80% by routing simple tasks to cheaper models.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'explain_file',
    description:
      'Explain a specific file: returns its extracted signatures, direct imports ' +
      '(files it depends on), and callers (files that import it). ' +
      'Ideal for understanding a file in isolation without reading raw source. ' +
      'Requires the context file to have been generated first.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative path from the project root (e.g. "src/services/auth.ts"). ' +
            'Use the paths shown in read_context output.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_modules',
    description:
      'List all top-level modules (srcDirs) present in the context file, ' +
      'sorted by token count descending. Use this to decide which module to ' +
      'pass to read_context before querying a specific area of the codebase.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'query_context',
    description:
      'Rank and return the most relevant files for a specific task or question. ' +
      'Uses keyword + symbol + path scoring to surface only the top-K files relevant ' +
      'to the query — much cheaper than reading all context. ' +
      'Returns ranked file list with signatures and relevance scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language task description or keyword(s) to rank files against. ' +
            'E.g. "add a new language extractor", "fix secret scanning", "auth module".',
        },
        topK: {
          type: 'number',
          description: 'Maximum number of files to return (default: 10, max: 25).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_method_impact',
    description:
      'Method-level blast radius for a symbol: every FUNCTION that (transitively) calls it — ' +
      'or, with direction "callees", every repo function it calls. Finer-grained than the ' +
      'file-level get_impact: tells an agent which functions break, not just which files. ' +
      'JS/TS, Python, Java, Go, and Rust call-graph; deterministic, no LLM.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description:
            'Function/method name (e.g. "validateToken") or a full "file#name" id ' +
            '(e.g. "src/auth/session.js#validateToken") to disambiguate.',
        },
        direction: {
          type: 'string',
          enum: ['callers', 'callees'],
          description: '"callers" (default) = blast radius; "callees" = what the symbol calls.',
        },
        depth: {
          type: 'number',
          description: 'BFS depth limit (default 0 = unlimited).',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_impact',
    description:
      'Show every file that is impacted when a given file changes — direct importers, ' +
      'transitive importers, affected tests, and affected routes/controllers. ' +
      'Gives agents instant blast-radius awareness before making a change. ' +
      'Handles circular dependencies safely (no infinite loops).',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description:
            'Relative path from the project root of the file that changed ' +
            '(e.g. "src/extractors/python.js"). Use forward slashes.',
        },
        depth: {
          type: 'number',
          description: 'BFS traversal depth limit (default: 3). Use 0 for unlimited.',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'get_lines',
    description:
      'Fetch an exact line range from a source file on demand — the Surgical Context ' +
      'workhorse. Signatures carry `path:start-end` anchors; call this to read just those ' +
      'lines instead of re-opening the whole file. Lines are clamped to the file bounds and ' +
      'secret-scanned (redacted) before return. Path is sandboxed to the project root.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description:
            'Relative path from the project root (e.g. "src/config/loader.js"). ' +
            'Use the path shown in a signature anchor. Use forward slashes.',
        },
        start: {
          type: 'number',
          description: '1-based start line (inclusive). Clamped to the file bounds.',
        },
        end: {
          type: 'number',
          description: '1-based end line (inclusive). Clamped to the file bounds.',
        },
      },
      required: ['file', 'start', 'end'],
    },
  },
  {
    name: 'read_memory',
    description:
      'Recall the project decision log — recent notes left by humans or agents ' +
      'across sessions (via `sigmap note`), plus the last ranking-session focus. ' +
      'Call this at the start of a task to kill cold-start: it answers ' +
      '"what were we doing and why" without re-reading the whole codebase.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'How many of the most recent notes to return (default: 10, max: 50).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_callee_signatures',
    description:
      'Return the EXACT current signature(s) of named symbols (functions, classes, ' +
      "methods) from the index — so an agent never guesses a callee's parameter types " +
      'from training memory. Call this before writing code that uses a symbol. ' +
      'Unknown names get a closest-match suggestion.',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Symbol names to resolve (e.g. ["validateToken", "UserService"]).',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'sigmap_notify_file_created',
    description:
      'Tell SigMap a file was created or modified so its signatures are indexed ' +
      'live for the rest of the session. Call this after writing a file — the new ' +
      'symbols become resolvable by search_signatures / get_callee_signatures.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the project root.' },
        content: { type: 'string', description: 'Optional file content; read from disk if omitted.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'sigmap_notify_symbol_added',
    description:
      'Fast path: register a single new symbol signature directly in the live ' +
      'index without re-reading the whole file.',
    inputSchema: {
      type: 'object',
      properties: {
        signature: { type: 'string', description: 'The signature line (e.g. "function check(key)").' },
        file: { type: 'string', description: 'File path the symbol belongs to (relative to root).' },
        line: { type: 'number', description: 'Optional 1-based line number.' },
      },
      required: ['signature', 'file'],
    },
  },
  {
    name: 'sigmap_notify_file_deleted',
    description:
      'Tell SigMap a file was deleted so its symbols are dropped from the live index.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Deleted file path relative to the project root.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_diff_context',
    description:
      'For every changed file in the working tree (or staged, or vs a base ref), return its ' +
      'current signatures plus blast radius — direct importers, transitive count, and affected ' +
      'tests/routes — with a risk label. One call gives an agent everything a code review or a ' +
      'safe edit needs. Lists changed files shell-free (git binary, never a shell).',
    inputSchema: {
      type: 'object',
      properties: {
        base: {
          type: 'string',
          description: 'Optional git ref to diff against (e.g. "main"). Returns files changed in `base..HEAD`. Omit for working-tree changes.',
        },
        staged: {
          type: 'boolean',
          description: 'When true (and no base), report only staged changes (`git diff --cached`).',
        },
        depth: {
          type: 'number',
          description: 'Blast-radius BFS depth limit (default: 2). Use 0 for unlimited.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_architecture_overview',
    description:
      'A high-level map of the codebase in one call: module breakdown (files/tokens), the most ' +
      'depended-on "hub" files, the dependency-cycle count, and route totals. Extends get_map — ' +
      'use it to orient in an unfamiliar repo before drilling in with read_context / query_context.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'verify_suggestion',
    description:
      'Ground an AI code suggestion before writing it: verify a snippet or answer against the ' +
      'repository AND the libraries actually installed in node_modules (the grounding moat). ' +
      'Flags fake file paths, unresolvable imports, symbols absent from both the repo index and ' +
      'the installed libraries, and non-existent npm scripts — deterministic, offline, no LLM. ' +
      'Reports the installed libraries it verified against with pinned versions.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'The AI-suggested code snippet or answer text to verify against the repo + installed libraries.',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'squeeze_output',
    description:
      'Compress noisy tool, command, or agent output before it enters context — a stack ' +
      'trace, CI/build log, or JSON payload. Same deterministic, offline engine as ' +
      '`sigmap squeeze`: keeps the signal (error frames, failing steps, JSON shape), strips ' +
      'the noise, and enriches the top stack frame with its signature. Returns the squeezed ' +
      'text plus token-reduction stats; passes the input through unchanged when no squeezable ' +
      'structure is detected. No LLM, no network.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'The raw output to compress (a stack trace, CI/build log, or JSON payload).',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_budget',
    description:
      'Session spend ledger — estimated tokens SigMap has emitted this session ' +
      '(chars/4 estimates from the local gain log), optional budget remaining, and ' +
      'context freshness. Scope honesty: counts only SigMap output, NOT the whole ' +
      "chat's spend. Check this mid-session and degrade gracefully when near budget: " +
      'prefer terse encoding, squeeze large outputs, summarize-then-drop context. ' +
      'Local-only; no LLM, no network.',
    inputSchema: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description:
            'Session key to report on (default: SIGMAP_SESSION env or the UTC day bucket).',
        },
        budgetTokens: {
          type: 'number',
          description:
            'Budget override in estimated tokens (default: config sessionBudgetTokens).',
        },
      },
      required: [],
    },
  },
];

module.exports = { TOOLS };
