import { supabase } from './supabase-client.js';
const page = document.body.dataset.page;
const authForm = ['login', 'register'].includes(page)
  ? document.querySelector('main form.form-grid')
  : null;
const resetRequestForm = page === 'forgot-password'
  ? document.querySelector('#password-reset-form')
  : null;
const passwordUpdateForm = page === 'reset-password'
  ? document.querySelector('#password-update-form')
  : null;
let currentSession = null;

function notify(message) {
  if (typeof window.toast === 'function') {
    window.toast(message);
  } else {
    console.error(message);
  }
}

function updateAccountLinks(session) {
  currentSession = session;
  // Profile actions now live in the dedicated profile menu. Opening My Account
  // must navigate to the account page and must never silently sign the user out.
  document.querySelectorAll('.nav-actions a[href$="login.html"]').forEach(function (link) {
    const label = session ? 'My account' : 'Sign in';
    link.setAttribute('aria-label', label);
    link.setAttribute('title', label);
  });
}

document.addEventListener('click', function (event) {
  const link = event.target.closest('.nav-actions a[href$="login.html"]');
  if (!link || !currentSession) return;
  event.preventDefault();
  window.location.assign(new URL('/account.html', location.origin).href);
});

supabase.auth.onAuthStateChange(function (_event, session) {
  updateAccountLinks(session);
});

supabase.auth.getSession().then(function ({ data, error }) {
  if (error) {
    console.error('Unable to restore the Supabase session:', error);
    notify('Unable to restore your session. Please try again.');
    return;
  }
  updateAccountLinks(data.session);
}).catch(function (error) {
  console.error('Unable to restore the Supabase session:', error);
  notify('Unable to restore your session. Please try again.');
});

if (authForm) {
  const emailInput = authForm.querySelector('input[type="email"]');
  const passwordInput = authForm.querySelector('input[type="password"]');
  emailInput.required = true;
  emailInput.autocomplete = page === 'login' ? 'username' : 'email';
  passwordInput.required = true;
  passwordInput.autocomplete = page === 'login' ? 'current-password' : 'new-password';
  if (page === 'register') passwordInput.minLength = 8;

  // Add an accessible show/hide password control to both login and registration.
  const passwordField = document.createElement('div');
  passwordField.className = 'password-visibility-field full';
  passwordInput.replaceWith(passwordField);
  passwordField.appendChild(passwordInput);

  const visibilityButton = document.createElement('button');
  visibilityButton.type = 'button';
  visibilityButton.className = 'password-visibility-toggle';
  visibilityButton.setAttribute('aria-label', 'Show password');
  visibilityButton.setAttribute('aria-pressed', 'false');
  visibilityButton.title = 'Show password';
  const eyeIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.7"/></svg>';
  const eyeOffIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false"><path d="M3 3l18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a17 17 0 0 1-3.1 3.7M6.2 6.3C3.9 7.8 2.5 12 2.5 12s3.4 6 9.5 6c1 0 1.9-.2 2.7-.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  visibilityButton.innerHTML = eyeIcon;
  passwordField.appendChild(visibilityButton);

  visibilityButton.addEventListener('click', function () {
    const shouldShow = passwordInput.type === 'password';
    passwordInput.type = shouldShow ? 'text' : 'password';
    visibilityButton.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
    visibilityButton.setAttribute('aria-pressed', String(shouldShow));
    visibilityButton.title = shouldShow ? 'Hide password' : 'Show password';
    visibilityButton.innerHTML = shouldShow ? eyeOffIcon : eyeIcon;
  });

  if (page === 'login') {
    const resetLink = document.createElement('a');
    resetLink.className = 'full';
    resetLink.href = 'forgot-password.html';
    resetLink.textContent = 'Forgot your password?';
    authForm.appendChild(resetLink);
  }

  const feedback = document.createElement('p');
  feedback.className = 'full';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.hidden = true;
  authForm.appendChild(feedback);

  authForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const button = authForm.querySelector('button[type="submit"], button:not([type])');
    const buttonLabel = button?.textContent;
    feedback.hidden = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Please wait…';
    }

    try {
      let result;
      if (page === 'login') {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        const names = authForm.querySelectorAll('input:not([type])');
        const accountLink = document.querySelector('.nav-actions a[href$="login.html"]');
        const confirmationRedirect = new URL(
          accountLink?.getAttribute('href') || 'login.html',
          location.href,
        ).href;
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: confirmationRedirect,
            data: {
              first_name: names[0]?.value.trim() || '',
              last_name: names[1]?.value.trim() || '',
            },
          },
        });
      }

      if (result.error) throw result.error;

      if (page === 'register' && !result.data.session) {
        feedback.textContent = 'Registration submitted. If this address can be registered, check your email for a confirmation link before signing in.';
        feedback.hidden = false;
        return;
      }

      if (page === 'login') {
        let isAdmin = false;
        try {
          const roleResult = await supabase.rpc('is_current_user_admin');
          isAdmin = !roleResult.error && roleResult.data === true;
        } catch (roleError) {
          console.warn('Could not determine account role after sign-in:', roleError?.message || roleError);
        }
        window.location.assign(isAdmin ? 'admin.html' : 'account.html');
      } else {
        window.location.assign('index.html');
      }
    } catch (error) {
      console.error('Supabase authentication failed:', error);
      feedback.textContent = error.message || 'Authentication failed. Please try again.';
      feedback.hidden = false;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = buttonLabel;
      }
    }
  });
}

function attachFeedback(form) {
  const feedback = document.createElement('p');
  feedback.className = 'full';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.hidden = true;
  form.appendChild(feedback);
  return feedback;
}

function setBusy(button, busy, originalLabel) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? 'Please wait…' : originalLabel;
}

if (resetRequestForm) {
  const emailInput = resetRequestForm.querySelector('input[type="email"]');
  const button = resetRequestForm.querySelector('button[type="submit"]');
  const buttonLabel = button?.textContent;
  const feedback = attachFeedback(resetRequestForm);
  resetRequestForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    feedback.hidden = true;
    setBusy(button, true, buttonLabel);
    try {
      const redirectTo = new URL('reset-password.html', location.href).href;
      const { error } = await supabase.auth.resetPasswordForEmail(emailInput.value.trim(), { redirectTo });
      if (error) throw error;
      feedback.textContent = 'If an account exists for this address, a password reset link will arrive by email.';
      feedback.hidden = false;
    } catch (error) {
      console.error('Supabase password reset request failed:', error);
      feedback.textContent = error.message || 'Unable to request a password reset. Please try again.';
      feedback.hidden = false;
    } finally {
      setBusy(button, false, buttonLabel);
    }
  });
}

if (passwordUpdateForm) {
  const passwordInput = passwordUpdateForm.querySelector('input[type="password"]');
  const button = passwordUpdateForm.querySelector('button[type="submit"]');
  const buttonLabel = button?.textContent;
  const feedback = attachFeedback(passwordUpdateForm);
  passwordInput.required = true;
  passwordInput.minLength = 8;
  passwordInput.autocomplete = 'new-password';
  passwordUpdateForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    feedback.hidden = true;
    setBusy(button, true, buttonLabel);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordInput.value });
      if (error) throw error;
      feedback.textContent = 'Your password has been updated. You are signed in.';
      feedback.hidden = false;
      passwordUpdateForm.reset();
    } catch (error) {
      console.error('Supabase password update failed:', error);
      feedback.textContent = error.message || 'Unable to update your password. Request a new reset link and try again.';
      feedback.hidden = false;
    } finally {
      setBusy(button, false, buttonLabel);
    }
  });
}
