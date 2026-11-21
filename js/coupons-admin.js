const TYPES = ['percent','fixed'];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const money = (value) => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const dateTimeLocal = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,16);
};
export function initializeCouponsAdmin(supabase) {
  const panel = document.querySelector('[data-panel="coupons"]');
  if (!panel || panel.dataset.couponsReady === 'true') return;
  panel.dataset.couponsReady = 'true';
  const form = panel.querySelector('#coupon-form');
  const list = panel.querySelector('#coupon-list');
  const status = panel.querySelector('#coupon-admin-status');
  let coupons = [];
  function say(message, error = false) { status.textContent = message; status.classList.toggle('error', error); }
  function reset() {
    form.reset(); form.elements.namedItem('id').value = '';
    form.elements.namedItem('per_customer_limit').value = '1';
    form.elements.namedItem('is_active').checked = true;
    form.hidden = true;
  }
  async function load() {
    say('Loading coupons…');
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) {
      coupons = [];
      list.innerHTML = '<div class="panel"><h3 class="serif">Coupons are not available yet</h3><p>Apply the e-commerce orders migration to enable secure coupon management.</p><p class="admin-help">' + escapeHtml(error.message) + '</p></div>';
      say('Coupon list unavailable.', true); return;
    }
    coupons = data || [];
    render();
    say('Loaded ' + coupons.length + ' coupon' + (coupons.length === 1 ? '' : 's') + '.');
  }
  function render() {
    if (!coupons.length) {
      list.innerHTML = '<div class="panel"><h3 class="serif">No coupons yet</h3><p>Create a coupon to offer a verified discount at checkout.</p></div>';
      return;
    }
    list.innerHTML = coupons.map((coupon) => `
      <article class="coupon-record panel">
        <div><span class="eyebrow">${coupon.is_active ? 'Active' : 'Inactive'}</span><h3 class="serif">${escapeHtml(coupon.code)}</h3><p>${escapeHtml(coupon.description || 'Store promotion')}</p></div>
        <div class="coupon-record-metrics"><strong>${coupon.discount_type === 'percent' ? Number(coupon.discount_value) + '%' : money(coupon.discount_value)}</strong><small>Minimum ${money(coupon.minimum_order_value)}</small><small>Used ${Number(coupon.usage_count || 0)}${coupon.usage_limit ? ' / ' + Number(coupon.usage_limit) : ''}</small><small>Per email: ${coupon.per_customer_limit === 0 ? 'Unlimited' : Number(coupon.per_customer_limit)}</small></div>
        <div class="coupon-record-actions"><button class="btn light" type="button" data-coupon-edit="${escapeHtml(coupon.id)}">Edit</button><button class="btn light" type="button" data-coupon-toggle="${escapeHtml(coupon.id)}">${coupon.is_active ? 'Deactivate' : 'Activate'}</button></div>
      </article>`).join('');
  }
  function edit(id) {
    const coupon = coupons.find((item) => item.id === id);
    if (!coupon) return;
    form.elements.namedItem('id').value = coupon.id;
    form.elements.namedItem('code').value = coupon.code || '';
    form.elements.namedItem('description').value = coupon.description || '';
    form.elements.namedItem('discount_type').value = coupon.discount_type;
    form.elements.namedItem('discount_value').value = String(coupon.discount_value);
    form.elements.namedItem('minimum_order_value').value = String(coupon.minimum_order_value ?? 0);
    form.elements.namedItem('maximum_discount').value = coupon.maximum_discount == null ? '' : String(coupon.maximum_discount);
    form.elements.namedItem('usage_limit').value = coupon.usage_limit == null ? '' : String(coupon.usage_limit);
    form.elements.namedItem('per_customer_limit').value = String(coupon.per_customer_limit ?? 1);
    form.elements.namedItem('starts_at').value = dateTimeLocal(coupon.starts_at);
    form.elements.namedItem('ends_at').value = dateTimeLocal(coupon.ends_at);
    form.elements.namedItem('is_active').checked = coupon.is_active === true;
    form.hidden = false; form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  panel.addEventListener('click', async (event) => {
    if (event.target.closest('[data-coupon-new]')) {
      reset(); form.hidden = false; form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.elements.namedItem('code').focus(); return;
    }
    if (event.target.closest('[data-coupon-cancel]')) { reset(); return; }
    const editButton = event.target.closest('[data-coupon-edit]');
    if (editButton) { edit(editButton.dataset.couponEdit); return; }
    const toggle = event.target.closest('[data-coupon-toggle]');
    if (!toggle) return;
    const coupon = coupons.find((item) => item.id === toggle.dataset.couponToggle);
    if (!coupon) return;
    toggle.disabled = true;
    try {
      const { error } = await supabase.from('coupons').update({
        is_active: !coupon.is_active, updated_at: new Date().toISOString(),
      }).eq('id', coupon.id);
      if (error) throw error;
      say(coupon.is_active ? 'Coupon deactivated.' : 'Coupon activated.');
      await load();
    } catch (error) { say(error?.message || 'Coupon could not be updated.', true); }
    finally { toggle.disabled = false; }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const id = String(values.get('id') || '');
    const code = String(values.get('code') || '').trim().toUpperCase();
    const type = String(values.get('discount_type') || '');
    const value = Number(values.get('discount_value'));
    const minimum = Number(values.get('minimum_order_value') || 0);
    const maximum = String(values.get('maximum_discount') || '').trim();
    const limit = String(values.get('usage_limit') || '').trim();
    const perCustomer = Number(values.get('per_customer_limit'));
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) { say('Coupon code must use 3–40 letters, numbers, underscores or hyphens.', true); return; }
    if (!TYPES.includes(type) || !Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 100)) {
      say('Enter a valid discount type and value. Percentage offers cannot exceed 100%.', true); return;
    }
    if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1000000 ||
        (maximum && (!Number.isFinite(Number(maximum)) || Number(maximum) < 0 || Number(maximum) > 1000000)) ||
        (limit && (!Number.isSafeInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 10000000)) ||
        !Number.isSafeInteger(perCustomer) || perCustomer < 0 || perCustomer > 1000) {
      say('Check the minimum value, discount cap and redemption limits.', true); return;
    }
    const starts = String(values.get('starts_at') || '');
    const ends = String(values.get('ends_at') || '');
    const startsAt = starts ? new Date(starts).toISOString() : null;
    const endsAt = ends ? new Date(ends).toISOString() : null;
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { say('The coupon end time must be after the start time.', true); return; }
    const payload = {
      code, description: String(values.get('description') || '').trim(),
      discount_type: type, discount_value: value, minimum_order_value: minimum,
      maximum_discount: maximum ? Number(maximum) : null,
      usage_limit: limit ? Number(limit) : null,
      per_customer_limit: perCustomer,
      starts_at: startsAt, ends_at: endsAt,
      is_active: form.elements.namedItem('is_active').checked,
      updated_at: new Date().toISOString(),
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Saving…';
    try {
      const query = id
        ? supabase.from('coupons').update(payload).eq('id', id)
        : supabase.from('coupons').insert(payload);
      const { error } = await query;
      if (error) throw error;
      reset(); say('Coupon saved. Checkout validates discounts and limits server-side.'); await load();
    } catch (error) { say(error?.message || 'Coupon could not be saved.', true); }
    finally { button.disabled = false; button.textContent = 'Save coupon'; }
  });
  load();
}
