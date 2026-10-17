import { supabase } from './supabase-client.js';

const main = document.querySelector('main');
const money = (value) => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const niceStatus = (value) => String(value || 'pending').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const dateText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

function statusSteps(status) {
  const steps = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
  const index = steps.indexOf(status);
  if (status === 'cancelled') return '<p class="order-status-note">This order has been cancelled. Contact support if you need help.</p>';
  if (status === 'returned' || status === 'refunded') return '<p class="order-status-note">This order is ' + escapeHtml(niceStatus(status).toLowerCase()) + '.</p>';
  return '<ol class="order-timeline">' + steps.map((step, i) =>
    '<li class="' + (i <= index ? 'complete' : '') + '"><span></span><strong>' + escapeHtml(niceStatus(step)) + '</strong></li>'
  ).join('') + '</ol>';
}
function renderOrderResult(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return `
    <section class="panel order-detail-card">
      <div class="order-detail-top"><div><span class="eyebrow">Order</span><h2 class="serif">${escapeHtml(order.order_number)}</h2><p>Placed ${escapeHtml(dateText(order.created_at))}</p></div>
      <div class="order-badges"><span class="badge">${escapeHtml(niceStatus(order.order_status))}</span><span class="badge">${escapeHtml(niceStatus(order.payment_status))}</span></div></div>
      ${statusSteps(order.order_status)}
      ${order.carrier || order.tracking_number ? '<div class="tracking-shipment"><h3>Shipment details</h3><p>' + escapeHtml(order.carrier || 'Delivery partner') + (order.tracking_number ? ': ' + escapeHtml(order.tracking_number) : '') + '</p></div>' : ''}
      <h3 class="serif">Items</h3>
      <div class="order-items-list">${items.map((item) => '<div class="order-item-line"><div><strong>' + escapeHtml(item.product_name) + '</strong><small>' + escapeHtml(item.size_ml ? item.size_ml + ' ml' : '') + ' × ' + Number(item.quantity || 0) + '</small></div><strong>' + money(item.line_total) + '</strong></div>').join('')}</div>
      <div class="order-total-lines"><p>Subtotal <strong>${money(order.subtotal)}</strong></p><p>Shipping <strong>${Number(order.shipping_fee || 0) === 0 ? 'Free' : money(order.shipping_fee)}</strong></p>${Number(order.discount_amount || 0) > 0 ? '<p>Discount <strong>−' + money(order.discount_amount) + '</strong></p>' : ''}<h3>Total <strong>${money(order.total)}</strong></h3></div>
      <p class="admin-help">Payment method: ${escapeHtml(niceStatus(order.payment_method))}. Payment is collected according to the selected payment method.</p>
    </section>`;
}

async function initialiseTracking() {
  main.innerHTML = `
    <section class="page-hero"><div class="page-title"><span class="eyebrow">Order updates</span><h1 class="serif">Track Your Order</h1><p>Enter your order number and the email address used at checkout.</p></div></section>
    <section class="section"><div class="container order-tracking-layout">
      <form id="track-form" class="panel form-grid"><label class="full">Order number<input name="order_number" required maxlength="40" placeholder="MV-YYYYMMDD-XXXXXXXX"></label>
        <label class="full">Checkout email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
        <p class="checkout-feedback full" id="track-feedback" role="status" aria-live="polite" hidden></p>
        <button class="btn full" type="submit">Find Order</button>
      </form>
      <div id="track-result" aria-live="polite"></div>
    </div></section>`;
  const form = document.querySelector('#track-form');
  const orderInput = form.elements.namedItem('order_number');
  const queryOrder = new URLSearchParams(location.search).get('order');
  if (queryOrder) orderInput.value = queryOrder.slice(0, 40);
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const feedback = form.querySelector('#track-feedback');
    const result = document.querySelector('#track-result');
    const button = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    button.disabled = true; button.textContent = 'Looking up order…'; feedback.hidden = true; result.innerHTML = '';
    try {
      const { data, error } = await supabase.rpc('lookup_order', {
        p_order_number: orderInput.value.trim(),
        p_email: form.elements.namedItem('email').value.trim(),
      });
      if (error) throw error;
      const order = Array.isArray(data) ? data[0] : data;
      if (!order) throw new Error('No matching order was found. Check the order number and email used at checkout.');
      result.innerHTML = renderOrderResult(order);
    } catch (error) {
      feedback.textContent = error?.message || 'Order lookup is temporarily unavailable. Please try again.';
      feedback.hidden = false;
    } finally {
      button.disabled = false; button.textContent = 'Find Order';
    }
  }, true);
}

