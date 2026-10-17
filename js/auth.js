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
  document.querySelectorAll('.nav-actions a[href$="login.html"], .nav-actions a[href$="account.html"], .mobile-account-link').forEach(function (link) {
    const label = session ? 'Sign out' : 'Sign in';
    link.setAttribute('aria-label', label);
    link.setAttribute('title', label);
  });
}

document.addEventListener('click', async function (event) {
  const link = event.target.closest('.nav-actions a[href$="login.html"], .nav-actions a[href$="account.html"], .mobile-account-link');
  if (!link || !currentSession) return;

  event.preventDefault();
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    notify('Signed out.');
  } catch (error) {
    console.error('Supabase sign-out failed:', error);
    notify('Unable to sign out. Please try again.');
  }
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
