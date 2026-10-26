const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const money = (value) => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const dateText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium' });
};
const stateLabel = (value) => String(value || 'pending').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const csvCell = (value) => {
  let safe = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(safe)) safe = "'" + safe;
  return '"' + safe.replace(/"/g, '""') + '"';
};

export function initializeCustomersAdmin(supabase) {
  const panel = document.querySelector('[data-panel="customers"]');
  if (!panel || panel.dataset.customersReady === 'true') return;
  panel.dataset.customersReady = 'true';
  panel.innerHTML = '<div class="admin-panel-heading"><div><span class="eyebrow">Customer directory</span><h2 class="serif">Customers</h2><p>Customers who have placed orders, with their latest contact details and order history.</p></div><button class="btn light" type="button" data-customers-refresh>Refresh</button></div>' +
    '<div class="order-admin-stats" id="customer-admin-stats"><div class="panel"><span>Customers</span><strong>—</strong></div><div class="panel"><span>Orders</span><strong>—</strong></div><div class="panel"><span>Order value (excl. cancellations)</span><strong>—</strong></div></div>' +
    '<div class="customer-admin-tools"><label>Search name, email or phone<input id="customer-admin-search" type="search" placeholder="Search customers"></label><button class="btn light" type="button" data-customers-export>Export CSV</button></div>' +
    '<p id="customers-admin-status" class="admin-status" role="status" aria-live="polite"></p><div id="customer-admin-list" class="customer-admin-list" aria-live="polite"></div>';
  const status = panel.querySelector('#customers-admin-status');
  const list = panel.querySelector('#customer-admin-list');
  let customers = [];
  let busy = false;
  const say = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };
  function filtered() {
    const q = panel.querySelector('#customer-admin-search').value.trim().toLowerCase();
    return customers.filter((customer) => [customer.name, customer.email, customer.phone].join(' ').toLowerCase().includes(q));
  }
  function renderStats() {
    const values = panel.querySelectorAll('#customer-admin-stats strong');
    const liveOrders = customers.reduce((sum, customer) => sum + customer.orders.length, 0);
    const orderValue = customers.reduce((sum, customer) => sum + customer.value, 0);
    if (values[0]) values[0].textContent = String(customers.length);
    if (values[1]) values[1].textContent = String(liveOrders);
    if (values[2]) values[2].textContent = money(orderValue);
  }
  function render() {
    const rows = filtered();
    if (!rows.length) {
      list.innerHTML = '<div class="panel"><h3 class="serif">No matching customers</h3><p>Customers will appear here when a successful checkout creates an order.</p></div>';
      return;
    }
    list.innerHTML = '<div class="panel customer-table-wrap"><table class="customer-admin-table"><thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Order value</th><th>Latest order</th></tr></thead><tbody>' +
      rows.map((customer) => '<tr><td><strong>' + escapeHtml(customer.name || 'Customer') + '</strong><small>' + escapeHtml(customer.email) + '</small></td>' +
        '<td>' + escapeHtml(customer.phone || '—') + '<small>' + escapeHtml(customer.city || '') + '</small></td>' +
        '<td>' + customer.orders.length + '</td><td><strong>' + money(customer.value) + '</strong></td>' +
        '<td><strong>' + escapeHtml(dateText(customer.latest.created_at)) + '</strong><small>' + escapeHtml(customer.latest.order_number) + '</small><button class="btn light customer-view-order" type="button" data-customer-order="' + escapeHtml(customer.latest.order_number) + '">View order</button></td></tr>'
      ).join('') + '</tbody></table></div>';
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    const button = panel.querySelector('[data-customers-refresh]');
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    say('Loading customer order records…');
    try {
      const { data, error } = await supabase.from('orders')
        .select('id,order_number,created_at,customer_name,email,phone,city,state,postal_code,shipping_address_line1,shipping_address_line2,country,total,order_status,payment_status')
        .order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      const byEmail = new Map();
      for (const order of data || []) {
        const email = String(order.email || '').trim().toLowerCase();
        const key = email || 'guest:' + order.order_number;
        if (!byEmail.has(key)) {
          byEmail.set(key, {
            name: order.customer_name || 'Customer', email: order.email || 'Guest checkout',
            phone: order.phone || '', city: order.city || '', orders: [], value: 0, latest: order,
          });
        }
        const customer = byEmail.get(key);
        customer.orders.push(order);
        if (!customer.phone && order.phone) customer.phone = order.phone;
        if (!customer.city && order.city) customer.city = order.city;
        if (!['cancelled','refunded','returned'].includes(order.order_status)) customer.value += Number(order.total || 0);
      }
      customers = [...byEmail.values()].sort((a,b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));
      renderStats(); render();
      say('Loaded ' + customers.length + ' customers from ' + (data || []).length + ' recent orders. Accounts with no orders are not included in this view.');
    } catch (error) {
      customers = []; renderStats();
      list.innerHTML = '<div class="panel"><h3 class="serif">Customer data is not available yet</h3><p>Apply the e-commerce orders migration and ensure the Admin role is active, then refresh.</p><p class="admin-help">' + escapeHtml(error?.message || 'Request failed') + '</p></div>';
      say('Could not load customer data.', true);
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.textContent = 'Refresh'; }
    }
  }
  function exportCsv() {
    const rows = filtered();
    const columns = ['name','email','phone','city','value','orders','latest_order_number','latest_order_status','latest_order_date'];
    const csv = [columns.join(','), ...rows.map((customer) => {
      const record = {
        name: customer.name, email: customer.email, phone: customer.phone, city: customer.city,
        value: customer.value, orders: customer.orders.length,
        latest_order_number: customer.latest.order_number, latest_order_status: customer.latest.order_status,
        latest_order_date: customer.latest.created_at,
      };
      return columns.map((key) => csvCell(record[key])).join(',');
    })].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF',csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'mystic-vibe-customers-' + new Date().toISOString().slice(0,10) + '.csv';
    link.click(); URL.revokeObjectURL(url);
  }
  panel.addEventListener('input', (event) => {
    if (event.target.id === 'customer-admin-search') render();
  });
  panel.addEventListener('click', (event) => {
    if (event.target.closest('[data-customers-refresh]')) { refresh(); return; }
    if (event.target.closest('[data-customers-export]')) { exportCsv(); return; }
    const orderButton = event.target.closest('[data-customer-order]');
    if (orderButton) {
      const search = document.querySelector('#order-admin-search');
      const orderTab = document.querySelector('[data-tab="orders"]');
      if (orderTab) orderTab.click();
      if (search) {
        search.value = orderButton.dataset.customerOrder;
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
  refresh();
}
