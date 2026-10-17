const ORDER_STATUSES = ['pending','confirmed','processing','shipped','delivered','cancelled','returned','refunded'];
const PAYMENT_STATUSES = ['pending','paid','failed','refunded','cod_collected'];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const money = (value) => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const csvCell = (value) => {
  let safe = String(value ?? '');
  if (/^[\\s]*[=+\\-@]/.test(safe)) safe = "'" + safe;
  return '"' + safe.replace(/"/g, '""') + '"';
};
const label = (value) => String(value || 'pending').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export function initializeOrdersAdmin(supabase) {
  const panel = document.querySelector('[data-panel="orders"]');
  if (!panel || panel.dataset.ordersReady === 'true') return;
  panel.dataset.ordersReady = 'true';
  panel.innerHTML = `
    <div class="admin-panel-heading"><div><span class="eyebrow">Fulfilment</span><h2 class="serif">Customer Orders</h2><p>Review orders, verify COD collection, update delivery progress and export order data.</p></div><button class="btn light" type="button" data-orders-refresh>Refresh</button></div>
    <div class="order-admin-stats" id="order-admin-stats"><div class="panel"><span>All orders</span><strong>—</strong></div><div class="panel"><span>Needs confirmation</span><strong>—</strong></div><div class="panel"><span>In fulfilment</span><strong>—</strong></div><div class="panel"><span>Order value shown</span><strong>—</strong></div></div>
    <div class="order-admin-tools">
      <label>Search order<input id="order-admin-search" type="search" placeholder="Order number, customer, email, phone"></label>
      <label>Order status<select id="order-admin-status"><option value="">All statuses</option>${ORDER_STATUSES.map((s) => `<option value="${s}">${label(s)}</option>`).join('')}</select></label>
      <label>Payment status<select id="order-admin-payment"><option value="">All payment states</option>${PAYMENT_STATUSES.map((s) => `<option value="${s}">${label(s)}</option>`).join('')}</select></label>
      <button class="btn light" type="button" data-orders-export>Export CSV</button>
    </div>
    <p id="orders-admin-feedback" class="admin-status" role="status" aria-live="polite"></p>
    <div class="order-admin-layout"><div class="admin-record-list order-admin-list" id="order-admin-list" aria-live="polite"></div><div id="order-admin-detail" class="order-admin-detail"><div class="panel"><h3 class="serif">Select an order</h3><p>Choose an order to inspect customer details, line items and delivery status.</p></div></div></div>`;
  const list = panel.querySelector('#order-admin-list');
  const detail = panel.querySelector('#order-admin-detail');
  const feedback = panel.querySelector('#orders-admin-feedback');
  let orders = [];
  let selectedId = '';
  let busy = false;

  function showMessage(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
  }
  function selectedOrder() { return orders.find((order) => order.id === selectedId); }
  function visibleOrders() {
    const query = panel.querySelector('#order-admin-search').value.trim().toLowerCase();
    const status = panel.querySelector('#order-admin-status').value;
    const payment = panel.querySelector('#order-admin-payment').value;
    return orders.filter((order) => {
      const text = [order.order_number, order.customer_name, order.email, order.phone].join(' ').toLowerCase();
      return (!query || text.includes(query)) && (!status || order.order_status === status) && (!payment || order.payment_status === payment);
    });
  }
  function renderStats() {
    const open = orders.filter((order) => ['pending','confirmed'].includes(order.order_status)).length;
    const shipping = orders.filter((order) => ['processing','shipped'].includes(order.order_status)).length;
    const gross = orders.filter((order) => !['cancelled','refunded'].includes(order.order_status))
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const cards = panel.querySelectorAll('#order-admin-stats strong');
    if (cards.length === 4) {
      cards[0].textContent = String(orders.length);
      cards[1].textContent = String(open);
      cards[2].textContent = String(shipping);
      cards[3].textContent = money(gross);
    }
  }
  function renderList() {
    const rows = visibleOrders();
    if (!rows.length) {
      list.innerHTML = '<div class="panel"><h3 class="serif">No matching orders</h3><p>Orders will appear here after customers place them successfully.</p></div>';
      return;
    }
    list.innerHTML = rows.map((order) => `
      <button class="order-list-item ${order.id === selectedId ? 'selected' : ''}" type="button" data-order-open="${escapeHtml(order.id)}">
        <span class="order-list-top"><strong>${escapeHtml(order.order_number)}</strong><span class="order-list-total">${money(order.total)}</span></span>
        <span>${escapeHtml(order.customer_name)}</span><small>${escapeHtml(order.email)} · ${escapeHtml(order.phone)}</small>
        <span class="order-list-bottom"><span class="badge">${escapeHtml(label(order.order_status))}</span><span class="badge">${escapeHtml(label(order.payment_status))}</span><small>${escapeHtml(formatDate(order.created_at))}</small></span>
      </button>`).join('');
  }
  async function refresh() {
    const refreshButton = panel.querySelector('[data-orders-refresh]');
    if (busy) return;
    busy = true;
    if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = 'Loading…'; }
    showMessage('Loading latest orders…');
    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(250);
      if (error) throw error;
      orders = Array.isArray(data) ? data : [];
      renderStats();
      renderList();
      if (selectedId && orders.some((order) => order.id === selectedId)) await openOrder(selectedId);
      else if (orders.length && !selectedId) {
        detail.innerHTML = '<div class="panel"><h3 class="serif">Orders are ready</h3><p>Select any order on the left to review it.</p></div>';
      } else if (!orders.length) {
        detail.innerHTML = '<div class="panel"><h3 class="serif">Your orders workspace is ready</h3><p>There are no orders yet. A successful checkout will create a persistent order here.</p></div>';
      }
      showMessage('Loaded ' + orders.length + ' recent order' + (orders.length === 1 ? '' : 's') + '.');
    } catch (error) {
      console.error('Order management could not load:', error);
      orders = [];
      renderStats();
      list.innerHTML = '<div class="panel"><h3 class="serif">Orders are not available yet</h3><p>Apply the e-commerce orders database migration to this Supabase project, then refresh. The customer checkout and order-management screen depend on its secure database functions.</p><p class="admin-help">' + escapeHtml(error?.message || 'Request failed') + '</p></div>';
      detail.innerHTML = '';
      showMessage('Could not load orders. Check the database migration and access policies.', true);
    } finally {
      busy = false;
      if (refreshButton) { refreshButton.disabled = false; refreshButton.textContent = 'Refresh'; }
    }
  }
  async function openOrder(id) {
    selectedId = id;
    const order = selectedOrder();
    renderList();
    if (!order) return;
    detail.innerHTML = '<div class="panel"><p>Loading order details…</p></div>';
    try {
      const { data: items, error } = await supabase.from('order_items').select('*')
        .eq('order_id', id).order('created_at', { ascending: true });
      if (error) throw error;
      detail.innerHTML = `
        <section class="panel order-detail-admin">
          <div class="admin-panel-heading"><div><span class="eyebrow">Order details</span><h2 class="serif">${escapeHtml(order.order_number)}</h2><p>Placed ${escapeHtml(formatDate(order.created_at))}</p></div><strong class="order-grand-total">${money(order.total)}</strong></div>
          <div class="order-customer-details"><h3>Customer & delivery</h3><p><strong>${escapeHtml(order.customer_name)}</strong></p><p>${escapeHtml(order.email)}</p><p>${escapeHtml(order.phone)}</p><p>${escapeHtml(order.shipping_address_line1)} ${escapeHtml(order.shipping_address_line2 || '')}</p><p>${escapeHtml([order.city, order.state, order.postal_code, order.country].filter(Boolean).join(', '))}</p>${order.customer_notes ? '<p><strong>Instructions:</strong> ' + escapeHtml(order.customer_notes) + '</p>' : ''}</div>
          <h3>Ordered items</h3><div class="order-items-list">${(items || []).map((item) => `<div class="order-item-line"><div><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.sku || item.product_slug)} · ${Number(item.size_ml || 0)} ml × ${Number(item.quantity || 0)}</small></div><strong>${money(item.line_total)}</strong></div>`).join('') || '<p>No line items were returned.</p>'}</div>
          <div class="order-total-lines"><p>Subtotal <strong>${money(order.subtotal)}</strong></p><p>Shipping <strong>${Number(order.shipping_fee || 0) ? money(order.shipping_fee) : 'Free'}</strong></p>${Number(order.discount_amount || 0) ? '<p>Discount <strong>−' + money(order.discount_amount) + '</strong></p>' : ''}<h3>Total <strong>${money(order.total)}</strong></h3></div>
          <form id="order-admin-update" data-order-id="${escapeHtml(order.id)}" class="admin-form order-update-form">
            <h3>Fulfilment & payment</h3>
            <label>Order status<select name="order_status">${ORDER_STATUSES.map((s) => `<option value="${s}" ${s === order.order_status ? 'selected' : ''}>${escapeHtml(label(s))}</option>`).join('')}</select></label>
            <label>Payment status<select name="payment_status">${PAYMENT_STATUSES.map((s) => `<option value="${s}" ${s === order.payment_status ? 'selected' : ''}>${escapeHtml(label(s))}</option>`).join('')}</select></label>
            <label>Carrier / delivery partner<input name="carrier" maxlength="120" value="${escapeHtml(order.carrier || '')}" placeholder="Delivery partner"></label>
            <label>Tracking number<input name="tracking_number" maxlength="180" value="${escapeHtml(order.tracking_number || '')}" placeholder="Shipment reference"></label>
            <label class="wide">Customer-facing status note<textarea name="status_note" rows="2" maxlength="1000" placeholder="Optional update">${escapeHtml(order.status_note || '')}</textarea></label>
            <div class="form-actions wide"><button class="btn" type="submit">Save order update</button><a class="btn light" href="mailto:${encodeURIComponent(order.email)}">Email customer</a></div>
            <p class="admin-help wide">Cancellation before dispatch restores the ordered quantities to inventory. Shipped/delivered orders must use the return/refund process.</p>
          </form>
        </section>`;
    } catch (error) {
      console.error('Could not load order line items:', error);
      detail.innerHTML = '<div class="panel"><h3 class="serif">Order details could not load</h3><p>' + escapeHtml(error?.message || 'Request failed') + '</p></div>';
    }
  }
  panel.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-order-open]');
    if (openButton) { openOrder(openButton.dataset.orderOpen); return; }
    if (event.target.closest('[data-orders-refresh]')) refresh();
    if (event.target.closest('[data-orders-export]')) exportOrders();
  });
  panel.addEventListener('input', (event) => {
    if (event.target.id === 'order-admin-search') renderList();
  });
  panel.addEventListener('change', (event) => {
    if (['order-admin-status','order-admin-payment'].includes(event.target.id)) renderList();
  });
  panel.addEventListener('submit', async (event) => {
    const form = event.target.closest('#order-admin-update');
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const args = {
      p_order_id: form.dataset.orderId,
      p_order_status: String(values.get('order_status') || ''),
      p_payment_status: String(values.get('payment_status') || ''),
      p_carrier: String(values.get('carrier') || '').trim() || null,
      p_tracking_number: String(values.get('tracking_number') || '').trim() || null,
      p_status_note: String(values.get('status_note') || '').trim() || null,
    };
    button.disabled = true; button.textContent = 'Saving…';
    try {
      const { error } = await supabase.rpc('admin_update_order', args);
      if (error) throw error;
      showMessage('Order updated successfully.');
      await refresh();
      await openOrder(args.p_order_id);
    } catch (error) {
      console.error('Could not update order:', error);
      showMessage(error?.message || 'Order update failed.', true);
    } finally {
      if (button.isConnected) { button.disabled = false; button.textContent = 'Save order update'; }
    }
  });
  function exportOrders() {
    const rows = visibleOrders();
    const columns = ['order_number','created_at','customer_name','email','phone','shipping_address_line1','shipping_address_line2','city','state','postal_code','country','subtotal','shipping_fee','discount_amount','total','payment_method','payment_status','order_status','carrier','tracking_number','status_note'];
    const csv = [columns.join(','), ...rows.map((row) => columns.map((key) => {
      return csvCell(row[key]);
    }).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'mystic-vibe-orders-' + new Date().toISOString().slice(0,10) + '.csv';
    link.click(); URL.revokeObjectURL(url);
  }
  refresh();
}
