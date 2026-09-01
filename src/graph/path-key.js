'use strict';

/**
 * The single definition of a graph node key.
 *
 * src/graph/builder.js and src/graph/call-graph.js each used to normalise paths
 * their own way — builder lowercased, call-graph did not — so a lookup written
 * for one silently missed on the other. That divergence disabled the import
 * boost on every repo whose path contains an uppercase letter, and later caused
 * a "fix" for one graph to break the other. Both now key through this function,
 * so there is one convention rather than two conventions and a convention.
 *
 * Lowercasing keeps lookups stable across case-insensitive filesystems (macOS,
 * Windows), where the same file legitimately arrives spelled two ways.
 *
 * Zero-dependency, pure, bundle-safe.
 */

const path = require('path');

/** Canonical key for a filesystem path used as a graph node. */
function graphKey(p) {
  return path.normalize(String(p)).toLowerCase();
}

module.exports = { graphKey };
