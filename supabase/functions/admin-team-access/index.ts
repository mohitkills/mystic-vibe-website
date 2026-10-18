import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, x-client-info, content-type',
  'access-control-max-age': '86400',
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE_URL = 'https://mystic-vibe.vercel.app';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return respond(500, { error: 'Team access is not configured on the server.' });
  }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token || token === authorization) return respond(401, { error: 'Sign in before managing team access.' });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return respond(400, { error: 'Invalid request.' });
    body = parsed as Record<string, unknown>;
  } catch {
    return respond(400, { error: 'Request body must be valid JSON.' });
  }

  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userResult, error: userError } = await caller.auth.getUser(token);
  const user = userResult.user;
  if (userError || !user) return respond(401, { error: 'Your session is invalid or expired. Sign in again.' });

  const { data: isOwner, error: ownerError } = await caller.rpc('is_current_user_owner');
  if (ownerError) return respond(500, { error: 'Could not verify store-owner permissions.' });
  if (isOwner !== true) return respond(403, { error: 'Only the store owner can manage Admin Panel access.' });

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: members, error: membersError } = await service.rpc('admin_team_members');
  if (membersError) return respond(500, { error: 'Could not load team access records.' });
  const memberRows = Array.isArray(members) ? members as Array<{ user_id: string; role: string; created_at: string }> : [];
  const action = body.action;

  if (action === 'list') {
    const detailed = await Promise.all(memberRows.map(async (member) => {
      const { data, error } = await service.auth.admin.getUserById(member.user_id);
      return {
        user_id: member.user_id,
        role: member.role,
        created_at: member.created_at,
        email: error ? null : (data.user?.email || null),
        last_sign_in_at: error ? null : (data.user?.last_sign_in_at || null),
      };
    }));
    return respond(200, { members: detailed, current_user_id: user.id });
  }

  if (action === 'invite') {
    const email = normalizeEmail(body.email);
    if (!email) return respond(400, { error: 'Enter a valid email address.' });

    for (const member of memberRows) {
      const { data } = await service.auth.admin.getUserById(member.user_id);
      if (data.user?.email?.toLowerCase() === email) {
        return respond(409, { error: 'This person already has Admin Panel access.' });
      }
    }

    let targetUserId = '';
    let invitationSent = false;
    const { data: invitation, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: SITE_URL + '/admin.html',
    });
    if (!inviteError && invitation.user?.id) {
      targetUserId = invitation.user.id;
      invitationSent = true;
    } else {
      // If an account already exists, allow the owner to grant it access without
      // resetting that person's password or sending credentials by email.
      let existingUser: { id: string; email?: string } | null = null;
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) break;
        const found = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
        if (found) { existingUser = found; break; }
        if (data.users.length < 1000) break;
      }
      if (!existingUser) {
        return respond(400, { error: inviteError?.message || 'Could not send an invitation to this email.' });
      }
      targetUserId = existingUser.id;
    }

    const { data: granted, error: grantError } = await service.rpc('admin_team_set_access', {
      p_user_id: targetUserId,
      p_enabled: true,
    });
    if (grantError || granted !== true) {
      return respond(500, { error: 'The invite was processed but admin access could not be saved. Refresh the team list and retry for this email.' });
    }

    return respond(200, {
      ok: true,
      invitation_sent: invitationSent,
      message: invitationSent
        ? 'Invitation sent. This person will get Admin Panel access after accepting the email invitation.'
        : 'This email already has an account. Admin access is enabled; they can sign in with their existing account.',
    });
  }

  if (action === 'revoke') {
    const targetId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
      return respond(400, { error: 'Choose a valid team member.' });
    }
    if (targetId === user.id) return respond(400, { error: 'You cannot revoke your own owner access.' });
    const target = memberRows.find((member) => member.user_id === targetId);
    if (!target) return respond(404, { error: 'This account does not currently have admin access.' });
    if (target.role === 'owner') return respond(409, { error: 'The store owner cannot be removed.' });

    const { data: revoked, error: revokeError } = await service.rpc('admin_team_set_access', {
      p_user_id: targetId,
      p_enabled: false,
    });
    if (revokeError) return respond(500, { error: 'Could not revoke access. Refresh the team list and try again.' });
    if (revoked !== true) return respond(404, { error: 'This account no longer has admin access.' });
    return respond(200, { ok: true, message: 'Admin access revoked. This account will no longer pass the dashboard permission check.' });
  }

  return respond(400, { error: 'Unsupported team access action.' });
});
