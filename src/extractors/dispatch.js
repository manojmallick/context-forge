'use strict';

/**
 * Bundle-safe extractor dispatch.
 *
 * `packages/core`'s extract() resolves extractors via dynamic `require(path.join(…))`,
 * which cannot run inside the standalone bundle (no filesystem `src/`). This module
 * uses STATIC requires so the bundler rewrites them to `__require` and the extractors
 * resolve from the bundled factories. Used by the live-index MCP write hooks.
 */

const path = require('path');

// Static language → extractor map (every entry is a bundled factory).
const EXTRACTORS = {
  typescript: require('./typescript'),
  typescript_react: require('./typescript_react'),
  javascript: require('./javascript'),
  python: require('./python'),
  java: require('./java'),
  kotlin: require('./kotlin'),
  go: require('./go'),
  rust: require('./rust'),
  csharp: require('./csharp'),
  cpp: require('./cpp'),
  ruby: require('./ruby'),
  php: require('./php'),
  swift: require('./swift'),
  dart: require('./dart'),
  scala: require('./scala'),
  lua: require('./lua'),
  gdscript: require('./gdscript'),
  r: require('./r'),
  vue: require('./vue'),
  vue_sfc: require('./vue_sfc'),
  svelte: require('./svelte'),
  html: require('./html'),
  css: require('./css'),
  yaml: require('./yaml'),
  shell: require('./shell'),
  sql: require('./sql'),
  graphql: require('./graphql'),
  terraform: require('./terraform'),
  protobuf: require('./protobuf'),
  toml: require('./toml'),
  properties: require('./properties'),
  xml: require('./xml'),
  markdown: require('./markdown'),
  dockerfile: require('./dockerfile'),
  generic: require('./generic'),
};

const EXT_MAP = {
  '.ts': 'typescript', '.tsx': 'typescript_react',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyw': 'python',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.go': 'go',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.c': 'cpp', '.h': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.rb': 'ruby', '.rake': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.dart': 'dart',
  '.scala': 'scala', '.sc': 'scala',
  '.lua': 'lua',
  '.gd': 'gdscript',
  '.r': 'r', '.R': 'r',
  '.vue': 'vue_sfc',
  '.svelte': 'svelte',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
  '.yml': 'yaml', '.yaml': 'yaml',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.fish': 'shell',
  '.sql': 'sql',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.tf': 'terraform', '.tfvars': 'terraform',
  '.proto': 'protobuf',
  '.toml': 'toml',
  '.properties': 'properties',
  '.xml': 'xml',
  '.md': 'markdown',
};

/** Resolve a language key from a file path/name. */
function langFor(filePathOrName) {
  const base = path.basename(String(filePathOrName || ''));
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) return 'dockerfile';
  const ext = path.extname(base).toLowerCase();
  return EXT_MAP[ext] || null;
}

/**
 * Extract signatures from a file's content using the right extractor.
 * @param {string} filePathOrName - path or name (extension drives the extractor)
 * @param {string} src - file content
 * @returns {string[]}
 */
function extractFile(filePathOrName, src) {
  if (!src || typeof src !== 'string') return [];
  const lang = langFor(filePathOrName);
  const mod = lang ? EXTRACTORS[lang] : null;
  if (!mod || typeof mod.extract !== 'function') return [];
  try {
    const out = mod.extract(src);
    return Array.isArray(out) ? out : [];
  } catch (_) {
    return [];
  }
}

module.exports = { extractFile, langFor };
