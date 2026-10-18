import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
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
  const files = await collectJavaScriptFiles(path.join(root, 'js'));
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

test('Admin native select options keep readable contrast in Windows dropdown popups', async () => {
  const html = await read('admin.html');
  const css = await read('css/admin.css');
  assert.match(html, /<body class="admin-page">/);
  assert.match(css, /\.admin-page\s*\{\s*color-scheme:\s*dark;/);
  assert.match(css, /\.admin-page select option,[\s\S]*?color:\s*#f7f5ef !important;[\s\S]*?background-color:\s*#171a20 !important;/);
  assert.match(css, /\.admin-page select option:checked,[\s\S]*?background-color:\s*#d4b05b !important;/);
  assert.match(css, /\.admin-page select option:disabled/);
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

test('Admin reports module import failure details instead of leaving a section stuck loading', async () => {
  const admin = await read('js/admin.js');
  assert.match(admin, /const firstFailure = failedFeatures\[0\]\?\.error/);
  assert.match(admin, /firstFailure\?\.message/);
  assert.match(admin, /failedFeatures\.map\(\(feature\) => feature\.label\)/);
});

test('Team Access is owner-gated and backed by server-only admin management functions', async () => {
  const html = await read('admin.html');
  const admin = await read('js/admin.js');
  const team = await read('js/team-access-admin.js');
  const edge = await read('supabase/functions/admin-team-access/index.ts');
  const migration = await read('supabase/migrations/20261018103000_team_access_management.sql');

  assert.match(html, /data-tab="team"/);
  assert.match(html, /data-panel="team"/);
  assert.match(html, /id="team-invite-form"/);
  assert.match(html, /id="team-member-list"/);
  assert.match(admin, /import\('\.\/team-access-admin\.js'\)/);
  assert.match(admin, /initialize: 'initializeTeamAccessAdmin'/);
  assert.match(team, /functions\.invoke\('admin-team-access'/);
  assert.match(team, /data-revoke-user-id/);
  assert.match(edge, /new Response\(null, \{ status: 204, headers: CORS_HEADERS \}\)/, 'OPTIONS preflight must return an empty 204 response');
  assert.doesNotMatch(edge, /new Response\(['"]ok['"], \{ status: 204/, '204 responses cannot include a body');
  assert.match(edge, /auth\.getUser\(token\)/);
  assert.match(edge, /rpc\('is_current_user_owner'\)/);
  assert.match(edge, /auth\.admin\.inviteUserByEmail/);
  assert.match(edge, /admin_team_set_access/);
  assert.match(edge, /targetId === user\.id/);
  assert.match(migration, /role in \('owner', 'admin'\)/i);
  assert.match(migration, /grant execute on function public\.admin_team_set_access\(uuid, boolean\) to service_role/i);
  assert.match(migration, /revoke all on function public\.admin_team_set_access\(uuid, boolean\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.is_current_user_owner\(\) to authenticated/i);
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

test('FAQ question and answer text remains readable in the light gradient theme', async () => {
  const app = await read('js/app.js');
  const theme = await read('css/theme-system.css');
  assert.ok(app.includes("function faqHtml()"));
  assert.ok(theme.includes('.faq-item > button'));
  assert.ok(theme.includes('-webkit-text-fill-color: #191919 !important'));
  assert.ok(theme.includes('.faq-item .faq-answer'));
  assert.ok(theme.includes('-webkit-text-fill-color: #575148 !important'));
});

test('Mobile action icons move out of the header into a fixed dock beside contact and restore on desktop', async () => {
  const app = await read('js/app.js');
  const theme = await read('css/theme-system.css');
  assert.ok(app.includes("window.matchMedia('(max-width: 760px)').matches"));
  assert.ok(app.includes("document.body.appendChild(navActions)"));
  assert.ok(app.includes("navActions.classList.add('mobile-floating-actions')"));
  assert.ok(app.includes("navActionsSlot.parentNode.insertBefore(navActions,navActionsSlot.nextSibling)"));
  assert.ok(theme.includes('body:not([data-theme="dark"]) .mobile-floating-actions'));
  assert.ok(theme.includes('right: calc(68px + env(safe-area-inset-right, 0px)) !important'));
  assert.ok(theme.includes('right: calc(12px + env(safe-area-inset-right, 0px)) !important'));
  assert.ok(theme.includes('body:not([data-theme="dark"]) .mobile-floating-actions .account-menu-panel'));
  assert.ok(theme.includes('max-width: 340px'));
});

test('Floating contact icon stays visible and safely falls back to the Contact page when WhatsApp is not configured', async () => {
  const app = await read('js/app.js');
  const sync = await read('js/storefront-sync.js');
  const theme = await read('css/theme-system.css');
  assert.ok(app.includes('class="whatsapp-float"'));
  assert.ok(app.includes('aria-label="Contact Mystic Vibe" title="Contact Mystic Vibe">☎'));
  assert.ok(sync.includes('Always keep the floating contact action available'));
  assert.ok(sync.includes('whatsapp.hidden = false'));
  assert.ok(sync.includes("new URL('../contact.html', import.meta.url).href"));
  assert.ok(sync.includes("whatsapp.href = 'https://wa.me/' + phone"));
  assert.ok(theme.includes('.whatsapp-float:not([hidden])'));
});

test('Mobile header menu opens as a readable glass grid and account actions dock beside contact', async () => {
  const app = await read('js/app.js');
  const theme = await read('css/theme-system.css');
  assert.ok(app.includes("navLinks.classList.toggle('open')"));
  assert.ok(theme.includes('.site-header > .nav .nav-links.open'));
  assert.ok(theme.includes('background: rgba(255,255,255,.97) !important'));
  assert.ok(theme.includes('.site-header > .nav > .nav-actions'));
  assert.ok(theme.includes('right: 68px !important'));
  assert.ok(theme.includes('.account-menu-panel'));
  assert.ok(theme.includes('bottom: calc(100% + 9px) !important'));
  assert.ok(theme.includes('.whatsapp-float:not([hidden])'));
});

test('Global glass background and category tiles match the beige-mint-lavender reference', async () => {
  const theme = await read('css/theme-system.css');
  const adminCss = await read('css/admin.css');
  assert.ok(theme.includes('linear-gradient(108deg'));
  assert.ok(theme.includes('#EFE8D7'));
  assert.ok(theme.includes('#F0F5F0'));
  assert.ok(theme.includes('#E9E6F1'));
  assert.ok(theme.includes('.ivory-category-card:nth-child(3n+1)'));
  assert.ok(theme.includes('.ivory-category-card:nth-child(3n+2)'));
  assert.ok(theme.includes('.ivory-category-card:nth-child(3n)'));
  assert.ok(theme.includes('.ivory-category-index'));
  assert.ok(theme.includes('display: none !important'));
  assert.ok(theme.includes('backdrop-filter: blur(18px) saturate(135%)'));
  assert.ok(adminCss.includes('linear-gradient(108deg'));
  assert.ok(adminCss.includes('#F0F5F0'));
  assert.ok(adminCss.includes('#E9E6F1'));
});

test('Homepage places Shop by category below Find your fragrance family with glass fill hover animation', async () => {
  const home = await read('js/premium-home.js');
  const css = await read('css/theme-system.css');
  const signatures = home.indexOf('id="signatures"');
  const family = home.indexOf('id="families"');
  const categories = home.indexOf('id="categories"');
  const newArrivals = home.indexOf('id="new"');
  assert.ok(signatures >= 0 && family > signatures && categories > family && newArrivals > categories,
    'homepage order must place fragrance families before category tiles and both before new arrivals');
  assert.match(css, /\.ivory-category-card:hover::before/);
  assert.match(css, /clip-path: circle\(145% at 50% 50%\)/);
  assert.match(css, /\.ivory-category-card:hover::after/);
  assert.match(css, /left: 135%/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('Admin light buttons use readable dark text before hover, on focus and while disabled', async () => {
  const css = await read('css/admin.css');
  assert.match(css, /body\.admin-page \.admin-main button\.btn\.light,[\s\S]*?-webkit-text-fill-color: #292620 !important/);
  assert.match(css, /body\.admin-page \.admin-main button\.btn\.light:hover[\s\S]*?background: rgba\(180,154,96,\.18\) !important/);
  assert.match(css, /body\.admin-page \.admin-main button\.btn\.light:disabled[\s\S]*?color: #575148 !important/);
  assert.ok(css.includes('body.admin-page .admin-topbar a.btn.light'));
});

test('Reference ivory-glass theme is bright-only, readable, and preserves storefront integrations', async () => {
  const home = await read('js/premium-home.js');
  const theme = await read('css/theme-system.css');
  const adminCss = await read('css/admin.css');
  const themeScript = await read('js/theme-system.js');
  const app = await read('js/app.js');
  const sync = await read('js/storefront-sync.js');
  assert.ok(theme.includes('--iv-bg:#F8F7F3'));
  assert.ok(theme.includes('--iv-gd:#B49A60'));
  assert.ok(theme.includes('justify-content: center !important'));
  assert.ok(theme.includes('.product-actions > .icon-btn[data-wish]'));
  assert.ok(theme.includes('z-index: 1100 !important'));
  assert.ok(theme.includes('premium-hero-content'));
  assert.ok(theme.includes('premium-slide-controls .premium-slide-arrow'));
  assert.ok(adminCss.includes('body.admin-page select option'));
  assert.ok(adminCss.includes('Admin contrast repair'));
  assert.ok(themeScript.includes("document.body.dataset.theme='light'"));
  assert.ok(themeScript.includes("localStorage.removeItem('mv_theme_v2')"));
  assert.ok(!themeScript.includes('setTheme(document.body.dataset.theme'));
  assert.ok(app.includes('<strong class="serif">Mystic Vibe</strong>'));
  assert.ok(!app.includes('<small>FINE FRAGRANCES</small>'));
  assert.ok(app.includes('data-site-search-input name="search"'));
  assert.ok(app.includes('data-account-toggle'));
  assert.ok(sync.includes("readPublished('homepage_slides')"));
  assert.ok(home.includes('var fallbackSlides=['));
  assert.ok(home.includes('slides=completeSlides(incoming)'));
  const heroMarkupEnd = home.indexOf('signature-strip', home.indexOf('root.innerHTML='));
  assert.ok(heroMarkupEnd > 0);
  const heroMarkup = home.slice(home.indexOf('root.innerHTML='), heroMarkupEnd);
  assert.ok(!heroMarkup.includes('<h1'));
  assert.ok(!heroMarkup.includes('premium-hero-heading'));
  assert.ok(!heroMarkup.includes('premium-hero-description'));
  assert.ok(!heroMarkup.includes('>Explore</a>'));
});

test('Storefront header exposes live product search and a profile menu with secure settings and logout', async () => {
  const app = await read('js/app.js');
  const auth = await read('js/auth.js');
  const menu = await read('js/site-account-menu.js');
  const searchCss = await read('css/premium.css');
  assert.ok(app.includes('data-site-search role="search"'));
  assert.ok(app.includes('data-site-search-input name="search"'));
  assert.ok(app.includes('searchCatalogProducts(searchQuery)'));
  assert.ok(app.includes("new URLSearchParams(location.search).get('search')"));
  assert.ok(app.includes('data-account-toggle'));
  assert.ok(app.includes('js/site-account-menu.js'));
  assert.ok(auth.includes("new URL('/account.html', location.origin)"));
  assert.ok(!auth.includes("supabase.auth.signOut({ scope: 'local' })"), 'account/profile navigation must not silently sign out');
  assert.ok(menu.includes('Profile Settings'));
  assert.ok(menu.includes('My Orders'));
  assert.ok(menu.includes('supabase.auth.signOut'));
  assert.ok(searchCss.includes('.site-search-suggestions[hidden], .account-menu-panel[hidden]'));
  assert.ok(searchCss.includes('.site-search-suggestions'));
});

test('Profile Settings updates authenticated user metadata and optionally changes password', async () => {
  const html = await read('profile-settings.html');
  const script = await read('js/profile-settings.js');
  assert.ok(html.includes('data-page="profile-settings"'));
  assert.ok(html.includes('js/profile-settings.js'));
  assert.ok(script.includes('supabase.auth.getUser()'));
  assert.ok(script.includes('supabase.auth.updateUser(payload)'));
  assert.ok(script.includes('first_name: firstName'));
  assert.ok(script.includes('last_name: lastName'));
  assert.ok(script.includes('payload.password = password'));
  assert.ok(script.includes('password !== confirmPassword'));
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
test('Admin product categories save through Supabase and power the storefront category navigation', async () => {
  const html = await read('admin.html');
  const admin = await read('js/admin.js');
  const sync = await read('js/storefront-sync.js');
  const app = await read('js/app.js');
  const migration = await read('supabase/migrations/20261018075000_storefront_product_categories.sql');

  assert.match(html, /select name="storefront_category" required/);
  for (const category of ['deals', 'bestsellers', 'perfumes', 'fresh-aquatic', 'woody-amber', 'fruity-floral', 'new-arrivals', 'gift-sets']) {
    assert.match(html, new RegExp('value="' + category + '"'));
    assert.match(migration, new RegExp("'" + category + "'"));
  }
  assert.match(html, /id="product-filter-category"/);
  assert.match(admin, /storefront_category: formValue\(form, 'storefront_category'\)/);
  assert.match(admin, /product\.storefront_category !== categoryFilter/);
  assert.match(sync, /product\.storefront_category = row\.storefront_category/);
  assert.match(sync, /product\.storefront_category_label/);
  assert.match(app, /p\.storefront_category===filter/);
  assert.match(app, /p\.storefront_category==='deals'/);
  assert.match(app, /p\.storefront_category==='bestsellers'/);
  assert.match(app, /p\.storefront_category==='new-arrivals'/);
  assert.match(migration, /add column if not exists storefront_category text/i);
  assert.match(migration, /update public\.products[\s\S]*fragrance_family/i);
  assert.match(migration, /storefront_category_check/);
});

test('homepage has exactly one image-first hero, one configurable CTA and animated buffered slides', async () => {
  const premium = await read('js/premium-home.js');
  const sync = await read('js/storefront-sync.js');
  const html = await read('admin.html');
  const homeHtml = await read('index.html');
  const css = await read('css/premium.css');
  const cms = await read('js/cms-records.js');
  const admin = await read('js/admin.js');
  const migration = await read('supabase/migrations/20261018100000_hero_slider_transition_styles.sql');

  assert.equal((premium.match(/class="premium-hero"/g) || []).length, 1, 'only one hero section is rendered');
  assert.equal((premium.match(/premium-hero-actions"><a/g) || []).length, 1, 'only one CTA is rendered');
  assert.equal((homeHtml.match(/js\/premium-home\.js/g) || []).length, 1, 'hero controller is loaded once');
  assert.doesNotMatch(premium, /Discover Signatures|<h1 class="serif">Every Scent/);
  assert.match(premium, /className='premium-slide-controls'/, 'visitors get matching slide navigation controls');
  assert.match(premium, /setAttribute\('aria-label','Previous slide'\)/);
  assert.match(premium, /setAttribute\('aria-label','Next slide'\)/);
  assert.match(premium, /data-hero-dot/);
  assert.match(premium, /controls\.hidden=slides\.length<2/, 'controls remain tied to the current slide deck');
  assert.match(premium, /var fallbackSlides=\[/, 'a fallback slide deck keeps controls operational while CMS data loads');
  assert.match(premium, /slides=completeSlides\(incoming\)/, 'a lone CMS slide is supplemented for manual navigation');
  assert.match(premium, /hero\.dataset\.sliderInitialized==='true'/, 'repeat initialization is guarded');
  assert.match(premium, /inactiveImage=document\.createElement\('img'\)/, 'next image uses a separate buffered layer');
  assert.match(premium, /probe\.onload=function\(\)/);
  assert.match(premium, /probe\.onerror=function\(\)/);
  assert.match(premium, /finishTransition\(request,oldImage,incomingImage,alt\)/);
  assert.match(premium, /slide\.transition_style\s*\|\|\s*'fade'/);
  assert.match(premium, /cta_text/);
  assert.match(premium, /cta_link/);
  assert.match(premium, /showFallback\(\)/);
  assert.match(premium, /showFallback\(\);\s*hero\.addEventListener\('mouseenter'/, 'fallback carousel starts before the CMS response');
  const homeRefresh = sync.slice(sync.indexOf('function rerenderImagePage()'), sync.indexOf('function dispatchStorefrontData()'));
  assert.match(homeRefresh, /if \(page === 'home'\) return;/, 'CMS refresh must preserve the single premium hero');
  assert.doesNotMatch(homeRefresh, /renderMysticVibeHome/, 'CMS refresh must not restore the legacy multi-slide hero');
  assert.match(sync, /readPublished\('homepage_slides'\)/);
  assert.match(sync, /window\.MV_HOMEPAGE_SLIDES = await hydrateSlideImages\(publishedSlides\)/);
  assert.match(sync, /window\.MV_STOREFRONT_CMS_CONNECTED = Array\.isArray\(products\)/);
  assert.match(sync, /mergeCatalogBySlug\(\[\], mappedProducts/);
  assert.match(html, /Slide transition<select name="transition_style"/);
  assert.match(html, /Button text<input name="cta_text"/);
  assert.match(html, /Button destination<input name="cta_link"/);
  assert.match(html, /Claim Now/);
  assert.match(html, /New slide/);
  assert.match(html, /Duplicate/);
  assert.match(html, /Move up/);
  assert.doesNotMatch(html, /Subtitle<input name="subtitle"/);
  assert.match(admin, /transition_style: formValue\(form, 'transition_style'\)/);
  assert.match(admin, /'transition_style'\]\.map/);
  assert.match(cms, /transition_style:\s*transitionStyle/);
  assert.match(css, /\.premium-hero-media img\.premium-hero-image\.hero-transition-slide-left/);
  assert.match(css, /@keyframes mvHeroFade/);
  assert.match(css, /@keyframes mvHeroSlideLeft/);
  assert.match(css, /@keyframes mvHeroSlideUp/);
  assert.match(css, /@keyframes mvHeroZoom/);
  assert.match(migration, /add column if not exists transition_style text not null default 'fade'/i);
  assert.match(migration, /check \(transition_style in \('fade', 'slide-left', 'slide-up', 'zoom'\)\)/i);
});

test('hero controller rotates two slides in one image area and updates only the configured CTA', async () => {
  const source = await read('js/premium-home.js');
  const controllerStart = source.lastIndexOf("(function(){\n  if(!document.body || document.body.dataset.page!=='home') return;");
  assert.ok(controllerStart >= 0, 'hero controller IIFE must exist');
  const controller = source.slice(controllerStart);

  function fakeClassList() {
    const values = new Set();
    return {
      add: (...items) => items.forEach((item) => values.add(item)),
      remove: (...items) => items.forEach((item) => values.delete(item)),
      contains: (item) => values.has(item),
      toggle: (item, force) => {
        if (force === undefined ? !values.has(item) : force) values.add(item);
        else values.delete(item);
        return values.has(item);
      },
    };
  }

  function fakeElement(tagName) {
    const attributes = new Map();
    const handlers = new Map();
    let src = '';
    const element = {
      tagName,
      dataset: {},
      style: {},
      classList: fakeClassList(),
      children: [],
      parentElement: null,
      textContent: '',
      href: '',
      alt: '',
      decoding: '',
      draggable: true,
      complete: true,
      naturalWidth: 120,
      get offsetWidth() { return 100; },
      get src() { return src; },
      set src(value) {
        src = String(value || '');
        if (src) attributes.set('src', src);
        else attributes.delete('src');
        if (typeof element.onload === 'function' && !src.includes('broken')) element.onload();
        else if (typeof element.onerror === 'function' && src.includes('broken')) element.onerror();
      },
      getAttribute(name) {
        if (name === 'src') return src || null;
        if (name === 'href') return element.href || attributes.get(name) || null;
        return attributes.has(name) ? attributes.get(name) : null;
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
        if (name === 'href') element.href = String(value);
      },
      removeAttribute(name) {
        attributes.delete(name);
        if (name === 'src') src = '';
        if (name === 'aria-hidden') attributes.delete(name);
      },
      addEventListener(name, callback, options = {}) {
        const current = handlers.get(name) || [];
        current.push({ callback, once: Boolean(options.once) });
        handlers.set(name, current);
      },
      dispatch(name) {
        const current = handlers.get(name) || [];
        for (const entry of [...current]) {
          entry.callback({ type: name, target: element });
          if (entry.once) handlers.set(name, (handlers.get(name) || []).filter((candidate) => candidate !== entry));
        }
      },
      append(...items) {
        for (const item of items) {
          item.parentElement = element;
          element.children.push(item);
        }
      },
      replaceChildren(...items) {
        element.children.forEach((child) => { child.parentElement = null; });
        element.children = [];
        element.append(...items);
      },
    };
    return element;
  }

  const image = fakeElement('img');
  image.src = 'assets/images/hero-royal-marine.png';
  image.alt = 'Default fragrance';
  const media = fakeElement('div');
  media.append(image);
  media.querySelector = (selector) => selector === 'img' ? media.children.find((child) => child.tagName === 'img') : null;

  const action = fakeElement('a');
  action.textContent = 'Explore';
  action.href = 'collection.html';
  action.setAttribute('href', 'collection.html');

  const hero = fakeElement('section');
  hero.querySelector = (selector) => {
    if (selector === '.premium-hero-media') return media;
    if (selector === '.premium-hero-actions a') return action;
    return null;
  };

  const windowListeners = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  let intervalId = 0;
  let timeoutId = 0;
  const document = {
    body: { dataset: { page: 'home' } },
    hidden: false,
    querySelector: (selector) => selector === '.premium-hero' ? hero : null,
    createElement: (tag) => fakeElement(tag),
    addEventListener() {},
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener(name, callback) { windowListeners.set(name, callback); },
    dispatchEvent(event) { windowListeners.get(event.type)?.(event); },
  };
  class FakeImage extends (class {}) {
    constructor() {
      super();
      this.onload = null;
      this.onerror = null;
      this.complete = true;
      this.naturalWidth = 120;
      this._src = '';
    }
    set src(value) {
      this._src = String(value || '');
      if (this._src && this.onload) this.onload();
    }
    get src() { return this._src; }
  }
  class FakeCustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const context = {
    document, window, location: { href: 'https://mystic-vibe.example/', origin: 'https://mystic-vibe.example' },
    Image: FakeImage, URL, CustomEvent: FakeCustomEvent,
    setInterval(callback) { const id = ++intervalId; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback) { const id = ++timeoutId; timeouts.set(id, callback); return id; },
    clearTimeout(id) { timeouts.delete(id); },
  };

  runInNewContext(controller, context);

  const slides = [
    { id: 'one', heading: 'Slide one', image_url: 'assets/images/slide-one.webp', display_image_url: 'assets/images/slide-one.webp', cta_text: 'Buy Now', cta_link: '/products/royal-marine.html', transition_style: 'slide-left', is_published: true },
    { id: 'two', heading: 'Slide two', image_url: 'assets/images/slide-two.webp', display_image_url: 'assets/images/slide-two.webp', cta_text: 'Claim Now', cta_link: '/collection.html?filter=offers', transition_style: 'zoom', is_published: true },
  ];
  window.dispatchEvent({ type: 'mystic-vibe-storefront-data', detail: { products: [], slides } });

  assert.equal(media.children.length, 2, 'two overlapping image layers create a single hero viewport');
  assert.equal(action.textContent, 'Buy Now');
  assert.equal(action.href, 'https://mystic-vibe.example/products/royal-marine.html');
  assert.equal(media.children.filter((child) => child.classList.contains('is-active')).length, 1);
  media.children.find((child) => child.classList.contains('is-incoming')).dispatch('animationend');
  assert.ok(media.children.find((child) => child.classList.contains('is-active')).src.includes('slide-one.webp'));

  assert.equal(intervals.size, 1, 'one automatic slide timer runs for the carousel');
  [...intervals.values()][0]();
  assert.equal(action.textContent, 'Claim Now');
  assert.equal(action.href, 'https://mystic-vibe.example/collection.html?filter=offers');
  media.children.find((child) => child.classList.contains('is-incoming')).dispatch('animationend');
  const activeImage = media.children.find((child) => child.classList.contains('is-active'));
  assert.ok(activeImage.src.includes('slide-two.webp'));
  assert.equal(media.children.filter((child) => child.classList.contains('is-active')).length, 1);

  const controls = hero.children.find((child) => child.getAttribute('data-hero-controls') !== null);
  assert.ok(controls, 'the visitor-facing controls are added to the hero');
  const previous = controls.children.find((child) => child.getAttribute('data-hero-prev') !== null);
  const next = controls.children.find((child) => child.getAttribute('data-hero-next') !== null);
  const dots = controls.children.find((child) => child.getAttribute('data-hero-dots') !== null);
  const status = controls.children.find((child) => child.getAttribute('data-hero-status') !== null);
  assert.equal(dots.children.length, 2, 'one direct navigation dot is rendered per slide');
  assert.equal(status.textContent, '02 / 02');
  previous.dispatch('click');
  assert.equal(action.textContent, 'Buy Now', 'previous button returns to the first slide');
  assert.equal(status.textContent, '01 / 02');
  media.children.find((child) => child.classList.contains('is-incoming')).dispatch('animationend');
  next.dispatch('click');
  assert.equal(action.textContent, 'Claim Now', 'next button advances the selected slide');
  assert.equal(status.textContent, '02 / 02');
  media.children.find((child) => child.classList.contains('is-incoming')).dispatch('animationend');
  dots.children[0].dispatch('click');
  assert.equal(action.textContent, 'Buy Now', 'pagination dots navigate directly to their slide');
  assert.equal(status.textContent, '01 / 02');
  media.children.find((child) => child.classList.contains('is-incoming')).dispatch('animationend');
});
