import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('motion UI loads before the existing Supabase storefront hydration', async () => {
  const app = await read('js/app.js');
  assert.match(app, /window\.MV_STOREFRONT_LOADING=true/);
  assert.ok(app.indexOf('js/motion-ui.js') < app.indexOf('js/storefront-sync.js'));
  assert.match(app, /mv:storefront-load-failed/);
});

test('scroll reveal supports dynamic cards and uses one shared observer', async () => {
  const js = await read('js/motion-ui.js');
  const css = await read('css/motion-ui.css');
  assert.match(js, /window\.initReveal = initReveal/);
  assert.match(js, /new MutationObserver/);
  assert.equal((js.match(/new IntersectionObserver/g) || []).length, 1);
  assert.match(css, /\[data-reveal\]/);
  assert.match(css, /transition-property:\s*opacity,\s*transform/);
});

test('pointer-driven effects are restricted to fine hover pointers', async () => {
  const js = await read('js/motion-ui.js');
  const css = await read('css/motion-ui.css');
  assert.match(js, /hover: hover.*pointer: fine/);
  assert.match(js, /if \(!finePointer\(\)\) return/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(js, /data-tilt/);
  assert.match(js, /data-magnetic/);
});

test('fly-to-cart animates only transform and opacity and does not write cart data', async () => {
  const js = await read('js/motion-ui.js');
  assert.match(js, /function flyToCart/);
  assert.match(js, /transition: 'transform 660ms[^']*opacity 660ms/);
  assert.match(js, /savedCartQuantity\(\) > before/);
  assert.match(js, /document\.addEventListener\('click',[\s\S]*?\}, true\);/);
  assert.doesNotMatch(js, /transition:\s*'[^']*(?:left|top|width|height)\s*:/);
  assert.doesNotMatch(js, /localStorage\.setItem\s*\(\s*['"]mv_cart/);
});

test('cart drawer exposes modal semantics, traps focus and closes with Escape', async () => {
  const js = await read('js/motion-ui.js');
  const css = await read('css/motion-ui.css');
  assert.match(js, /setAttribute\('role', 'dialog'\)/);
  assert.match(js, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /drawer\.contains\(document\.activeElement\)/);
  assert.match(css, /\.mv-cart-drawer\.is-open/);
  assert.match(css, /\.mv-cart-scrim\.is-open/);
});

test('Supabase loading skeletons overlay existing cards without affecting layout', async () => {
  const js = await read('js/motion-ui.js');
  const css = await read('css/motion-ui.css');
  assert.match(js, /function addSkeletonOverlay/);
  assert.match(js, /skel-media/);
  assert.equal((js.match(/class="skel /g) || []).length, 4);
  assert.match(js, /index % 4\) \* 70/);
  assert.match(css, /\.mv-skeleton-overlay\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/s);
  assert.match(css, /@keyframes mv-skeleton-shimmer/);
  assert.match(css, /to\s*\{\s*transform:\s*translateX/);
});

test('view transitions, header compaction, wishlist feedback and image zoom are present', async () => {
  const js = await read('js/motion-ui.js');
  const css = await read('css/motion-ui.css');
  assert.match(js, /document\.startViewTransition/);
  assert.match(css, /@view-transition\s*\{\s*navigation:\s*auto/s);
  assert.match(js, /mv-header-condensed/);
  assert.match(js, /mv-wish-pop/);
  assert.match(css, /scale\(1\.06\)/);
});

test('motion preference is respected in both script and stylesheet', async () => {
  const js = await read('js/motion-ui.js');
  const css = await read('css/motion-ui.css');
  assert.match(js, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\[data-reveal\]\s*\{[^}]*opacity:\s*1\s*!important/s);
});

test('new interaction layer uses one delegated click listener', async () => {
  const js = await read('js/motion-ui.js');
  assert.equal((js.match(/document\.addEventListener\('click'/g) || []).length, 1);
});