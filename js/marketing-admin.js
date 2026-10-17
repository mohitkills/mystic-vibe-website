const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const csvCell = (value) => {
  let safe = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(safe)) safe = "'" + safe;
  return '"' + safe.replace(/"/g, '""') + '"';
};
const dateText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};
export function initializeMarketingAdmin(supabase) {
  const panel = document.querySelector('[data-panel="marketing"]');
  if (!panel || panel.dataset.marketingReady === 'true') return;
  panel.dataset.marketingReady = 'true';
  panel.innerHTML = '<div class="admin-panel-heading"><div><span class="eyebrow">Customer engagement</span><h2 class="serif">Newsletter subscribers</h2><p>View subscriber emails, search the list and manage subscription status.</p></div><button class="btn light" type="button" data-marketing-refresh>Refresh</button></div>' +
    '<div class="order-admin-stats" id="marketing-stats"><div class="panel"><span>Total records</span><strong>—</strong></div><div class="panel"><span>Subscribed</span><strong>—</strong></div><div class="panel"><span>Unsubscribed</span><strong>—</strong></div></div>' +
    '<div class="customer-admin-tools"><label>Search email<input id="marketing-search" type="search" placeholder="Search email addresses"></label><button class="btn light" type="button" data-marketing-export>Export CSV</button></div>' +
    '<p id="marketing-status" class="admin-status" role="status" aria-live="polite"></p><div id="marketing-list" class="customer-admin-list" aria-live="polite"></div>';
  const status = panel.querySelector('#marketing-status');
  const list = panel.querySelector('#marketing-list');
  let rows = [];
  let busy = false;
  function say(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }
  function filtered() {
    const query = panel.querySelector('#marketing-search').value.trim().toLowerCase();
    return rows.filter((row) => row.email.toLowerCase().includes(query));
  }
  function renderStats() {
    const fields = panel.querySelectorAll('#marketing-stats strong');
    if (fields[0]) fields[0].textContent = String(rows.length);
    if (fields[1]) fields[1].textContent = String(rows.filter((row) => row.is_subscribed).length);
    if (fields[2]) fields[2].textContent = String(rows.filter((row) => !row.is_subscribed).length);
  }
  function render() {
    const items = filtered();
    if (!items.length) {
      list.innerHTML = '<div class="panel"><h3 class="serif">No subscribers found</h3><p>New newsletter signups will appear here after the newsletter migration is applied.</p></div>';
      return;
    }
    list.innerHTML = '<div class="panel customer-table-wrap"><table class="customer-admin-table"><thead><tr><th>Email</th><th>Status</th><th>Source</th><th>Subscribed at</th><th>Action</th></tr></thead><tbody>' +
      items.map((row) => '<tr><td><strong>' + escapeHtml(row.email) + '</strong></td><td><span class="badge">' + (row.is_subscribed ? 'Subscribed' : 'Unsubscribed') + '</span></td><td>' + escapeHtml(row.source || 'website') + '</td><td>' + escapeHtml(dateText(row.subscribed_at || row.created_at)) + '</td><td><button class="btn light" type="button" data-marketing-toggle="' + escapeHtml(row.id) + '">' + (row.is_subscribed ? 'Unsubscribe' : 'Resubscribe') + '</button></td></tr>').join('') +
      '</tbody></table></div>';
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    const button = panel.querySelector('[data-marketing-refresh]');
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    say('Loading subscribers…');
    try {
      const { data, error } = await supabase.from('newsletter_subscribers').select('id,email,source,is_subscribed,subscribed_at,unsubscribed_at,created_at').order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      rows = data || [];
      renderStats();
      render();
      say('Loaded ' + rows.length + ' newsletter subscriber records.');
    } catch (error) {
      rows = [];
      renderStats();
      list.innerHTML = '<div class="panel"><h3 class="serif">Newsletter records are not available yet</h3><p>Apply the e-commerce migration to enable subscriber storage, then refresh this panel.</p><p class="admin-help">' + escapeHtml(error?.message || 'Request failed') + '</p></div>';
      say('Could not load newsletter subscribers.', true);
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.textContent = 'Refresh'; }
    }
  }
  function exportCsv() {
    const columns = ['email','source','is_subscribed','subscribed_at','unsubscribed_at','created_at'];
    const csv = [columns.join(','), ...filtered().map((row) => columns.map((key) => csvCell(row[key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF',csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mystic-vibe-newsletter-' + new Date().toISOString().slice(0,10) + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  panel.addEventListener('input', (event) => {
    if (event.target.id === 'marketing-search') render();
  });
  panel.addEventListener('click', async (event) => {
    if (event.target.closest('[data-marketing-refresh]')) { refresh(); return; }
    if (event.target.closest('[data-marketing-export]')) { exportCsv(); return; }
    const button = event.target.closest('[data-marketing-toggle]');
    if (!button) return;
    const row = rows.find((item) => item.id === button.dataset.marketingToggle);
    if (!row) return;
    button.disabled = true;
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('newsletter_subscribers').update({
        is_subscribed: !row.is_subscribed,
        unsubscribed_at: row.is_subscribed ? now : null,
        updated_at: now,
      }).eq('id', row.id);
      if (error) throw error;
      say(row.is_subscribed ? 'Subscriber has been unsubscribed.' : 'Subscriber has been reactivated.');
      await refresh();
    } catch (error) { say(error?.message || 'Subscription status could not be updated.', true); }
    finally { button.disabled = false; }
  });
  refresh();
}
