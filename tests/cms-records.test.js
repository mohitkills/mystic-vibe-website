import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderSwap, buildSlidePayload, mergeCatalogBySlug, normalizeInternalLink, normalizePersistentImageReference, saveCmsRecord } from '../js/cms-records.js';

function memoryClient() {
  const tables = new Map();
  let id = 0;
  return {
    tables,
    from(table) {
      const query = { table, mode: '', rowId: '', payload: null };
      const builder = {
        insert(payload) { query.mode = 'insert'; query.payload = payload; return builder; },
        update(payload) { query.mode = 'update'; query.payload = payload; return builder; },
        eq(key, value) { assert.equal(key, 'id'); query.rowId = value; return builder; },
        select() { return builder; },
        async maybeSingle() {
          const rows = tables.get(table) || [];
          if (query.mode === 'insert') {
            const row = { id: `id-${++id}`, ...query.payload };
            tables.set(table, [...rows, row]);
            return { data: { ...row }, error: null };
          }
          const index = rows.findIndex((row) => row.id === query.rowId);
          if (index < 0) return { data: null, error: null };
          rows[index] = { ...rows[index], ...query.payload };
          return { data: { ...rows[index] }, error: null };
        },
      };
      return builder;
    },
  };
}

test('a slide keeps one stable ID across three consecutive edits', async () => {
  const client = memoryClient();
  let saved = await saveCmsRecord(client, 'homepage_slides', 'id', '', { heading: 'First' });
  const stableId = saved.id;
  for (const heading of ['Second', 'Third', 'Fourth']) {
    saved = await saveCmsRecord(client, 'homepage_slides', 'id', stableId, { heading });
    assert.equal(saved.id, stableId);
  }
  assert.equal(client.tables.get('homepage_slides').length, 1);
  assert.equal(client.tables.get('homepage_slides')[0].heading, 'Fourth');
});

test('editing slide copy without an image selection preserves its saved private path', () => {
  const payload = buildSlidePayload({ heading: 'New heading', cta_link: '/collection.html', image_url: '' }, {
    image_url: 'mystic-vibe-images/slides/hero.png',
  }, 'https://mystic-vibe.example');
  assert.equal(payload.image_url, 'mystic-vibe-images/slides/hero.png');
});

test('slide links stay on site and malformed or external destinations are rejected', () => {
  assert.equal(normalizeInternalLink('collection.html?filter=fresh', 'https://mystic-vibe.example'), '/collection.html?filter=fresh');
  assert.throws(() => normalizeInternalLink('https://outside.example/collect', 'https://mystic-vibe.example'), /Mystic Vibe website/);
  assert.throws(() => normalizeInternalLink('javascript:alert(1)', 'https://mystic-vibe.example'), /Mystic Vibe website/);
});

test('slide payload validates required copy and integer order while preserving the private image on text edits', () => {
  const payload = buildSlidePayload({
    heading: '  Summer Notes  ', subtitle: 'A fresh arrival', cta_text: 'Shop',
    cta_link: '/collection.html?filter=all', image_url: '', sort_order: '4', is_published: true,
  }, { image_url: 'mystic-vibe-images/slides/hero.webp' }, 'https://mystic-vibe.example');
  assert.equal(payload.heading, 'Summer Notes');
  assert.equal(payload.image_url, 'mystic-vibe-images/slides/hero.webp');
  assert.equal(payload.sort_order, 4);
  assert.equal(payload.is_published, true);
  assert.throws(() => buildSlidePayload({ heading: '', sort_order: 0 }, null, 'https://mystic-vibe.example'), /slide name/);
  assert.throws(() => buildSlidePayload({ heading: 'Valid', sort_order: '1.5' }, null, 'https://mystic-vibe.example'), /whole number/);
});

