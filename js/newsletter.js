import { supabase } from './supabase-client.js';

const forms = document.querySelectorAll('form[data-newsletter]');
forms.forEach((form) => {
  if (form.dataset.newsletterReady === 'true') return;
  form.dataset.newsletterReady = 'true';
  const input = form.querySelector('input[type="email"]');
  const button = form.querySelector('button[type="submit"], button:not([type])');
  const status = document.createElement('p');
  status.className = 'newsletter-feedback';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.insertAdjacentElement('afterend', status);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!input || !form.reportValidity()) return;
    const email = input.value.trim().toLowerCase();
    if (email.length > 254) {
      status.textContent = 'Please use an email address under 255 characters.';
      status.classList.add('error');
      return;
    }
    if (button) { button.disabled = true; button.textContent = 'Joining…'; }
    status.textContent = 'Adding you to the list…';
    status.classList.remove('error');
    try {
      const { data, error } = await supabase.rpc('subscribe_newsletter', {
        p_email: email,
        p_source: 'homepage',
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || result.ok !== true) throw new Error('The signup could not be confirmed.');
      form.reset();
      status.textContent = 'You’re on the list. Watch your inbox for Mystic Vibe updates.';
    } catch (error) {
      console.error('Newsletter signup failed:', error);
      status.textContent = error?.message || 'We could not save your email. Please try again later.';
      status.classList.add('error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Join The List'; }
    }
  });
});
