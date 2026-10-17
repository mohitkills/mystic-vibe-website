import { supabase } from './supabase-client.js';

const main = document.querySelector('main');
if (!main) throw new Error('Checkout content container is missing.');
const rupees = (value) => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function readCart() {
  try {
    const rows = JSON.parse(localStorage.getItem('mv_cart') || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({ slug: String(row?.slug || ''), quantity: Number(row?.qty) }))
      .filter((row) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) &&
        Number.isSafeInteger(row.quantity) && row.quantity >= 1 && row.quantity <= 20);
  } catch { return []; }
}
function localProduct(slug) {
  return (window.MV_PRODUCTS || window.MV_STATIC_PRODUCTS || []).find((product) => product.slug === slug) ||
    { slug, name: slug.replace(/-/g, ' '), price: 0, size: '50ML' };
}
const stateOptions = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];
let shippingSettings = { standard_fee: 0, free_shipping_threshold: 0, cod_enabled: true };
let shippingSettingsKnown = true;

const checkoutState = { coupon: '', preview: null, verified: false, busy: false };

function updateCheckoutButton() {
  const button = document.querySelector('#place-order');
  const cart = readCart();
  if (button) button.disabled = !cart.length || checkoutState.busy || !checkoutState.verified || !shippingSettings.cod_enabled;
}

