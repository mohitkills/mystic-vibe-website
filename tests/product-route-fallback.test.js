import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('unmatched CMS product slugs use the shared product detail template', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const fallback = await read('products/_dynamic.html');
  const rule = (config.rewrites || []).find((item) => item.source === '/products/:slug.html');

  assert.ok(rule, 'product slug rewrite exists');
  assert.equal(rule.destination, '/products/_dynamic.html');
  assert.match(fallback, /data-page="product"/);
  assert.match(fallback, /location\.pathname\.split\(['"]\/['"]\)\.pop/);
  assert.match(fallback, /document\.body\.dataset\.product\s*=\s*slug/);
  assert.match(fallback, /js\/app\.js/);
});

test('dynamic product route extracts and validates a product slug from the visible URL', async () => {
  const fallback = await read('products/_dynamic.html');
  assert.ok(fallback.includes("filename.replace(/\\.html$/i, '')"));
  assert.ok(fallback.includes("if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))"));
  assert.ok(fallback.includes("document.body.dataset.product = slug"));
});
