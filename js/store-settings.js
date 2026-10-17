const DEFAULT_SHIPPING = { standard_fee: 0, free_shipping_threshold: 0, cod_enabled: true };
const DEFAULT_CONTACT = { support_email: '', whatsapp_phone: '', instagram_url: '', facebook_url: '' };
const validPublicUrl = (value) => {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid full HTTPS social profile URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Social profile links must use HTTPS and cannot contain credentials.');
  return url.href;
};
export function initializeStoreSettings(supabase) {
  const panel = document.querySelector('[data-panel="settings"]');
  if (!panel || panel.dataset.settingsReady === 'true') return;
  panel.dataset.settingsReady = 'true';
  const status = panel.querySelector('#store-settings-status');
  const shippingForm = panel.querySelector('#store-shipping-form');
  const contactForm = panel.querySelector('#store-contact-form');
  function show(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }
  function fillShipping(value) {
    const settings = { ...DEFAULT_SHIPPING, ...(value && typeof value === 'object' ? value : {}) };
    shippingForm.elements.namedItem('standard_fee').value = String(settings.standard_fee ?? 0);
    shippingForm.elements.namedItem('free_shipping_threshold').value = String(settings.free_shipping_threshold ?? 0);
    shippingForm.elements.namedItem('cod_enabled').checked = settings.cod_enabled !== false;
  }
  function fillContact(value) {
    const settings = { ...DEFAULT_CONTACT, ...(value && typeof value === 'object' ? value : {}) };
    for (const key of Object.keys(DEFAULT_CONTACT)) contactForm.elements.namedItem(key).value = String(settings[key] || '');
  }
  async function reload() {
    show('Loading settings…');
    const { data, error } = await supabase.from('site_content').select('content_key,content_value')
      .in('content_key', ['store.shipping','store.contact']);
    if (error) throw error;
    const map = new Map((data || []).map((row) => [row.content_key, row.content_value]));
    fillShipping(map.get('store.shipping'));
    fillContact(map.get('store.contact'));
    show('Settings loaded. Saving updates the live store configuration.');
  }
  async function save(key, value) {
    const payload = { content_key: key, content_value: value, is_published: true, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('site_content').upsert(payload, { onConflict: 'content_key' });
    if (error) throw error;
  }
  shippingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = shippingForm.querySelector('button[type="submit"]');
    const standardFee = Number(shippingForm.elements.namedItem('standard_fee').value);
    const threshold = Number(shippingForm.elements.namedItem('free_shipping_threshold').value);
    if (!Number.isFinite(standardFee) || standardFee < 0 || standardFee > 100000 ||
        !Number.isFinite(threshold) || threshold < 0 || threshold > 1000000) {
      show('Enter valid shipping values within the displayed limits.', true); return;
    }
    button.disabled = true; button.textContent = 'Saving…';
    try {
      await save('store.shipping', {
        standard_fee: Math.round(standardFee * 100) / 100,
        free_shipping_threshold: Math.round(threshold * 100) / 100,
        cod_enabled: shippingForm.elements.namedItem('cod_enabled').checked,
      });
      show('Shipping and COD settings saved.');
    } catch (error) {
      show(error?.message || 'Shipping settings could not be saved.', true);
    } finally { button.disabled = false; button.textContent = 'Save shipping settings'; }
  });
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = contactForm.querySelector('button[type="submit"]');
    const values = new FormData(contactForm);
    const phone = String(values.get('whatsapp_phone') || '').replace(/D/g, '');
    if (phone && !/^[1-9][0-9]{7,14}$/.test(phone)) {
      show('Enter a valid WhatsApp country code and phone number using digits only.', true); return;
    }
    let contact;
    try {
      contact = {
        support_email: String(values.get('support_email') || '').trim(),
        whatsapp_phone: phone,
        instagram_url: validPublicUrl(String(values.get('instagram_url') || '').trim()),
        facebook_url: validPublicUrl(String(values.get('facebook_url') || '').trim()),
      };
    } catch (error) { show(error.message, true); return; }
    button.disabled = true; button.textContent = 'Saving…';
    try {
      await save('store.contact', contact);
      show('Public contact settings saved. Refresh the storefront to see the changes.');
    } catch (error) { show(error?.message || 'Contact settings could not be saved.', true); }
    finally { button.disabled = false; button.textContent = 'Save contact settings'; }
  });
  reload().catch((error) => show('Settings could not load. Check the CMS content table and admin permissions. ' + (error?.message || ''), true));
}
