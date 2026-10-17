import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

test('order migration has one ordered schema and four non-duplicated server functions', async () => {
  const sql = await read('supabase/migrations/20261017100000_ecommerce_orders.sql');
  for (const table of ['orders', 'order_items', 'coupons', 'coupon_redemptions']) {
    assert.match(sql, new RegExp('create table if not exists public\\.' + table + '\\b', 'i'));
    assert.match(sql, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
  }
  for (const fn of ['place_order', 'preview_checkout', 'lookup_order', 'admin_update_order']) {
    assert.equal((sql.match(new RegExp('create or replace function public\\.' + fn + '\\s*\\(', 'gi')) || []).length, 1, fn + ' must be defined once');
  }
  assert.equal((sql.match(/commit;/gi) || []).length, 1, 'migration is a single transaction');
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /where p\.slug\s*=\s*v_slug and p\.is_published is true[\s\S]*?for update/i);
  assert.match(sql, /set stock = stock - v_quantity/i);
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
});

test('customer order history and guest order lookup are connected to the secured order backend', async () => {
  const account = await read('js/customer-account.js');
  const accountHtml = await read('account.html');
  const trackingHtml = await read('tracking.html');
  assert.match(accountHtml, /data-page="account"/);
  assert.match(accountHtml, /js\/customer-account\.js/);
  assert.match(trackingHtml, /data-page="tracking"/);
  assert.match(account, /supabase\.rpc\('lookup_order'/);
  assert.match(account, /supabase\.from\('orders'\)/);
  assert.match(account, /supabase\.from\('order_items'\)/);
  assert.match(account, /Track a guest order/);
});

test('Admin exposes orders, promotions and store settings through connected modules', async () => {
  const html = await read('admin.html');
  const admin = await read('js/admin.js');
  const orders = await read('js/orders-admin.js');
  const coupons = await read('js/coupons-admin.js');
  const customers = await read('js/customers-admin.js');
  const settings = await read('js/store-settings.js');
  for (const tab of ['products', 'orders', 'customers', 'coupons', 'collections', 'slides', 'content', 'media', 'settings']) {
    assert.match(html, new RegExp('data-tab="' + tab + '"'));
    assert.match(html, new RegExp('data-panel="' + tab + '"'));
  }
  assert.match(admin, /initializeOrdersAdmin\(supabase\)/);
  assert.match(admin, /initializeCouponsAdmin\(supabase\)/);
  assert.match(admin, /initializeCustomersAdmin\(supabase\)/);
  assert.match(customers, /supabase\.from\('orders'\)/);
  assert.match(customers, /Export CSV/);
  assert.match(admin, /initializeStoreSettings\(supabase\)/);
  assert.match(orders, /admin_update_order/);
  assert.match(coupons, /coupon_redemptions|coupons/);
  assert.match(settings, /store\.shipping/);
  assert.match(settings, /store\.contact/);
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
});
