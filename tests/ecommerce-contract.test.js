import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

async function collectJavaScriptFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await collectJavaScriptFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) found.push(fullPath);
  }
  return found;
}

test('all browser JavaScript modules parse before deployment', async () => {
  const jsRoot = path.join(root, 'js');
  const files = await collectJavaScriptFiles(jsRoot);
  assert.ok(files.length > 0, 'browser JavaScript files must be present');
  const failures = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) failures.push({
      file: path.relative(root, file),
      output: (result.stderr || result.stdout || 'Unknown parser error').trim(),
    });
  }
  assert.deepEqual(failures, [], 'JavaScript parse errors: ' + JSON.stringify(failures));
});

test('order migration has one ordered schema and four non-duplicated server functions', async () => {
  const sql = await read('supabase/migrations/20261017100000_ecommerce_orders.sql');
  for (const table of ['orders', 'order_items', 'coupons', 'coupon_redemptions', 'newsletter_subscribers']) {
    assert.match(sql, new RegExp('create table if not exists public\\.' + table + '\\b', 'i'));
    assert.match(sql, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
  }
  for (const fn of ['place_order', 'preview_checkout', 'lookup_order', 'admin_update_order', 'cancel_order', 'subscribe_newsletter']) {
    assert.equal((sql.match(new RegExp('create or replace function public\\.' + fn + '\\s*\\(', 'gi')) || []).length, 1, fn + ' must be defined once');
  }
  assert.equal((sql.match(/commit;/gi) || []).length, 1, 'migration is a single transaction');
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /where p\.slug\s*=\s*v_slug and p\.is_published is true[\s\S]*?for update/i);
  assert.match(sql, /set stock = stock - v_quantity/i);
  assert.match(sql, /v_product_image\s*:=\s*v_product\.image_urls\[1\]/i, 'products.image_urls is text[]; order creation must read its first array element');
  assert.doesNotMatch(sql, /jsonb_typeof\(v_product\.image_urls\)/i, 'do not treat products.image_urls as JSONB');
  assert.match(sql, /p_payment_method is distinct from 'cod'/i);
  assert.match(sql, /coupon_redemptions/);
  assert.match(sql, /private\.is_admin\(\)/);
  assert.match(sql, /revoke all on function public\.place_order/i);
  assert.match(sql, /grant execute on function public\.place_order/i);
});