test('hero slides persist one configurable CTA and an allowed transition style', () => {
  const payload = buildSlidePayload({
    heading: 'Royal Marine launch',
    cta_text: 'Buy Now',
    cta_link: '/products/royal-marine.html',
    image_url: 'mystic-vibe-images/slides/royal-marine.webp',
    sort_order: '2',
    transition_style: 'slide-left',
    is_published: true,
  }, null, 'https://mystic-vibe.example', 'https://project.supabase.co');

  assert.equal(payload.heading, 'Royal Marine launch');
  assert.equal(payload.cta_text, 'Buy Now');
  assert.equal(payload.cta_link, '/products/royal-marine.html');
  assert.equal(payload.image_url, 'mystic-vibe-images/slides/royal-marine.webp');
  assert.equal(payload.transition_style, 'slide-left');
  assert.equal(payload.subtitle, '');
  assert.throws(() => buildSlidePayload({
    heading: 'Missing image', cta_text: 'Explore', cta_link: '/collection.html',
    transition_style: 'fade', is_published: true,
  }, null, 'https://mystic-vibe.example', 'https://project.supabase.co'), /Upload a hero image/);
  assert.throws(() => buildSlidePayload({
    heading: 'Unknown animation', image_url: 'assets/images/hero-royal-marine.png',
    transition_style: 'spin', is_published: false,
  }, null, 'https://mystic-vibe.example'), /supported hero transition/);
  assert.throws(() => buildSlidePayload({
    heading: 'Too long', cta_text: 'X'.repeat(41), image_url: 'assets/images/hero-royal-marine.png',
    transition_style: 'fade', is_published: false,
  }, null, 'https://mystic-vibe.example'), /40 characters or fewer/);
});

test('persistent image references normalize private paths and reject temporary signed or blob URLs', () => {
  assert.equal(normalizePersistentImageReference('../assets/images/bottle.png'), 'assets/images/bottle.png');
  assert.equal(normalizePersistentImageReference('products/hero.png'), 'mystic-vibe-images/products/hero.png');
  assert.equal(normalizePersistentImageReference('https://images.example/hero.png?v=3'), 'https://images.example/hero.png?v=3');
  assert.equal(
    normalizePersistentImageReference('https://project.supabase.co/storage/v1/object/sign/mystic-vibe-images/products/hero.png?token=temporary', 'https://project.supabase.co'),
    'mystic-vibe-images/products/hero.png',
  );
  assert.throws(() => normalizePersistentImageReference('blob:https://mystic-vibe.example/object-id'), /Temporary or executable/);
  assert.throws(() => normalizePersistentImageReference('https://cdn.example/hero.png?X-Amz-Signature=temporary'), /Temporary signed/);
});

test('slide reorder swaps adjacent saved positions and keeps boundary clicks inert', () => {
  const rows = [
    { id: 'a', sort_order: 10 },
    { id: 'b', sort_order: 20 },
    { id: 'c', sort_order: 30 },
  ];
  assert.deepEqual(buildOrderSwap(rows, 'b', -1), [
    { id: 'b', sort_order: 10 }, { id: 'a', sort_order: 20 },
  ]);
  assert.deepEqual(buildOrderSwap(rows, 'a', -1), []);
  assert.deepEqual(buildOrderSwap(rows, 'c', 1), []);
});

test('live products merge over static products without deleting fallback slugs or duplicating', () => {
  const merged = mergeCatalogBySlug(
    [{ slug: 'royal-marine', price: 499 }, { slug: 'moon-velocity', price: 499 }],
    [{ slug: 'imagination', price: 699 }, { slug: 'royal-marine', price: 599 }],
  );
  assert.deepEqual(merged.map((product) => product.slug), ['royal-marine', 'moon-velocity', 'imagination']);
  assert.equal(merged[0].price, 599);
});

test('CMS persistence surfaces backend errors and refuses a silent empty result', async () => {
  const errorClient = { from() { return { insert() { return this; }, select() { return this; }, async maybeSingle() { return { data: null, error: { message: 'RLS denied' } }; } }; } };
  await assert.rejects(saveCmsRecord(errorClient, 'homepage_slides', 'id', '', { heading: 'Blocked' }), (error) => error.message === 'RLS denied');
  const emptyClient = { from() { return { update() { return this; }, eq() { return this; }, select() { return this; }, async maybeSingle() { return { data: null, error: null }; } }; } };
  await assert.rejects(saveCmsRecord(emptyClient, 'homepage_slides', 'id', 'missing', { heading: 'Not saved' }), /was not saved/);
  const staleClient = { from() { return { update() { return this; }, eq() { return this; }, select() { return this; }, async maybeSingle() { return { data: null, error: null }; } }; } };
  await assert.rejects(
    saveCmsRecord(staleClient, 'homepage_slides', 'id', 'stale', { heading: 'New copy' }, { expectedUpdatedAt: '2026-10-17T00:00:00Z' }),
    /changed since this form was loaded/,
  );
});
