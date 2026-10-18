begin;

alter table private.admin_users
  add column if not exists role text not null default 'admin';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'admin_users_role_check'
      and conrelid = 'private.admin_users'::regclass
  ) then
    alter table private.admin_users
      add constraint admin_users_role_check check (role in ('owner', 'admin'));
  end if;
end
$$;

-- Preserve a single initial owner from the existing allow-list. Once an owner
-- exists, subsequent migrations never promote another administrator.
update private.admin_users
set role = 'owner'
where user_id = (
  select user_id
  from private.admin_users
  order by created_at asc, user_id asc
  limit 1
)
and not exists (
  select 1 from private.admin_users where role = 'owner'
);

create or replace function public.is_current_user_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from private.admin_users
    where user_id = (select auth.uid())
      and role = 'owner'
  );
$function$;

revoke all on function public.is_current_user_owner() from public, anon, authenticated;
grant execute on function public.is_current_user_owner() to authenticated;

-- These service-role-only functions are called by the admin-team-access Edge
-- Function after it verifies the caller's user JWT and owner status.
create or replace function public.admin_team_members()
returns table(user_id uuid, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select a.user_id, a.role, a.created_at
  from private.admin_users a
  order by a.created_at asc, a.user_id asc;
$function$;

revoke all on function public.admin_team_members() from public, anon, authenticated;
grant execute on function public.admin_team_members() to service_role;

create or replace function public.admin_team_set_access(p_user_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  changed_rows integer := 0;
begin
  if p_user_id is null or p_enabled is null then
    raise exception 'A target user and access state are required.';
  end if;

  if p_enabled then
    insert into private.admin_users(user_id, role)
    values (p_user_id, 'admin')
    on conflict (user_id) do update
      set role = case
        when private.admin_users.role = 'owner' then 'owner'
        else 'admin'
      end;
    return true;
  end if;

  delete from private.admin_users
  where user_id = p_user_id
    and role = 'admin';

  get diagnostics changed_rows = row_count;
  if changed_rows > 0 then
    return true;
  end if;

  if exists (
    select 1 from private.admin_users
    where user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'The store owner cannot be removed from Admin Access.';
  end if;

  return false;
end;
$function$;

revoke all on function public.admin_team_set_access(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_team_set_access(uuid, boolean) to service_role;

commit;
