export function initializeTeamAccessAdmin(supabase) {
  const tab = document.querySelector('[data-tab="team"]');
  const panel = document.querySelector('[data-panel="team"]');
  const form = document.querySelector('#team-invite-form');
  const submit = document.querySelector('#team-invite-submit');
  const status = document.querySelector('#team-access-status');
  const list = document.querySelector('#team-member-list');
  const refreshButton = document.querySelector('#team-refresh');
  if (!tab || !panel || !form || !submit || !status || !list || !refreshButton) return;

  let currentUserId = '';
  let loading = false;
  const setStatus = (message, isError = false) => {
    status.textContent = message || '';
    status.classList.toggle('error', Boolean(isError));
  };

  async function invoke(payload) {
    const { data, error } = await supabase.functions.invoke('admin-team-access', { body: payload });
    if (error) {
      let responseBody = null;
      try {
        if (error.context && typeof error.context.clone === 'function') responseBody = await error.context.clone().json();
      } catch (ignored) {}
      const failure = new Error(responseBody?.error || error.message || 'Team access request failed.');
      failure.status = error.context?.status;
      throw failure;
    }
    if (!data || data.error) throw new Error(data?.error || 'Team access request returned no result.');
    return data;
  }

  function makeMember(member) {
    const row = document.createElement('article');
    row.className = 'admin-record';
    const main = document.createElement('div');
    main.className = 'admin-record-main';
    const copy = document.createElement('div');
    const email = document.createElement('strong');
    email.textContent = member.email || 'Email unavailable';
    const details = document.createElement('span');
    const role = member.role === 'owner' ? 'Store owner' : 'Administrator';
    const lastActive = member.last_sign_in_at
      ? 'Last sign-in ' + new Date(member.last_sign_in_at).toLocaleDateString()
      : 'Has not signed in yet';
    details.textContent = role + ' · Added ' + new Date(member.created_at).toLocaleDateString() + ' · ' + lastActive;
    copy.append(email, details);
    main.append(copy);
    row.append(main);

    if (member.role !== 'owner' && member.user_id !== currentUserId) {
      const actions = document.createElement('div');
      actions.className = 'admin-record-actions';
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'danger';
      revoke.textContent = 'Revoke access';
      revoke.dataset.revokeUserId = member.user_id;
      revoke.dataset.memberEmail = member.email || 'this account';
      actions.append(revoke);
      row.append(actions);
    }
    return row;
  }

  function renderMembers(members) {
    list.replaceChildren();
    if (!members.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-help';
      empty.textContent = 'No administrator accounts were returned.';
      list.append(empty);
      return;
    }
    members.forEach((member) => list.append(makeMember(member)));
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    refreshButton.disabled = true;
    list.replaceChildren();
    const loadingMessage = document.createElement('p');
    loadingMessage.className = 'admin-help';
    loadingMessage.textContent = 'Loading authorized accounts…';
    list.append(loadingMessage);
    try {
      const result = await invoke({ action: 'list' });
      currentUserId = result.current_user_id || '';
      renderMembers(Array.isArray(result.members) ? result.members : []);
      setStatus('Team access list is up to date.');
    } catch (error) {
      if (error.status === 403) {
        // Keep team membership details private from non-owner administrators.
        tab.hidden = true;
        panel.hidden = true;
        if (panel.classList.contains('active')) {
          document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === 'products'));
          document.querySelectorAll('[data-panel]').forEach((section) => {
            const active = section.dataset.panel === 'products';
            section.classList.toggle('active', active);
            section.hidden = !active;
          });
        }
        return;
      }
      list.replaceChildren();
      const failure = document.createElement('p');
      failure.className = 'admin-help';
      failure.textContent = error.message || 'Team access could not be loaded.';
      list.append(failure);
      setStatus(failure.textContent, true);
    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim().toLowerCase();
    submit.disabled = true;
    submit.textContent = 'Sending invitation…';
    setStatus('');
    try {
      const result = await invoke({ action: 'invite', email });
      form.reset();
      await refresh();
      setStatus(result.message || 'Team member updated.');
    } catch (error) {
      setStatus(error.message || 'The invitation could not be sent.', true);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Invite team member';
    }
  });

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-revoke-user-id]');
    if (!button || button.disabled) return;
    const email = button.dataset.memberEmail || 'this account';
    if (!window.confirm('Revoke Admin Panel access for ' + email + '? They will lose access to the dashboard.')) return;
    button.disabled = true;
    button.textContent = 'Revoking…';
    setStatus('');
    try {
      const result = await invoke({ action: 'revoke', user_id: button.dataset.revokeUserId });
      await refresh();
      setStatus(result.message || 'Admin access revoked.');
    } catch (error) {
      setStatus(error.message || 'Could not revoke admin access.', true);
      button.disabled = false;
      button.textContent = 'Revoke access';
    }
  });

  refreshButton.addEventListener('click', () => refresh());
  // Do not block the main dashboard if Team Access is unavailable.
  refresh().catch((error) => setStatus(error.message || 'Team access could not load.', true));
}