async function refreshPreview(candidateCode = checkoutState.coupon) {
  const feedback = document.querySelector('#coupon-feedback');
  const previewMessage = document.querySelector('#checkout-preview-message');
  const applyButton = document.querySelector('#apply-coupon');
  const removeButton = document.querySelector('#remove-coupon');
  const codeInput = document.querySelector('#coupon-code');
  const cart = readCart();
  const form = document.querySelector('#checkout-form');
  const email = String(form?.elements.namedItem('email')?.value || '').trim();

  checkoutState.busy = true;
  updateCheckoutButton();
  if (applyButton) { applyButton.disabled = true; applyButton.textContent = 'Checking…'; }
  if (previewMessage) previewMessage.textContent = 'Verifying live product prices and stock…';
  if (feedback && candidateCode) { feedback.hidden = true; feedback.textContent = ''; }

  try {
    if (!cart.length) throw new Error('Your cart is empty. Add a perfume before checkout.');
    if (candidateCode && !email) throw new Error('Enter your checkout email before applying a coupon.');
    const response = await supabase.rpc('preview_checkout', {
      p_items: cart.map(({ slug, quantity }) => ({ slug, quantity })),
      p_email: email,
      p_coupon_code: candidateCode || null,
    });
    if (response.error) throw response.error;
    const preview = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!preview || !Array.isArray(preview.items) || !Number.isFinite(Number(preview.total))) {
      throw new Error('The store could not verify the checkout total. Please refresh and try again.');
    }
    checkoutState.preview = preview;
    checkoutState.coupon = preview.coupon_code || '';
    checkoutState.verified = true;

    const lines = document.querySelector('#checkout-lines');
    if (lines) {
      lines.innerHTML = preview.items.map((item) =>
        '<div class="checkout-line"><span>' + escapeHtml(item.product_name) + ' × ' + Number(item.quantity) +
        '</span><strong>' + rupees(item.line_total) + '</strong></div>'
      ).join('');
    }
    const subtotalNode = document.querySelector('#checkout-subtotal');
    const shippingNode = document.querySelector('#checkout-shipping');
    const discountRow = document.querySelector('#checkout-discount-row');
    const discountNode = document.querySelector('#checkout-discount');
    const totalNode = document.querySelector('#checkout-total');
    if (subtotalNode) subtotalNode.textContent = rupees(preview.subtotal);
    if (shippingNode) shippingNode.textContent = Number(preview.shipping_fee || 0) > 0 ? rupees(preview.shipping_fee) : 'Free';
    if (discountRow) discountRow.hidden = !(Number(preview.discount_amount) > 0);
    if (discountNode) discountNode.textContent = '−' + rupees(preview.discount_amount);
    if (totalNode) totalNode.textContent = rupees(preview.total);
    if (codeInput) codeInput.value = checkoutState.coupon;
    if (removeButton) removeButton.hidden = !checkoutState.coupon;
    if (previewMessage) previewMessage.textContent = preview.cod_enabled
      ? 'Prices and available stock verified. The final total is rechecked when you place the order.'
      : 'Cash on Delivery is disabled by the store. You cannot place an order at this time.';
    shippingSettings.cod_enabled = preview.cod_enabled === true;
    const cod = document.querySelector('#checkout-form input[name="pay"]');
    if (cod) cod.disabled = !preview.cod_enabled;
    if (feedback) {
      feedback.textContent = checkoutState.coupon
        ? 'Coupon ' + checkoutState.coupon + ' applied. You save ' + rupees(preview.discount_amount) + '.'
        : candidateCode ? 'Coupon was not applied.' : '';
      feedback.hidden = !checkoutState.coupon && !candidateCode;
    }
  } catch (error) {
    checkoutState.verified = false;
    if (previewMessage) previewMessage.textContent = 'Checkout could not be verified. Review the message below and retry.';
    if (feedback) {
      feedback.textContent = error?.message || 'Could not validate the coupon or checkout.';
      feedback.hidden = false;
    }
    if (candidateCode && checkoutState.coupon !== candidateCode && codeInput) codeInput.value = candidateCode;
  } finally {
    checkoutState.busy = false;
    if (applyButton) { applyButton.disabled = false; applyButton.textContent = 'Apply coupon'; }
    updateCheckoutButton();
  }
}
function refreshShippingSummary() {
  const cart = readCart();
  const subtotal = cart.reduce((sum, item) => sum + Number(localProduct(item.slug).price || 0) * item.quantity, 0);
  const threshold = Number(shippingSettings.free_shipping_threshold || 0);
  const fee = threshold > 0 && subtotal >= threshold ? 0 : Number(shippingSettings.standard_fee || 0);
  const summary = document.querySelector('.summary');
  const subtotalText = summary?.querySelector('#checkout-subtotal');
  const shippingText = summary?.querySelector('#checkout-shipping');
  const totalText = summary?.querySelector('#checkout-total');
  if (subtotalText) subtotalText.textContent = rupees(subtotal);
  if (shippingText) shippingText.textContent = shippingSettingsKnown ? (fee === 0 ? 'Free' : rupees(fee)) : 'Confirmed by store';
  if (totalText) totalText.textContent = rupees(subtotal + fee);
  const cod = document.querySelector('#checkout-form input[name="pay"]');
  const button = document.querySelector('#place-order');
  if (cod) cod.disabled = shippingSettings.cod_enabled === false;
  if (button) button.disabled = cart.length === 0 || shippingSettings.cod_enabled === false;
  const note = document.querySelector('#checkout-form .payment-options + p');
  if (note && shippingSettings.cod_enabled === false) note.textContent = 'Cash on Delivery is temporarily unavailable. Please contact customer support.';
}

