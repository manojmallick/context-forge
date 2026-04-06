'use strict';

/**
 * Gemini adapter — formats context as a Gemini system instruction.
 * Use the output as the `system_instruction` field in a Gemini API request.
 *
 * Example usage:
 *   const { format } = require('sigmap/adapters/gemini');
 *   const instruction = format(context);
 *   // Pass to: genAI.getGenerativeModel({ model: 'gemini-pro', systemInstruction: instruction })
 *
 * Contract:
 *   format(context, opts?) → string
 *   outputPath(cwd) → string
 */

const path = require('path');

const name = 'gemini';

/**
 * Format context as a Gemini system instruction.
 * @param {string} context - Raw signature context string
 * @param {object} [opts]
 * @param {string} [opts.version] - SigMap version string
 * @param {string} [opts.projectName] - Optional project name
 * @returns {string}
 */
function format(context, opts = {}) {
  if (!context || typeof context !== 'string') return '';
  const version = opts.version || 'unknown';
  const timestamp = new Date().toISOString();
  const projectLine = opts.projectName
    ? `Project: ${opts.projectName}\n`
    : '';

  return [
    `You are a coding assistant with complete knowledge of this codebase.`,
    `The following code signatures were extracted by SigMap v${version} on ${timestamp}.`,
    projectLine,
    `These signatures represent every public function, class, and type in the project.`,
    `Refer to them when answering questions about code structure, APIs, and implementation.`,
    ``,
    `## Code Signatures`,
    ``,
    context,
  ].join('\n');
}

/**
 * Return the output file path for this adapter.
 * @param {string} cwd - Project root
 * @returns {string}
 */
function outputPath(cwd) {
  return path.join(cwd, '.github', 'gemini-context.md');
}

module.exports = { name, format, outputPath };
