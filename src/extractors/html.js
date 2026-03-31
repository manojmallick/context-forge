'use strict';

/**
 * Extract signatures from HTML files.
 * Focuses on id/class attributes, forms, and script tags.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  // Page title
  const titleMatch = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) sigs.push(`title: ${titleMatch[1].trim()}`);

  // Forms with id/action
  for (const m of src.matchAll(/<form\s+([^>]*)>/gi)) {
    const attrs = m[1];
    const id = attrs.match(/id=["']?(\w+)/i);
    const action = attrs.match(/action=["']?([^"'\s>]+)/i);
    if (id) sigs.push(`form#${id[1]}${action ? ` action="${action[1]}"` : ''}`);
  }

  // Elements with id
  for (const m of src.matchAll(/<(\w+)\s+[^>]*id=["'](\w+)["'][^>]*>/gi)) {
    if (['html', 'head', 'body', 'script', 'style', 'link', 'meta'].includes(m[1].toLowerCase())) continue;
    sigs.push(`${m[1]}#${m[2]}`);
  }

  // Data attributes (data-component, data-controller etc)
  for (const m of src.matchAll(/data-(?:component|controller|view|page)=["'](\w[\w-]*)/gi)) {
    sigs.push(`data-${m[0].match(/data-(\w[\w-]*)/i)[1]}: ${m[1]}`);
  }

  return sigs.slice(0, 25);
}

module.exports = { extract };
