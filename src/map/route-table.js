'use strict';

/**
 * HTTP route table extractor.
 * Detects routes in Express, Fastify, NestJS, Flask, FastAPI, Gin, Spring.
 *
 * @param {string[]} files — absolute file paths to analyze
 * @param {string}   cwd   — project root for relative path display
 * @returns {string} formatted markdown table (empty string if no routes found)
 */

const fs = require('fs');
const path = require('path');

const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PY_EXTS = new Set(['.py', '.pyw']);

function analyze(files, cwd) {
  const routes = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const rel = path.relative(cwd, filePath).replace(/\\/g, '/');
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { continue; }

    // -----------------------------------------------------------------------
    // Express / Fastify / Koa (JS/TS)
    // -----------------------------------------------------------------------
    if (JS_EXTS.has(ext)) {
      // app.get('/path', ...) / router.post('/path') / fastify.put('/path')
      const re1 = /\b(?:app|router|fastify|server|koa|instance)\.(get|post|put|patch|delete|head|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      let m;
      while ((m = re1.exec(content)) !== null) {
        routes.push({ method: m[1].toUpperCase(), path: m[2], file: rel });
      }

      // NestJS decorators: @Get('/path') @Post('/path')
      const re2 = /@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      while ((m = re2.exec(content)) !== null) {
        routes.push({ method: m[1].toUpperCase(), path: m[2], file: rel });
      }

      // NestJS: @Get() with no path
      const re3 = /@(Get|Post|Put|Patch|Delete)\s*\(\s*\)/g;
      while ((m = re3.exec(content)) !== null) {
        routes.push({ method: m[1].toUpperCase(), path: '/', file: rel });
      }
    }

    // -----------------------------------------------------------------------
    // Flask / FastAPI (Python)
    // -----------------------------------------------------------------------
    if (PY_EXTS.has(ext)) {
      // @app.route('/path', methods=['GET', 'POST'])
      const re1 = /@[\w.]+\.route\s*\(\s*['"]([^'"]+)['"]([\s\S]{0,150}?)\)/g;
      let m;
      while ((m = re1.exec(content)) !== null) {
        const routePath = m[1];
        const methodsMatch = m[2].match(/methods\s*=\s*\[([^\]]+)\]/);
        if (methodsMatch) {
          const methods = methodsMatch[1].match(/['"]([A-Z]+)['"]/g) || [];
          for (const meth of methods) {
            routes.push({ method: meth.replace(/['"]/g, ''), path: routePath, file: rel });
          }
        } else {
          routes.push({ method: 'GET', path: routePath, file: rel });
        }
      }

      // @app.get('/path')  @router.post('/path')  FastAPI style
      const re2 = /@[\w.]+\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/g;
      while ((m = re2.exec(content)) !== null) {
        routes.push({ method: m[1].toUpperCase(), path: m[2], file: rel });
      }
    }

    // -----------------------------------------------------------------------
    // Go — Gin / Echo / chi / net/http
    // -----------------------------------------------------------------------
    if (ext === '.go') {
      // r.GET("/path", handler)
      const re1 = /\b\w+\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*["']([^"']+)["']/g;
      let m;
      while ((m = re1.exec(content)) !== null) {
        routes.push({ method: m[1], path: m[2], file: rel });
      }
      // http.HandleFunc("/path", handler)
      const re2 = /http\.HandleFunc\s*\(\s*["']([^"']+)["']/g;
      while ((m = re2.exec(content)) !== null) {
        routes.push({ method: 'ANY', path: m[1], file: rel });
      }
    }

    // -----------------------------------------------------------------------
    // Spring (Java)
    // -----------------------------------------------------------------------
    if (ext === '.java') {
      // @GetMapping("/path") @PostMapping @RequestMapping
      const re1 = /@(Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g;
      let m;
      while ((m = re1.exec(content)) !== null) {
        const method = m[1] === 'Request' ? 'ANY' : m[1].toUpperCase();
        routes.push({ method, path: m[2], file: rel });
      }
    }
  }

  if (routes.length === 0) return '';

  const lines = [
    '| Method | Path | File |',
    '|--------|------|------|',
  ];
  for (const r of routes) {
    lines.push(`| ${r.method} | ${r.path} | ${r.file} |`);
  }
  return lines.join('\n');
}

module.exports = { analyze };
