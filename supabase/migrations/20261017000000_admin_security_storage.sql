begin;

-- RLS remains the authorization boundary for content row access. Remove only
-- table privileges that are not needed by the browser roles.
revoke truncate, references, trigger on table
  public.products,
  public.collections,
  public.homepage_slides,
  public.site_content
from anon, authenticated;

-- The images bucket is private. Restrict new product/slide imagery to common
-- raster formats and cap each upload at 5 MiB.
do $migration$
declare
  updated_bucket_count integer;
begin
  update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
  where id = 'mystic-vibe-images';

  get diagnostics updated_bucket_count = row_count;
  if updated_bucket_count <> 1 then
    raise exception 'Expected to update exactly one mystic-vibe-images bucket; updated %', updated_bucket_count;
  end if;
end
$migration$;

-- Private bucket object access is limited to authenticated admins. These
-- policies deliberately do not grant access to anon or to other buckets.
drop policy if exists mystic_vibe_admin_select_objects on storage.objects;
create policy mystic_vibe_admin_select_objects
on storage.objects
for select
to authenticated
using (
  bucket_id in ('mystic-vibe-images', 'mystic-vibe-media')
  and private.is_admin()
);

drop policy if exists mystic_vibe_admin_insert_objects on storage.objects;
create policy mystic_vibe_admin_insert_objects
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('mystic-vibe-images', 'mystic-vibe-media')
  and private.is_admin()
);

drop policy if exists mystic_vibe_admin_update_objects on storage.objects;
create policy mystic_vibe_admin_update_objects
on storage.objects
for update
to authenticated
using (
  bucket_id in ('mystic-vibe-images', 'mystic-vibe-media')
  and private.is_admin()
)
with check (
  bucket_id in ('mystic-vibe-images', 'mystic-vibe-media')
  and private.is_admin()
);

drop policy if exists mystic_vibe_admin_delete_objects on storage.objects;
create policy mystic_vibe_admin_delete_objects
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('mystic-vibe-images', 'mystic-vibe-media')
  and private.is_admin()
);

-- Expose only the caller's own admin boolean through the public API schema.
-- The private admin_users table remains inaccessible to browser roles.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(private.is_admin(), false);
$function$;

revoke all on function public.is_current_user_admin() from public, anon, authenticated;
grant execute on function public.is_current_user_admin() to authenticated;

commit;
