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
      ${order.status_note ? '<div class="tracking-shipment"><h3>Store update</h3><p>' + escapeHtml(order.status_note) + '</p></div>' : ''}
      ${order.payment_method === 'cod' && ['pending','confirmed'].includes(order.order_status) ? '<div class="order-cancel-actions"><button class="btn light" type="button" data-cancel-order>Cancel this order</button><p class="admin-help">Cancellation is available before processing or dispatch.</p></div>' : ''}
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
  const trackResult = document.querySelector('#track-result');
  trackResult.addEventListener('click', async (event) => {
    const cancelButton = event.target.closest('[data-cancel-order]');
    if (!cancelButton) return;
    if (!window.confirm('Cancel this Cash on Delivery order? This cannot be undone.')) return;
    cancelButton.disabled = true; cancelButton.textContent = 'Cancelling…';
    try {
      const { error } = await supabase.rpc('cancel_order', {
        p_order_number: orderInput.value.trim(),
        p_email: form.elements.namedItem('email').value.trim(),
      });
      if (error) throw error;
      const feedback = form.querySelector('#track-feedback');
      feedback.textContent = 'Your order has been cancelled and the available stock has been restored.';
      feedback.hidden = false;
      form.requestSubmit();
    } catch (error) {
      cancelButton.disabled = false; cancelButton.textContent = 'Cancel this order';
      const feedback = form.querySelector('#track-feedback');
      feedback.textContent = error?.message || 'The order could not be cancelled. Please contact support.';
      feedback.hidden = false;
    }
  });
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

function accountStatusInfo(value) {
  const raw = String(value ?? '');
  const key = raw.trim().toLowerCase().replace(/[\\s-]+/g, '_');
  const known = {
    pending: { label: 'Pending', tone: 'pending' },
    confirmed: { label: 'Confirmed', tone: 'processing' },
    processing: { label: 'Processing', tone: 'processing' },
    shipped: { label: 'Shipped', tone: 'shipped' },
    delivered: { label: 'Delivered', tone: 'delivered' },
    cancelled: { label: 'Cancelled', tone: 'cancelled' },
    canceled: { label: 'Cancelled', tone: 'cancelled' },
    failed: { label: 'Failed', tone: 'failed' },
    refunded: { label: 'Refunded', tone: 'refunded' },
    returned: { label: 'Returned', tone: 'refunded' },
  };
  return known[key] || { label: raw || 'Unknown', tone: 'unknown' };
}

function accountProgressMarkup(value) {
  const raw = String(value ?? '');
  const key = raw.trim().toLowerCase().replace(/[\\s-]+/g, '_');
  if (['cancelled', 'canceled', 'failed'].includes(key)) {
    const message = key === 'failed'
      ? 'This order has failed. No delivery progress is available.'
      : 'This order has been cancelled. No delivery progress is available.';
    return '<p class="oc-status-message oc-status-message--alert" role="status">' + message + '</p>';
  }
  if (['refunded', 'returned'].includes(key)) {
    return '<p class="oc-status-message" role="status">This order is ' + escapeHtml(key) + '.</p>';
  }

  const stageByStatus = { pending: 0, confirmed: 1, processing: 1, shipped: 2, delivered: 3 };
  if (!Object.prototype.hasOwnProperty.call(stageByStatus, key)) {
    return '<p class="oc-status-message" role="status">Delivery progress will appear when this order status is available.</p>';
  }
  const current = stageByStatus[key];
  const steps = ['Placed', 'Processing', 'Shipped', 'Delivered'];
  const label = accountStatusInfo(value).label;
  return '<ol class="oc-track" aria-label="Order progress: ' + escapeHtml(label) + '">' +
    steps.map((step, index) => '<li class="' + (index <= current ? 'is-done' : '') + (index === current ? ' is-current' : '') + '"' +
      (index === current ? ' aria-current="step"' : '') + '><span class="oc-track-dot" aria-hidden="true"></span><span class="oc-track-label">' + step + '</span></li>').join('') +
    '</ol>';
}

function accountItemImage(item) {
  const candidate = [item.image_url, item.product_image_url, item.image].find((value) =>
    typeof value === 'string' && /^(https:\\/\\/|\\/?assets\\/)/i.test(value.trim()));
  if (candidate) {
    return '<img src="' + escapeHtml(candidate.trim()) + '" alt="" width="64" height="64" loading="lazy">';
  }
  return '<span class="oc-thumb-placeholder" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false"><path d="M19 7h10v6l3 3v21H16V16l3-3V7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M19 13h10M16 20h16M21 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>';
}