async function initialiseAccount() {
  main.innerHTML = `
    <section class="page-hero"><div class="page-title"><span class="eyebrow">Your Mystic Vibe</span><h1 class="serif">My Account</h1><p>Orders, delivery progress and account details in one place.</p></div></section>
    <section class="section"><div class="container"><div id="account-content" class="account-orders"><div class="panel">Loading your account…</div></div></div></section>`;
  const root = document.querySelector('#account-content');
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const user = data?.user;
    if (!user) {
      root.innerHTML = '<div class="panel"><h2 class="serif">Sign in to view your orders</h2><p>Your account lets you view orders placed while signed in. Guest orders can be tracked using the order number and checkout email.</p><a class="btn" href="login.html">Sign in</a> <a class="btn light" href="register.html">Create account</a> <a class="btn light" href="tracking.html">Track a guest order</a></div>';
      return;
    }
    const { data: orders, error: orderError } = await supabase.from('orders')
      .select('id,order_number,created_at,order_status,payment_status,payment_method,subtotal,shipping_fee,discount_amount,total,carrier,tracking_number')
      .order('created_at', { ascending: false }).limit(50);
    if (orderError) throw orderError;
    if (!orders?.length) {
      root.innerHTML = '<div class="panel"><h2 class="serif">No orders yet</h2><p>Your orders will appear here after you place them while signed in.</p><a class="btn" href="collection.html">Explore perfumes</a> <a class="btn light" href="tracking.html">Track a guest order</a></div>';
      return;
    }
    const ids = orders.map((order) => order.id);
    const { data: items, error: itemError } = await supabase.from('order_items')
      .select('order_id,product_name,product_slug,size_ml,quantity,unit_price,line_total')
      .in('order_id', ids).order('created_at', { ascending: true });
    if (itemError) throw itemError;
    const byOrder = new Map();
    for (const item of items || []) {
      if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
      byOrder.get(item.order_id).push(item);
    }
    root.innerHTML = orders.map((order) => `
      <article class="panel account-order-card">
        <header><div><span class="eyebrow">${escapeHtml(order.order_number)}</span><h2 class="serif">${escapeHtml(dateText(order.created_at))}</h2></div><div class="order-badges"><span class="badge">${escapeHtml(niceStatus(order.order_status))}</span><span class="badge">${escapeHtml(niceStatus(order.payment_status))}</span></div></header>
        <div class="account-order-items">${(byOrder.get(order.id) || []).map((item) => '<p><span>' + escapeHtml(item.product_name) + ' × ' + Number(item.quantity) + '</span><strong>' + money(item.line_total) + '</strong></p>').join('')}</div>
        <div class="account-order-footer"><h3>Total ${money(order.total)}</h3><a class="btn light" href="tracking.html?order=${encodeURIComponent(order.order_number)}">Track delivery</a></div>
        ${order.carrier || order.tracking_number ? '<p class="admin-help">Shipment: ' + escapeHtml(order.carrier || 'Carrier pending') + (order.tracking_number ? ' · ' + escapeHtml(order.tracking_number) : '') + '</p>' : ''}
      </article>`).join('');
    const heading = document.createElement('p');
    heading.className = 'admin-help';
    heading.textContent = 'Showing your latest ' + orders.length + ' orders for ' + user.email + '.';
    root.prepend(heading);
  } catch (error) {
    console.error('Account orders could not be loaded:', error);
    root.innerHTML = '<div class="panel"><h2 class="serif">We could not load your orders</h2><p>' + escapeHtml(error?.message || 'Please try again later.') + '</p><a class="btn light" href="login.html">Sign in again</a> <a class="btn light" href="tracking.html">Track a guest order</a></div>';
  }
}

if (document.body?.dataset.page === 'tracking') await initialiseTracking();
if (document.body?.dataset.page === 'account') await initialiseAccount();
