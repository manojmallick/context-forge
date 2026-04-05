'use strict';

/**
 * SigMap MCP server — zero npm dependencies.
 *
 * Wire protocol: JSON-RPC 2.0 over stdio.
 * One JSON object per line on both stdin and stdout.
 *
 * Supported methods:
 *   initialize        → serverInfo + capabilities
 *   tools/list        → 3 tool definitions
 *   tools/call        → dispatch to handler, return result
 */

const readline = require('readline');
const { TOOLS } = require('./tools');
const { readContext, searchSignatures, getMap, createCheckpoint, getRouting, explainFile, listModules, queryContext, getImpact } = require('./handlers');

const SERVER_INFO = {
  name: 'sigmap',
  version: '2.5.0',
  description: 'SigMap MCP server — code signatures on demand',
};

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------
function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
  process.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'
  );
}

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------
function dispatch(msg, cwd) {
  const { method, id, params } = msg;

  // Notifications (no id) need no response
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return;
  }

  if (method === 'initialize') {
    respond(id, {
      protocolVersion: (params && params.protocolVersion) || '2024-11-05',
      serverInfo: SERVER_INFO,
      capabilities: { tools: {} },
    });
    return;
  }

  if (method === 'tools/list') {
    respond(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};

    let text;
    try {
      if (name === 'read_context') text = readContext(args, cwd);
      else if (name === 'search_signatures') text = searchSignatures(args, cwd);
      else if (name === 'get_map') text = getMap(args, cwd);
      else if (name === 'create_checkpoint') text = createCheckpoint(args, cwd);
      else if (name === 'get_routing') text = getRouting(args, cwd);
      else if (name === 'explain_file') text = explainFile(args, cwd);
      else if (name === 'list_modules') text = listModules(args, cwd);
      else if (name === 'query_context') text = queryContext(args, cwd);
      else if (name === 'get_impact') text = getImpact(args, cwd);
      else {
        respondError(id, -32601, `Unknown tool: ${name}`);
        return;
      }
    } catch (err) {
      respondError(id, -32603, `Tool error: ${err.message}`);
      return;
    }

    respond(id, {
      content: [{ type: 'text', text: String(text) }],
    });
    return;
  }

  // Unknown method
  if (id !== undefined && id !== null) {
    respondError(id, -32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Server entry point
// ---------------------------------------------------------------------------
function start(cwd) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (_) {
      // Cannot respond without a valid id — ignore malformed input
      return;
    }

    try {
      dispatch(msg, cwd);
    } catch (err) {
      const id = (msg && msg.id) != null ? msg.id : null;
      respondError(id, -32603, `Internal error: ${err.message}`);
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

module.exports = { start };
