'use strict';

/**
 * Extract signatures from Dockerfiles.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const lines = src.split('\n').filter((l) => l.trim() && !l.trimStart().startsWith('#'));

  // FROM stages
  for (const line of lines) {
    const m = line.match(/^FROM\s+([^\s]+)(?:\s+AS\s+(\w+))?/i);
    if (m) sigs.push(`FROM ${m[1]}${m[2] ? ` AS ${m[2]}` : ''}`);
  }

  // EXPOSE ports
  const exposePorts = [];
  for (const line of lines) {
    const m = line.match(/^EXPOSE\s+([\d\s/]+)/i);
    if (m) exposePorts.push(...m[1].trim().split(/\s+/));
  }
  if (exposePorts.length > 0) sigs.push(`EXPOSE ${exposePorts.join(' ')}`);

  // ENTRYPOINT and CMD
  for (const line of lines) {
    if (/^ENTRYPOINT\s+/i.test(line)) sigs.push(line.trim());
    if (/^CMD\s+/i.test(line)) sigs.push(line.trim());
  }

  // ENV variables
  for (const line of lines) {
    const m = line.match(/^ENV\s+([\w]+)/i);
    if (m) sigs.push(`ENV ${m[1]}`);
  }

  // ARG variables
  for (const line of lines) {
    const m = line.match(/^ARG\s+([\w]+)/i);
    if (m) sigs.push(`ARG ${m[1]}`);
  }

  return sigs.slice(0, 25);
}

module.exports = { extract };
