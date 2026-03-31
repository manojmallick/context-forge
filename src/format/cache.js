'use strict';

/**
 * Format context output for Anthropic prompt cache API.
 *
 * Usage:
 *   const { formatCache } = require('./src/format/cache');
 *   const json = formatCache(markdownContent);
 *   // json is a ready-to-use Anthropic system block with cache_control
 *
 * Writes: .github/copilot-instructions.cache.json
 */

/**
 * Wrap markdown context in an Anthropic cache-control system block.
 * @param {string} content - Markdown content from formatOutput()
 * @returns {string} - JSON string: a single Anthropic system content block
 */
function formatCache(content) {
  if (!content || typeof content !== 'string') content = '';
  const block = {
    type: 'text',
    text: content,
    cache_control: { type: 'ephemeral' },
  };
  return JSON.stringify(block, null, 2);
}

/**
 * Wrap markdown context in a full Anthropic messages API payload.
 * Includes the system array with cache_control so it can be copy-pasted
 * directly into an API call.
 * @param {string} content - Markdown content from formatOutput()
 * @param {string} [model] - Anthropic model ID (default: claude-opus-4-5)
 * @returns {string} - JSON string: { model, system: [...] }
 */
function formatCachePayload(content, model) {
  if (!content || typeof content !== 'string') content = '';
  const payload = {
    model: model || 'claude-opus-4-5',
    system: [
      {
        type: 'text',
        text: content,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [],
  };
  return JSON.stringify(payload, null, 2);
}

module.exports = { formatCache, formatCachePayload };
