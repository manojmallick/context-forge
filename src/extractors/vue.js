'use strict';

/**
 * Extract signatures from Vue single-file components.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  // Extract component name from filename hint if present or defineComponent
  const nameMatch = src.match(/name\s*:\s*['"](\w+)['"]/);
  if (nameMatch) sigs.push(`component ${nameMatch[1]}`);

  // Extract <script> block
  const scriptMatch = src.match(/<script(?:\s[^>]*)?>(?:\s*)([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return sigs;

  const script = scriptMatch[1]
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Props
  const propsMatch = script.match(/props\s*:\s*(\{[\s\S]*?\})/);
  if (propsMatch) {
    const propNames = [];
    for (const m of propsMatch[1].matchAll(/^\s+(\w+)\s*:/gm)) {
      propNames.push(m[1]);
    }
    if (propNames.length > 0) sigs.push(`props: [${propNames.join(', ')}]`);
  }

  // Methods in options API
  const methodsMatch = script.match(/methods\s*:\s*\{([\s\S]*?)\},?\s*(?:computed|watch|mounted|created|data|\})/);
  if (methodsMatch) {
    for (const m of methodsMatch[1].matchAll(/^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{=\n]+))?/gm)) {
      if (m[1].startsWith('_')) continue;
      const asyncKw = m[0].includes('async') ? 'async ' : '';
      const retStr = m[3] ? ` → ${normalizeType(m[3])}` : '';
      sigs.push(`  ${asyncKw}${m[1]}(${normalizeParams(m[2])})${retStr}`);
    }
  }

  // Top-level functions in <script> (e.g., composition API helpers)
  for (const m of script.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{=\n]+))?/gm)) {
    if (m[1].startsWith('_')) continue;
    const asyncKw = m[0].includes('async') ? 'async ' : '';
    const retStr = m[3] ? ` → ${normalizeType(m[3])}` : '';
    sigs.push(`${asyncKw}function ${m[1]}(${normalizeParams(m[2])})${retStr}`);
  }

  // defineProps (Composition API)
  const definePropsMatch = script.match(/defineProps(?:<[^>]*>)?\s*\(\s*(\{[\s\S]*?\})\s*\)/);
  if (definePropsMatch) {
    const propNames = [];
    for (const m of definePropsMatch[1].matchAll(/^\s+(\w+)\s*:/gm)) {
      propNames.push(m[1]);
    }
    if (propNames.length > 0) sigs.push(`defineProps: [${propNames.join(', ')}]`);
  }

  // Emits
  const emitsMatch = script.match(/(?:defineEmits|emits)\s*(?::\s*|\(\s*)(\[[\s\S]*?\])/);
  if (emitsMatch) sigs.push(`emits: ${emitsMatch[1].replace(/\s+/g, ' ')}`);

  return sigs.slice(0, 25);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

function normalizeType(type) {
  if (!type) return '';
  return type.trim().replace(/[;\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 25);
}

module.exports = { extract };