function accountOrderCard(order, items) {
  const status = accountStatusInfo(order.order_status);
  const visibleItems = items.slice(0, 3);
  const singleItem = items.length === 1;
  const rows = visibleItems.map((item) => {
    const description = [];
    if (item.size_ml) description.push(Number(item.size_ml) + 'ML');
    description.push('Qty ' + Number(item.quantity || 0));
    description.push(money(item.unit_price) + ' each');
    return '<li class="oc-item-row"><span class="oc-thumb">' + accountItemImage(item) + '</span>' +
      '<span class="oc-item-copy"><strong class="oc-item-name">' + escapeHtml(item.product_name) + '</strong>' +
      '<span class="oc-item-meta">' + escapeHtml(description.join(' · ')) + '</span></span>' +
      (singleItem ? '' : '<strong class="oc-line-total">' + money(item.line_total) + '</strong>') +
      '</li>';
  }).join('');
  const moreCount = Math.max(0, items.length - visibleItems.length);
  const shipment = order.carrier || order.tracking_number
    ? '<p class="oc-shipment"><span>Shipment</span><strong>' + escapeHtml(order.carrier || 'Carrier pending') +
      (order.tracking_number ? ' · ' + escapeHtml(order.tracking_number) : '') + '</strong></p>'
    : '';
  const paymentStatus = order.payment_status ? niceStatus(order.payment_status) : '';

  return '<article class="panel account-order-card oc-order-card">' +
    '<header class="oc-head">' +
      '<div class="oc-ident">' +
        '<span class="oc-label">Order</span>' +
        '<div class="oc-ref-line"><span class="oc-id">' + escapeHtml(order.order_number) + '</span>' +
          '<button class="oc-copy" type="button" data-copy-order="' + escapeHtml(order.order_number) + '" aria-label="Copy order number" title="Copy order number">' +
            '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="6.5" y="6.5" width="9" height="10" rx="1.8"></rect><path d="M4.5 13V4.8A1.8 1.8 0 0 1 6.3 3h7"></path></svg><span>Copy</span></button>' +
        '</div>' +
        '<p class="oc-date">Placed on ' + escapeHtml(dateText(order.created_at)) + '</p>' +
      '</div>' +
      '<div class="oc-status-stack"><span class="oc-status oc-status--' + status.tone + '"><i aria-hidden="true"></i>' + escapeHtml(status.label) + '</span>' +
        (paymentStatus ? '<span class="oc-payment">Payment · ' + escapeHtml(paymentStatus) + '</span>' : '') +
      '</div>' +
    '</header>' +
    accountProgressMarkup(order.order_status) +
    '<ul class="oc-items">' + (rows || '<li class="oc-no-items">Order item details are unavailable.</li>') + '</ul>' +
    (moreCount ? '<p class="oc-more-items">+' + moreCount + ' more ' + (moreCount === 1 ? 'item' : 'items') + '</p>' : '') +
    shipment +
    '<footer class="oc-foot"><p class="oc-total"><span>Order total</span><strong>' + money(order.total) + '</strong></p>' +
      '<div class="oc-actions"><a class="btn-ghost" href="tracking.html?order=' + encodeURIComponent(order.order_number) + '">' +
        '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M2.5 10h12M10.5 5.5 15 10l-4.5 4.5M16.5 5.5h1v9h-1"></path></svg>Track delivery</a></div>' +
    '</footer></article>';
}

function accountSkeletonMarkup() {
  return '<article class="oc-skeleton" aria-hidden="true"><div class="oc-skeleton-head"><span></span><i></i></div>' +
    '<div class="oc-skeleton-date"></div><div class="oc-skeleton-track"></div>' +
    '<div class="oc-skeleton-item"><i></i><span></span><b></b></div><div class="oc-skeleton-foot"><span></span><b></b></div></article>' +
    '<article class="oc-skeleton" aria-hidden="true"><div class="oc-skeleton-head"><span></span><i></i></div>' +
    '<div class="oc-skeleton-date"></div><div class="oc-skeleton-track"></div>' +
    '<div class="oc-skeleton-item"><i></i><span></span><b></b></div><div class="oc-skeleton-foot"><span></span><b></b></div></article>';
}