function render() {
  const cart = readCart();
  const subtotal = cart.reduce((sum, item) => sum + Number(localProduct(item.slug).price || 0) * item.quantity, 0);
  main.innerHTML = `
    <section class="page-hero"><div class="page-title"><span class="eyebrow">Mystic Vibe</span><h1 class="serif">Secure Checkout</h1><p>Enter your delivery details. Final price and stock are verified by the store before the order is placed.</p></div></section>
    <section class="section"><div class="container split">
      <form class="panel form-grid" id="checkout-form" novalidate>
        <h2 class="serif full">Delivery details</h2>
        <label class="full">Full name<input name="full_name" autocomplete="name" required minlength="2" maxlength="120"></label>
        <label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
        <label>Mobile number<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="10-digit Indian mobile" required pattern="(?:[+]91[- ]?)?[6-9][0-9]{9}"></label>
        <label class="full">Address line 1<input name="address_line1" autocomplete="address-line1" required minlength="5" maxlength="240" placeholder="House / flat, street, area"></label>
        <label class="full">Address line 2 <span class="admin-help">(optional)</span><input name="address_line2" autocomplete="address-line2" maxlength="240" placeholder="Landmark, locality"></label>
        <label>City / town<input name="city" autocomplete="address-level2" required minlength="2" maxlength="100"></label>
        <label>State / UT<select name="state" autocomplete="address-level1" required><option value="">Select state / UT</option>${stateOptions.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}</select></label>
        <label>PIN code<input name="postal_code" autocomplete="postal-code" inputmode="numeric" pattern="[1-9][0-9]{5}" minlength="6" maxlength="6" required placeholder="6-digit PIN"></label>
        <label>Country<input value="India" disabled aria-label="Country"></label>
        <label class="full">Delivery instructions <span class="admin-help">(optional)</span><textarea name="customer_notes" rows="3" maxlength="1000" placeholder="Anything the delivery partner should know?"></textarea></label>
        <input type="hidden" name="country" value="India">
        <h2 class="serif full">Payment</h2>
        <div class="payment-options full"><label class="pay-option active"><input type="radio" name="pay" value="cod" checked> Cash on Delivery (COD)</label></div>
        <p class="admin-help full">Online payments will appear here only after a verified payment gateway and server-side verification are configured.</p>
        <label class="check-label full"><input type="checkbox" name="accept_terms" required> I agree to the <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>.</label>
        <p class="checkout-feedback full" id="checkout-feedback" role="status" aria-live="polite" hidden></p>
        <button class="btn full" id="place-order" type="submit" disabled>Place COD Order</button>
        <a class="btn light full" href="cart.html">Back to cart</a>
      </form>
      <aside class="panel summary" id="checkout-summary"><h2 class="serif">Your order</h2>
        <div id="checkout-lines">${cart.length ? cart.map((item) => {
          const product = localProduct(item.slug);
          return `<div class="checkout-line"><span>${escapeHtml(product.name)} × ${item.quantity}</span><strong>${rupees(Number(product.price || 0) * item.quantity)}</strong></div>`;
        }).join('') : '<p>Your cart is empty.</p><a class="btn" href="collection.html">Explore perfumes</a>'}
        </div>
        <div class="checkout-coupon"><label for="coupon-code">Coupon code</label><input id="coupon-code" type="text" maxlength="40" autocomplete="off" placeholder="Enter offer code"><div class="checkout-coupon-actions"><button class="btn light" id="apply-coupon" type="button">Apply coupon</button><button class="btn light" id="remove-coupon" type="button" hidden>Remove</button></div><p id="coupon-feedback" class="checkout-feedback" role="status" aria-live="polite" hidden></p></div>
        <hr><p>Subtotal <strong id="checkout-subtotal" style="float:right">${rupees(subtotal)}</strong></p><p>Shipping <strong id="checkout-shipping" style="float:right">Free</strong></p><p id="checkout-discount-row" hidden>Discount <strong id="checkout-discount" style="float:right">−₹0</strong></p><h3>Total <span id="checkout-total" style="float:right">${rupees(subtotal)}</span></h3><p id="checkout-preview-message" class="admin-help">Verifying current prices and stock…</p>
      </aside>
    </div></section>`;
}
function showConfirmation(order) {
  main.innerHTML = `
    <section class="page-hero"><div class="page-title"><span class="eyebrow">Order confirmed</span><h1 class="serif">Thank you for choosing Mystic Vibe.</h1><p>Your Cash on Delivery order has been recorded.</p></div></section>
    <section class="section"><div class="container"><div class="panel order-confirmation">
      <span class="eyebrow">Your order number</span><h2 class="serif">${escapeHtml(order.order_number)}</h2>
      <p>Order total: <strong>${rupees(order.total)}</strong></p><p>Shipping: ${Number(order.shipping_fee || 0) ? rupees(order.shipping_fee) : 'Free'} · ${Number(order.discount_amount || 0) ? 'Coupon discount: ' + rupees(order.discount_amount) + ' · ' : ''}Payment: Cash on Delivery · Payment status: Pending</p>
      <p>Save the order number and use your checkout email to track delivery progress.</p>
      <a class="btn" href="tracking.html?order=${encodeURIComponent(order.order_number)}">Track this order</a>
      <a class="btn light" href="account.html">My account & orders</a><a class="btn light" href="collection.html">Continue shopping</a>
    </div></div></section>`;
}
try {
  const { data, error } = await supabase.from('site_content').select('content_value')
    .eq('content_key', 'store.shipping').eq('is_published', true).maybeSingle();
  if (error) throw error;
  if (data?.content_value && typeof data.content_value === 'object') {
    shippingSettings = { ...shippingSettings, ...data.content_value };
  }
} catch (error) {
  shippingSettingsKnown = false;
  console.warn('Shipping settings could not be loaded; the server will provide the final shipping amount.', error?.message || error);
}
render();
refreshShippingSummary();
const form = document.querySelector('#checkout-form');
if (form) {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      const user = data.user;
      form.elements.namedItem('email').value = user.email || '';
      form.elements.namedItem('full_name').value =
        [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ');
    }
  } catch (error) { console.warn('Could not prefill account details:', error?.message || error); }

  await refreshPreview(null);
  document.querySelector('#apply-coupon')?.addEventListener('click', () => {
    const candidate = String(document.querySelector('#coupon-code')?.value || '').trim().toUpperCase();
    refreshPreview(candidate);
  });
  document.querySelector('#remove-coupon')?.addEventListener('click', () => {
    checkoutState.coupon = '';
    const codeInput = document.querySelector('#coupon-code');
    if (codeInput) codeInput.value = '';
    refreshPreview(null);
  });
  form.elements.namedItem('email').addEventListener('change', () => refreshPreview(checkoutState.coupon));

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const feedback = form.querySelector('#checkout-feedback');
    const button = form.querySelector('#place-order');
    if (!form.reportValidity()) return;
    const cart = readCart();
    if (!cart.length) { feedback.textContent = 'Your cart is empty. Add a perfume before checking out.'; feedback.hidden = false; return; }
    const formData = new FormData(form);
    const customer = Object.fromEntries([
      'full_name','email','phone','address_line1','address_line2','city','state','postal_code','country',
    ].map((key) => [key, String(formData.get(key) || '').trim()]));
    if (!formData.get('accept_terms')) { feedback.textContent = 'Please accept the Terms and Privacy Policy to continue.'; feedback.hidden = false; return; }
    button.disabled = true; button.textContent = 'Checking stock & placing order…'; feedback.hidden = true;
    try {
      const { data, error } = await supabase.rpc('place_order', {
        p_customer: customer, p_items: cart.map(({ slug, quantity }) => ({ slug, quantity })),
        p_payment_method: 'cod', p_customer_notes: String(formData.get('customer_notes') || '').trim() || null,
        p_coupon_code: checkoutState.coupon || null,
      });
      if (error) throw error;
      const order = Array.isArray(data) ? data[0] : data;
      if (!order?.order_number || !Number.isFinite(Number(order.total))) {
        throw new Error('The store did not return a valid order confirmation. Check order history before retrying.');
      }
      localStorage.removeItem('mv_cart');
      if (typeof window.updateCounts === 'function') window.updateCounts();
      showConfirmation(order);
    } catch (error) {
      console.error('Mystic Vibe checkout failed:', error);
      feedback.textContent = error?.message || 'We could not place your order. Please try again.';
      feedback.hidden = false; button.disabled = false; button.textContent = 'Place COD Order';
    }
  }, true);
}
document.addEventListener('change', (event) => {
  if (event.target.name !== 'pay') return;
  document.querySelectorAll('.pay-option').forEach((option) => option.classList.remove('active'));
  event.target.closest('.pay-option')?.classList.add('active');
});
