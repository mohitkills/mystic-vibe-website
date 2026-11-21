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