test('checkout recalculates products, shipping and offers on the server before permitting order placement', async () => {
  const checkout = await read('js/checkout.js');
  const html = await read('checkout.html');
  assert.match(html, /type="module" src="js\/checkout\.js"/);
  assert.match(checkout, /supabase\.rpc\('preview_checkout'/);
  assert.match(checkout, /supabase\.rpc\('place_order'/);
  assert.match(checkout, /p_coupon_code:\s*checkoutState\.coupon/);
  assert.match(checkout, /checkoutState\.verified/);
  assert.match(checkout, /preview\.items/);
  assert.match(checkout, /value="cod"/);
  assert.match(checkout, /final total is rechecked when you place the order/i);
  assert.match(checkout, /function cartAvailability\(item\)/);
  assert.match(checkout, /function renderCheckoutLines\(cart, verifiedItems = null\)/);
  assert.match(checkout, /data-remove-checkout-item/);
  assert.match(checkout, /Remove these items here, or update their real stock in Admin/);
  assert.match(checkout, /subtotalNode\.textContent = '—'/, 'do not present an unverified total as final');
  assert.match(checkout, /await waitForStorefrontCatalog\(\)/);

});

test('storefront blocks out-of-stock products and cart quantities above current inventory', async () => {
  const app = await read('js/app.js');
  const checkout = await read('js/checkout.js');
  assert.match(app, /outOfStock\?' disabled aria-disabled="true"'/);
  assert.match(app, /This perfume is out of stock/);
  assert.match(app, /stock<currentQty\+q/);
  assert.match(app, /Only '\+Number\(product\.stock\)\+' available in stock/);
  assert.match(app, /Out of stock; remove this item to continue checkout/);
  assert.match(checkout, /function cartAvailability\(item\)/);
  assert.match(checkout, /data-remove-checkout-item/);
  assert.match(checkout, /checkoutErrorMessage\(cart, error\)/);
});

test('customer order history and guest order lookup are connected to the secured order backend', async () => {
  const account = await read('js/customer-account.js');
  const accountHtml = await read('account.html');
  const trackingHtml = await read('tracking.html');
  assert.match(accountHtml, /data-page="account"/);
  assert.match(accountHtml, /js\/customer-account\.js/);
  assert.match(trackingHtml, /data-page="tracking"/);
  assert.match(account, /supabase\.rpc\('lookup_order'/);
  assert.match(account, /supabase\.rpc\('cancel_order'/);
  assert.match(account, /supabase\.from\('orders'\)/);
  assert.match(account, /supabase\.from\('order_items'\)/);
  assert.match(account, /Track a guest order/);
});

test('Admin access gate has an independent timeout and explicit ready signal', async () => {
  const html = await read('admin.html');
  const admin = await read('js/admin.js');
  assert.match(html, /setTimeout\(\(\)\s*=>/);
  assert.match(html, /The admin workspace could not finish connecting/);
  assert.match(html, /mystic-vibe-admin-ready/);
  assert.match(admin, /function markAdminGateReady\(\)/);
  assert.match(admin, /window\.dispatchEvent\(new Event\('mystic-vibe-admin-ready'\)\)/);
  assert.match(admin, /markAdminGateReady\(\)/);
});

test('Admin exposes orders, promotions and store settings through connected modules', async () => {
  const html = await read('admin.html');
  const admin = await read('js/admin.js');
  const orders = await read('js/orders-admin.js');
  const coupons = await read('js/coupons-admin.js');
  const customers = await read('js/customers-admin.js');
  const marketing = await read('js/marketing-admin.js');
  const settings = await read('js/store-settings.js');
  for (const tab of ['products', 'orders', 'customers', 'coupons', 'marketing', 'collections', 'slides', 'content', 'media', 'settings']) {
    assert.match(html, new RegExp('data-tab="' + tab + '"'));
    assert.match(html, new RegExp('data-panel="' + tab + '"'));
  }
  assert.match(admin, /load:\s*\(\)\s*=>\s*import\('\.\/orders-admin\.js'\)/);
  assert.match(admin, /initialize:\s*'initializeOrdersAdmin'/);
  assert.match(admin, /load:\s*\(\)\s*=>\s*import\('\.\/coupons-admin\.js'\)/);
  assert.match(admin, /initialize:\s*'initializeCouponsAdmin'/);
  assert.match(admin, /load:\s*\(\)\s*=>\s*import\('\.\/customers-admin\.js'\)/);
  assert.match(admin, /initialize:\s*'initializeCustomersAdmin'/);
  assert.match(admin, /load:\s*\(\)\s*=>\s*import\('\.\/marketing-admin\.js'\)/);
  assert.match(admin, /initialize:\s*'initializeMarketingAdmin'/);
  assert.match(marketing, /newsletter_subscribers/);
  assert.match(customers, /supabase\.from\('orders'\)/);
  assert.match(customers, /Export CSV/);
  assert.match(admin, /load:\s*\(\)\s*=>\s*import\('\.\/store-settings\.js'\)/);
  assert.match(admin, /initialize:\s*'initializeStoreSettings'/);
  assert.match(admin, /Promise\.allSettled\(optionalModules\.map/);
  assert.match(orders, /admin_update_order/);
  assert.match(coupons, /coupon_redemptions|coupons/);
  assert.match(settings, /store\.shipping/);
  assert.match(settings, /store\.contact/);
});

test('newsletter signups are stored through a restricted server function and managed by Admin', async () => {
  const migration = await read('supabase/migrations/20261017100000_ecommerce_orders.sql');
  const script = await read('js/newsletter.js');
  const index = await read('index.html');
  const marketing = await read('js/marketing-admin.js');
  assert.match(index, /js\/newsletter\.js/);
  assert.match(script, /supabase\.rpc\('subscribe_newsletter'/);
  assert.match(migration, /revoke all on table public\.newsletter_subscribers from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.subscribe_newsletter\(text, text\) to anon, authenticated/i);
  assert.match(marketing, /newsletter_subscribers/);
});

test('legacy page guards do not suppress the live checkout, tracking and newsletter modules', async () => {
  const app = await read('js/app.js');
  const checkout = await read('js/checkout.js');
  const account = await read('js/customer-account.js');
  const newsletter = await read('js/newsletter.js');
  assert.equal(app.includes('form.replaceWith(panel)'), false, 'legacy checkout guard must not replace module-rendered checkout');
  assert.equal(app.includes('Live order tracking is not connected yet'), false, 'legacy tracking fallback must not replace the live tracking UI');
  assert.equal(app.includes("event.target.id==='checkout-form'||event.target.id==='track-form'"), false, 'no document capture handler may suppress checkout/tracking submits');
  assert.ok(checkout.includes('event.stopImmediatePropagation()'), 'checkout handles its own submit without bubbling to legacy handlers');
  assert.ok(account.includes('event.stopImmediatePropagation()'), 'tracking handles its own submit without bubbling to legacy handlers');
  assert.ok(newsletter.includes('event.stopPropagation()'), 'newsletter handles its own submit without legacy override');
});
test('homepage slider consumes published CMS slides and replays data when sync finishes early', async () => {
  const premium = await read('js/premium-home.js');
  const sync = await read('js/storefront-sync.js');
  assert.match(premium, /Array\.isArray\(data\.slides\)/);
  assert.match(premium, /slides=incoming/);
  assert.match(premium, /Array\.isArray\(window\.MV_HOMEPAGE_SLIDES\)/);
  assert.match(premium, /dispatchEvent\(new CustomEvent\('mystic-vibe-storefront-data'/);
  assert.match(sync, /readPublished\('homepage_slides'\)/);
  assert.match(sync, /window\.MV_HOMEPAGE_SLIDES = await hydrateSlideImages\(publishedSlides\)/);
  assert.match(sync, /window\.MV_STOREFRONT_CMS_CONNECTED = Array\.isArray\(products\)/);
  assert.match(sync, /mergeCatalogBySlug\(\[\], mappedProducts/);
});
