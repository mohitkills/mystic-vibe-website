import { supabase } from './supabase-client.js';

const toggle = document.querySelector('[data-account-toggle]');
const panel = document.querySelector('[data-account-panel]');
const heading = document.querySelector('[data-account-menu-heading]');
const items = document.querySelector('[data-account-menu-items]');
if (toggle && panel && heading && items) {
  const homeUrl = new URL('../index.html', import.meta.url).href;
  const accountUrl = new URL('../account.html', import.meta.url).href;
  const settingsUrl = new URL('../profile-settings.html', import.meta.url).href;
  const loginUrl = new URL('../login.html', import.meta.url).href;
  const registerUrl = new URL('../register.html', import.meta.url).href;
  let signOutBusy = false;

  function addLink(href, label) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    items.append(link);
    return link;
  }

  function renderMenu(session) {
    items.replaceChildren();
    if (session && session.user) {
      heading.textContent = session.user.email || 'Your Mystic Vibe account';
      addLink(settingsUrl, 'Profile Settings');
      addLink(accountUrl, 'My Orders');
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'account-menu-logout';
      logout.dataset.accountLogout = '';
      logout.textContent = 'Log out';
      items.append(logout);
    } else {
      heading.textContent = 'Welcome to Mystic Vibe';
      addLink(loginUrl, 'Sign in');
      addLink(registerUrl, 'Create account');
      addLink(new URL('../tracking.html', import.meta.url).href, 'Track an order');
    }
  }

  toggle.addEventListener('click', function () {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-account-panel]') && !event.target.closest('[data-account-toggle]')) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });

  items.addEventListener('click', async function (event) {
    const logout = event.target.closest('[data-account-logout]');
    if (!logout || signOutBusy) return;
    signOutBusy = true;
    logout.disabled = true;
    logout.textContent = 'Signing out…';
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      window.location.assign(homeUrl);
    } catch (error) {
      console.error('Mystic Vibe sign-out failed:', error);
      heading.textContent = error?.message || 'Unable to sign out. Please try again.';
      logout.disabled = false;
      logout.textContent = 'Log out';
      signOutBusy = false;
    }
  });

  supabase.auth.onAuthStateChange(function (_event, session) {
    renderMenu(session);
  });
  supabase.auth.getSession().then(function ({ data, error }) {
    if (error) throw error;
    renderMenu(data?.session || null);
  }).catch(function (error) {
    console.error('Could not load the profile menu:', error);
    heading.textContent = 'Account options unavailable';
    items.replaceChildren();
    addLink(loginUrl, 'Sign in');
  });
}
