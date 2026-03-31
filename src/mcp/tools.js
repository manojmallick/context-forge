'use strict';

/**
 * MCP tool definitions for ContextForge.
 * Three tools: read_context, search_signatures, get_map.
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
];

module.exports = { TOOLS };
