import { supabase } from './supabase-client.js';

const main = document.querySelector('main');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function showSignIn() {
  main.innerHTML = '<section class="page-hero"><div class="page-title"><span class="eyebrow">Your Mystic Vibe</span><h1 class="serif">Profile Settings</h1><p>Manage your account details securely.</p></div></section><section class="section"><div class="container"><div class="panel profile-settings-card"><h2 class="serif">Sign in to manage your profile</h2><p>Your profile settings are available after signing in.</p><a class="btn" href="login.html">Sign in</a> <a class="btn light" href="register.html">Create account</a></div></div></section>';
}

async function initialiseProfileSettings() {
  main.innerHTML = '<section class="page-hero"><div class="page-title"><span class="eyebrow">Your Mystic Vibe</span><h1 class="serif">Profile Settings</h1><p>Manage your name and account security.</p></div></section><section class="section"><div class="container"><div class="panel profile-settings-card">Loading your profile…</div></div></section>';
  const card = main.querySelector('.profile-settings-card');
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const user = data?.user;
    if (!user) {
      showSignIn();
      return;
    }
    const metadata = user.user_metadata || {};
    card.innerHTML = '<form id="profile-settings-form" class="profile-settings-form"><div class="profile-settings-intro"><span class="eyebrow">Account details</span><h2 class="serif">Personal information</h2><p>Keep your account details up to date.</p></div><label>First name<input name="first_name" autocomplete="given-name" maxlength="80" value="' + escapeHtml(metadata.first_name || '') + '" required></label><label>Last name<input name="last_name" autocomplete="family-name" maxlength="80" value="' + escapeHtml(metadata.last_name || '') + '"></label><label class="profile-settings-wide">Email address<input name="email" type="email" value="' + escapeHtml(user.email || '') + '" readonly aria-describedby="profile-email-help"></label><small id="profile-email-help" class="profile-settings-wide profile-settings-help">Email is read-only here. Use the account recovery flow if you need help securing your sign-in.</small><div class="profile-settings-divider profile-settings-wide"></div><div class="profile-settings-intro profile-settings-wide"><span class="eyebrow">Account security</span><h2 class="serif">Change password</h2><p>Leave these fields blank to keep your current password.</p></div><label>New password<input name="new_password" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label><label>Confirm new password<input name="confirm_password" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter new password"></label><p class="profile-settings-feedback profile-settings-wide" data-profile-feedback role="status" aria-live="polite" hidden></p><div class="profile-settings-actions profile-settings-wide"><a class="btn light" href="account.html">My Orders</a><button class="btn" type="submit">Save Changes</button></div></form>';
    const form = card.querySelector('#profile-settings-form');
    const feedback = form.querySelector('[data-profile-feedback]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector('button[type="submit"]');
      const firstName = form.elements.namedItem('first_name').value.trim();
      const lastName = form.elements.namedItem('last_name').value.trim();
      const password = form.elements.namedItem('new_password').value;
      const confirmPassword = form.elements.namedItem('confirm_password').value;
      feedback.hidden = true;
      feedback.classList.remove('error');
      if (password && password.length < 8) {
        feedback.textContent = 'Your new password must contain at least 8 characters.';
        feedback.hidden = false;
        feedback.classList.add('error');
        return;
      }
      if (password !== confirmPassword) {
        feedback.textContent = 'The new password and confirmation do not match.';
        feedback.hidden = false;
        feedback.classList.add('error');
        return;
      }
      const payload = {
        data: {
          ...metadata,
          first_name: firstName,
          last_name: lastName,
          full_name: [firstName, lastName].filter(Boolean).join(' '),
        },
      };
      if (password) payload.password = password;
      submit.disabled = true;
      submit.textContent = 'Saving…';
      try {
        const { data: updated, error: updateError } = await supabase.auth.updateUser(payload);
        if (updateError) throw updateError;
        if (updated?.user) Object.assign(metadata, updated.user.user_metadata || {});
        form.elements.namedItem('new_password').value = '';
        form.elements.namedItem('confirm_password').value = '';
        feedback.textContent = password ? 'Profile and password updated successfully.' : 'Profile updated successfully.';
        feedback.hidden = false;
      } catch (error) {
        feedback.textContent = error?.message || 'Your profile could not be updated. Please try again.';
        feedback.hidden = false;
        feedback.classList.add('error');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Save Changes';
      }
    });
  } catch (error) {
    console.error('Profile settings could not be loaded:', error);
    card.textContent = error?.message || 'Your profile could not be loaded. Please refresh and try again.';
  }
}

initialiseProfileSettings();