async function initialiseAccount() {
  main.innerHTML = '<section class="orders-page">' +
    '<a class="orders-back-link" href="collection.html"><span aria-hidden="true">←</span> Continue shopping</a>' +
    '<header class="orders-page-head"><span class="orders-kicker">YOUR MYSTIC VIBE</span><h1>My Orders</h1>' +
      '<p id="orders-subtitle" class="orders-subtitle">Your orders and delivery updates.</p></header>' +
    '<div id="account-content" class="account-orders orders-list" aria-live="polite">' + accountSkeletonMarkup() + '</div>' +
    '</section>';
  const root = document.querySelector('#account-content');
  const subtitle = document.querySelector('#orders-subtitle');

  root.addEventListener('click', async (event) => {
    const retryButton = event.target.closest('[data-orders-retry]');
    if (retryButton) {
      event.preventDefault();
      await loadAccount();
      return;
    }
    const copyButton = event.target.closest('[data-copy-order]');
    if (!copyButton) return;
    const orderNumber = copyButton.dataset.copyOrder || '';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(orderNumber);
      } else {
        const field = document.createElement('textarea');
        field.value = orderNumber;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('Copy is not available in this browser.');
      }
      copyButton.classList.add('is-copied');
      copyButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4 10 4 4 8-8"></path></svg><span>Copied</span>';
      copyButton.setAttribute('aria-label', 'Order number copied');
      window.setTimeout(() => {
        if (!copyButton.isConnected) return;
        copyButton.classList.remove('is-copied');
        copyButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="6.5" y="6.5" width="9" height="10" rx="1.8"></rect><path d="M4.5 13V4.8A1.8 1.8 0 0 1 6.3 3h7"></path></svg><span>Copy</span>';
        copyButton.setAttribute('aria-label', 'Copy order number');
      }, 1800);
    } catch (error) {
      copyButton.classList.add('is-copy-error');
      copyButton.querySelector('span').textContent = 'Copy failed';
      window.setTimeout(() => {
        if (copyButton.isConnected) {
          copyButton.classList.remove('is-copy-error');
          copyButton.querySelector('span').textContent = 'Copy';
        }
      }, 1800);
    }
  });

  async function loadAccount() {
    root.innerHTML = accountSkeletonMarkup();
    subtitle.textContent = 'Your orders and delivery updates.';
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const user = data?.user;
      if (!user) {
        root.innerHTML = '<div class="oc-empty"><div class="oc-empty-icon" aria-hidden="true">♡</div><h2>Sign in to view your orders</h2>' +
          '<p>Your account shows orders placed while signed in. Guest orders can be tracked using the order number and checkout email.</p>' +
          '<div class="oc-empty-actions"><a class="btn-ghost" href="login.html">Sign in</a><a class="oc-text-link" href="tracking.html">Track a guest order</a></div></div>';
        return;
      }

      const { data: orders, error: orderError } = await supabase.from('orders')
        .select('id,order_number,created_at,order_status,payment_status,payment_method,subtotal,shipping_fee,discount_amount,total,carrier,tracking_number')
        .order('created_at', { ascending: false }).limit(50);
      if (orderError) throw orderError;
      if (!orders?.length) {
        subtitle.textContent = 'No orders have been placed from this signed-in account yet.';
        root.innerHTML = '<div class="oc-empty"><div class="oc-empty-icon" aria-hidden="true">✧</div><h2>No orders yet</h2>' +
          '<p>Your orders will appear here after you place one while signed in.</p>' +
          '<div class="oc-empty-actions"><a class="btn-ghost" href="collection.html">Shop fragrances</a><a class="oc-text-link" href="tracking.html">Track a guest order</a></div></div>';
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

      subtitle.textContent = 'Showing your latest ' + orders.length + ' orders · ' + (user.email || '');
      root.innerHTML = orders.map((order) => accountOrderCard(order, byOrder.get(order.id) || [])).join('');
    } catch (error) {
      if (error?.name === 'AuthSessionMissingError' || error?.message === 'Auth session missing!') {
        root.innerHTML = '<div class="oc-empty"><div class="oc-empty-icon" aria-hidden="true">♡</div><h2>Sign in to view your orders</h2>' +
          '<p>Your account shows orders placed while signed in. Guest orders can be tracked using the order number and checkout email.</p>' +
          '<div class="oc-empty-actions"><a class="btn-ghost" href="login.html">Sign in</a><a class="oc-text-link" href="tracking.html">Track a guest order</a></div></div>';
        return;
      }
      console.error('Account orders could not be loaded:', error);
      subtitle.textContent = 'Your orders are temporarily unavailable.';
      root.innerHTML = '<div class="oc-empty oc-empty--error" role="alert"><div class="oc-empty-icon" aria-hidden="true">!</div>' +
        '<h2>We could not load your orders</h2><p>Please check your connection and try again.</p>' +
        '<button class="btn-ghost" type="button" data-orders-retry>Retry</button></div>';
    }
  }

  await loadAccount();
}

if (document.body?.dataset.page === 'tracking') await initialiseTracking();
if (document.body?.dataset.page === 'account') await initialiseAccount();
