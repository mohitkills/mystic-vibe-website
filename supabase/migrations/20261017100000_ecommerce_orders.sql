begin;

create table if not exists public.orders (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  email text not null,
  phone text not null,
  shipping_address_line1 text not null,
  shipping_address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'India',
  customer_notes text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  shipping_fee numeric(12,2) not null default 0 check (shipping_fee >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  coupon_code text,
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method text not null default 'cod' check (payment_method in ('cod')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded','cod_collected')),
  order_status text not null default 'pending' check (order_status in ('pending','confirmed','processing','shipped','delivered','cancelled','returned','refunded')),
  carrier text,
  tracking_number text,
  status_note text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.order_items (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_slug text not null,
  product_name text not null,
  sku text,
  size_ml integer,
  image_url text,
  quantity integer not null check (quantity between 1 and 20),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.coupons (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  code text not null unique check (code = pg_catalog.upper(pg_catalog.btrim(code)) and code ~ '^[A-Z0-9_-]{3,40}$'),
  description text not null default '',
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order_value numeric(12,2) not null default 0 check (minimum_order_value >= 0),
  maximum_discount numeric(12,2) check (maximum_discount is null or maximum_discount >= 0),
  usage_limit integer check (usage_limit is null or usage_limit >= 1),
  usage_count integer not null default 0 check (usage_count >= 0),
  per_customer_limit integer not null default 1 check (per_customer_limit >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (discount_type <> 'percent' or discount_value <= 100)
);

create table if not exists public.coupon_redemptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders (order_status, created_at desc);
create index if not exists orders_number_idx on public.orders (order_number);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists coupons_active_code_idx on public.coupons (code, is_active);
create index if not exists coupon_redemptions_customer_idx on public.coupon_redemptions (coupon_id, email, created_at desc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

revoke all on table public.orders, public.order_items from anon, authenticated;
grant select on table public.orders, public.order_items to authenticated;
revoke update on table public.orders from anon, authenticated;

revoke all on table public.coupons, public.coupon_redemptions from public, anon, authenticated;
grant select, insert, update, delete on table public.coupons to authenticated;
grant select on table public.coupon_redemptions to authenticated;

drop policy if exists orders_read_own_or_admin on public.orders;
create policy orders_read_own_or_admin on public.orders
  for select to authenticated
  using (auth.uid() = user_id or (select private.is_admin()));

drop policy if exists orders_update_admin_only on public.orders;
create policy orders_update_admin_only on public.orders
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists order_items_read_own_or_admin on public.order_items;
create policy order_items_read_own_or_admin on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or (select private.is_admin()))
    )
  );

drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all on public.coupons
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists coupon_redemptions_admin_read on public.coupon_redemptions;
create policy coupon_redemptions_admin_read on public.coupon_redemptions
  for select to authenticated
  using ((select private.is_admin()));

create or replace function public.place_order(
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text default 'cod',
  p_customer_notes text default null,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text := pg_catalog.btrim(coalesce(p_customer ->> 'full_name', ''));
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_customer ->> 'email', '')));
  v_phone text := pg_catalog.btrim(coalesce(p_customer ->> 'phone', ''));
  v_address1 text := pg_catalog.btrim(coalesce(p_customer ->> 'address_line1', ''));
  v_address2 text := nullif(pg_catalog.btrim(coalesce(p_customer ->> 'address_line2', '')), '');
  v_city text := pg_catalog.btrim(coalesce(p_customer ->> 'city', ''));
  v_state text := pg_catalog.btrim(coalesce(p_customer ->> 'state', ''));
  v_postal_code text := pg_catalog.btrim(coalesce(p_customer ->> 'postal_code', ''));
  v_country text := coalesce(nullif(pg_catalog.btrim(coalesce(p_customer ->> 'country', '')), ''), 'India');
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_slug text;
  v_quantity integer;
  v_product record;
  v_product_image text;
  v_subtotal numeric(12,2) := 0;
  v_line_total numeric(12,2);
  v_order_id uuid;
  v_order_number text;
  v_item_count integer := 0;
  v_shipping_settings jsonb := '{}'::jsonb;
  v_standard_shipping numeric(12,2) := 0;
  v_free_threshold numeric(12,2) := 0;
  v_shipping_fee numeric(12,2) := 0;
  v_cod_enabled boolean := true;
  v_coupon_code text := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_coupon_code, ''))), '');
  v_coupon public.coupons%rowtype;
  v_discount_amount numeric(12,2) := 0;
begin
  if pg_catalog.jsonb_typeof(p_customer) is distinct from 'object' then
    raise exception 'Customer details are required.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Your cart is invalid. Refresh the page and try again.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_items) < 1 or pg_catalog.jsonb_array_length(p_items) > 25 then
    raise exception 'Your cart must contain between 1 and 25 different products.' using errcode = '22023';
  end if;
  if pg_catalog.length(v_name) < 2 or pg_catalog.length(v_name) > 120 then
    raise exception 'Enter your full name.' using errcode = '22023';
  end if;
  if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' or pg_catalog.length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if v_phone !~ '^(\+91[- ]?)?[6-9][0-9]{9}$' then
    raise exception 'Enter a valid Indian mobile number.' using errcode = '22023';
  end if;
  if pg_catalog.length(v_address1) < 5 or pg_catalog.length(v_address1) > 240 then
    raise exception 'Enter your complete shipping address.' using errcode = '22023';
  end if;
  if pg_catalog.length(v_address2) > 240 or pg_catalog.length(v_city) < 2 or pg_catalog.length(v_city) > 100 then
    raise exception 'Enter a valid city and address.' using errcode = '22023';
  end if;
  if pg_catalog.length(v_state) < 2 or pg_catalog.length(v_state) > 100 then
    raise exception 'Enter your state.' using errcode = '22023';
  end if;
  if v_postal_code !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code.' using errcode = '22023';
  end if;
  if p_payment_method is distinct from 'cod' then
    raise exception 'Online payment is not enabled yet. Please choose Cash on Delivery.' using errcode = '22023';
  end if;

  select c.content_value into v_shipping_settings
  from public.site_content c
  where c.content_key = 'store.shipping' and c.is_published is true
  limit 1;

  if pg_catalog.jsonb_typeof(v_shipping_settings) = 'object' then
    if pg_catalog.jsonb_typeof(v_shipping_settings -> 'standard_fee') = 'number' then
      v_standard_shipping := (v_shipping_settings ->> 'standard_fee')::numeric;
    end if;
    if pg_catalog.jsonb_typeof(v_shipping_settings -> 'free_shipping_threshold') = 'number' then
      v_free_threshold := (v_shipping_settings ->> 'free_shipping_threshold')::numeric;
    end if;
    if pg_catalog.jsonb_typeof(v_shipping_settings -> 'cod_enabled') = 'boolean' then
      v_cod_enabled := (v_shipping_settings ->> 'cod_enabled')::boolean;
    end if;
  end if;
  if v_standard_shipping < 0 or v_standard_shipping > 100000 or v_free_threshold < 0 or v_free_threshold > 1000000 then
    raise exception 'Store shipping settings are invalid. Contact the store.' using errcode = 'P0001';
  end if;
  if not v_cod_enabled then
    raise exception 'Cash on Delivery is temporarily unavailable.' using errcode = 'P0001';
  end if;

  v_order_number := 'MV-' || pg_catalog.to_char(pg_catalog.clock_timestamp(), 'YYYYMMDD') || '-' ||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.orders (
    order_number, user_id, customer_name, email, phone,
    shipping_address_line1, shipping_address_line2, city, state, postal_code, country,
    customer_notes, subtotal, shipping_fee, discount_amount, coupon_code, total,
    payment_method, payment_status, order_status
  ) values (
    v_order_number, v_user_id, v_name, v_email, v_phone,
    v_address1, v_address2, v_city, v_state, v_postal_code, v_country,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_customer_notes, '')), 1000), ''),
    0, 0, 0, v_coupon_code, 0, 'cod', 'pending', 'pending'
  )
  returning id into v_order_id;

  for v_item in
    select line.value from pg_catalog.jsonb_array_elements(p_items) as line(value)
    order by line.value ->> 'slug'
  loop
    v_slug := pg_catalog.btrim(coalesce(v_item ->> 'slug', ''));
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'A product in your cart is invalid. Refresh your cart.' using errcode = '22023';
    end if;
    if coalesce(v_item ->> 'quantity', '') !~ '^[1-9][0-9]{0,1}$' then
      raise exception 'A product quantity is invalid.' using errcode = '22023';
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 20 then
      raise exception 'Quantity must be between 1 and 20 per product.' using errcode = '22023';
    end if;

    select p.id, p.name, p.slug, p.sku, p.size_ml, p.price, p.stock, p.image_urls
      into v_product
      from public.products p
      where p.slug = v_slug and p.is_published is true
      for update;
    if not found then
      raise exception 'One of the products in your cart is no longer available.' using errcode = 'P0001';
    end if;
    if v_product.price is null or v_product.price < 0 then
      raise exception 'A product price is invalid. Contact the store.' using errcode = 'P0001';
    end if;
    if coalesce(v_product.stock, 0) < v_quantity then
      raise exception 'Not enough stock for %. Available quantity: %.', v_product.name, coalesce(v_product.stock, 0) using errcode = 'P0001';
    end if;

    update public.products
      set stock = stock - v_quantity, updated_at = pg_catalog.now()
      where id = v_product.id and stock >= v_quantity;
    if not found then
      raise exception 'Stock changed while placing the order. Please retry.' using errcode = 'P0001';
    end if;

    v_product_image := null;
    if pg_catalog.jsonb_typeof(v_product.image_urls) = 'array' then
      v_product_image := v_product.image_urls ->> 0;
    elsif pg_catalog.jsonb_typeof(v_product.image_urls) = 'string' then
      v_product_image := v_product.image_urls #>> '{}';
    end if;

    v_line_total := pg_catalog.round(v_product.price::numeric * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_item_count := v_item_count + 1;
    insert into public.order_items (
      order_id, product_id, product_slug, product_name, sku, size_ml,
      image_url, quantity, unit_price, line_total
    ) values (
      v_order_id, v_product.id::text, v_product.slug, v_product.name, v_product.sku,
      v_product.size_ml, v_product_image, v_quantity, v_product.price::numeric, v_line_total
    );
  end loop;

  if v_item_count < 1 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;

  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where code = v_coupon_code for update;
    if not found or not v_coupon.is_active then
      raise exception 'This coupon code is invalid or inactive.' using errcode = 'P0001';
    end if;
    if v_coupon.starts_at is not null and v_coupon.starts_at > pg_catalog.now() then
      raise exception 'This coupon is not active yet.' using errcode = 'P0001';
    end if;
    if v_coupon.ends_at is not null and v_coupon.ends_at <= pg_catalog.now() then
      raise exception 'This coupon has expired.' using errcode = 'P0001';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception 'This coupon has reached its usage limit.' using errcode = 'P0001';
    end if;
    if v_subtotal < v_coupon.minimum_order_value then
      raise exception 'This coupon requires a minimum cart value of ₹%.' , v_coupon.minimum_order_value using errcode = 'P0001';
    end if;
    if v_coupon.per_customer_limit > 0 and (
      select pg_catalog.count(*) from public.coupon_redemptions cr
      where cr.coupon_id = v_coupon.id and pg_catalog.lower(cr.email) = v_email
    ) >= v_coupon.per_customer_limit then
      raise exception 'This coupon has already reached its usage limit for this email.' using errcode = 'P0001';
    end if;
    if v_coupon.discount_type = 'percent' then
      v_discount_amount := pg_catalog.round(v_subtotal * v_coupon.discount_value / 100, 2);
      if v_coupon.maximum_discount is not null then
        v_discount_amount := least(v_discount_amount, v_coupon.maximum_discount);
      end if;
    else
      v_discount_amount := v_coupon.discount_value;
    end if;
    v_discount_amount := least(v_subtotal, greatest(0, v_discount_amount));
  end if;

  v_shipping_fee := case
    when v_free_threshold > 0 and v_subtotal >= v_free_threshold then 0
    else v_standard_shipping
  end;

  update public.orders
    set subtotal = v_subtotal,
        shipping_fee = v_shipping_fee,
        discount_amount = v_discount_amount,
        coupon_code = v_coupon_code,
        total = greatest(0, v_subtotal + v_shipping_fee - v_discount_amount),
        updated_at = pg_catalog.now()
    where id = v_order_id;

  if v_coupon_code is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, email, discount_amount)
    values (v_coupon.id, v_order_id, v_user_id, v_email, v_discount_amount);
    update public.coupons set usage_count = usage_count + 1, updated_at = pg_catalog.now() where id = v_coupon.id;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_fee', v_shipping_fee,
    'discount_amount', v_discount_amount,
    'coupon_code', v_coupon_code,
    'total', greatest(0, v_subtotal + v_shipping_fee - v_discount_amount),
    'currency', 'INR',
    'payment_method', 'cod',
    'payment_status', 'pending',
    'order_status', 'pending'
  );
end;
$function$;

revoke all on function public.place_order(jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb, text, text, text) to anon, authenticated;

create or replace function public.lookup_order(p_order_number text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_order_number, ''))) < 8
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_order_number, ''))) > 40
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_email, ''))) > 254 then
    return null;
  end if;

  select pg_catalog.jsonb_build_object(
    'order_number', o.order_number,
    'created_at', o.created_at,
    'order_status', o.order_status,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'subtotal', o.subtotal,
    'shipping_fee', o.shipping_fee,
    'discount_amount', o.discount_amount,
    'coupon_code', o.coupon_code,
    'total', o.total,
    'carrier', o.carrier,
    'tracking_number', o.tracking_number,
    'status_note', o.status_note,
    'items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'product_name', i.product_name,
        'product_slug', i.product_slug,
        'size_ml', i.size_ml,
        'image_url', i.image_url,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'line_total', i.line_total
      ) order by i.created_at)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.orders o
  where pg_catalog.upper(o.order_number) = pg_catalog.upper(pg_catalog.btrim(p_order_number))
    and pg_catalog.lower(o.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  limit 1;

  return v_result;
end;
$function$;

revoke all on function public.lookup_order(text, text) from public, anon, authenticated;
grant execute on function public.lookup_order(text, text) to anon, authenticated;

create or replace function public.admin_update_order(
  p_order_id uuid,
  p_order_status text,
  p_payment_status text,
  p_carrier text default null,
  p_tracking_number text default null,
  p_status_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_carrier text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_carrier, '')), 120), '');
  v_tracking text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_tracking_number, '')), 180), '');
  v_note text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_status_note, '')), 1000), '');
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_order_status not in ('pending','confirmed','processing','shipped','delivered','cancelled','returned','refunded') then
    raise exception 'Invalid order status.' using errcode = '22023';
  end if;
  if p_payment_status not in ('pending','paid','failed','refunded','cod_collected') then
    raise exception 'Invalid payment status.' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_carrier, '')) > 120
     or pg_catalog.length(coalesce(p_tracking_number, '')) > 180
     or pg_catalog.length(coalesce(p_status_note, '')) > 1000 then
    raise exception 'One or more order fields exceed the allowed length.' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;

  if v_order.order_status = 'cancelled' and p_order_status <> 'cancelled' then
    raise exception 'A cancelled order cannot be reopened from this screen.' using errcode = '22023';
  end if;
  if p_order_status = 'cancelled' and v_order.order_status in ('shipped','delivered','returned','refunded') then
    raise exception 'An order that has shipped or completed cannot be cancelled. Use the return/refund process.' using errcode = '22023';
  end if;
  if v_order.order_status in ('returned','refunded') and p_order_status not in ('returned','refunded') then
    raise exception 'A returned or refunded order cannot be moved back to active fulfilment.' using errcode = '22023';
  end if;

  if p_order_status = 'cancelled' and v_order.order_status <> 'cancelled' then
    for v_item in
      select product_slug, pg_catalog.sum(quantity)::integer as quantity
      from public.order_items where order_id = p_order_id group by product_slug
    loop
      update public.products
      set stock = coalesce(stock, 0) + v_item.quantity, updated_at = pg_catalog.now()
      where slug = v_item.product_slug;
    end loop;
  end if;

  update public.orders
  set order_status = p_order_status, payment_status = p_payment_status,
      carrier = v_carrier, tracking_number = v_tracking, status_note = v_note,
      updated_at = pg_catalog.now()
  where id = p_order_id
  returning * into v_order;

  return pg_catalog.jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number,
    'order_status', v_order.order_status, 'payment_status', v_order.payment_status, 'updated_at', v_order.updated_at);
end;
$function$;

revoke all on function public.admin_update_order(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_order(uuid, text, text, text, text, text) to authenticated;


create or replace function public.preview_checkout(p_items jsonb, p_email text, p_coupon_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email,'')));
  v_code text := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_coupon_code,''))),'');
  v_coupon public.coupons%rowtype;
  v_item jsonb;
  v_slug text;
  v_qty integer;
  v_product record;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_ship numeric(12,2) := 0;
  v_fee numeric(12,2) := 0;
  v_threshold numeric(12,2) := 0;
  v_settings jsonb := '{}'::jsonb;
  v_cod boolean := true;
  v_lines jsonb := '[]'::jsonb;
begin
  if v_code is not null and (v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' or pg_catalog.length(v_email)>254) then
    raise exception 'Enter the checkout email before applying a coupon.' using errcode='22023';
  end if;
  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' or pg_catalog.jsonb_array_length(p_items)<1 or pg_catalog.jsonb_array_length(p_items)>25 then
    raise exception 'Your cart is empty or invalid.' using errcode='22023';
  end if;
  select c.content_value into v_settings from public.site_content c where c.content_key='store.shipping' and c.is_published is true limit 1;
  if pg_catalog.jsonb_typeof(v_settings)='object' then
    if pg_catalog.jsonb_typeof(v_settings->'standard_fee')='number' then v_fee := (v_settings->>'standard_fee')::numeric; end if;
    if pg_catalog.jsonb_typeof(v_settings->'free_shipping_threshold')='number' then v_threshold := (v_settings->>'free_shipping_threshold')::numeric; end if;
    if pg_catalog.jsonb_typeof(v_settings->'cod_enabled')='boolean' then v_cod := (v_settings->>'cod_enabled')::boolean; end if;
  end if;
  for v_item in select line.value from pg_catalog.jsonb_array_elements(p_items) as line(value) order by line.value->>'slug'
  loop
    v_slug := pg_catalog.btrim(coalesce(v_item->>'slug',''));
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,1}$' then
      raise exception 'A product or quantity in your cart is invalid.' using errcode='22023';
    end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty<1 or v_qty>20 then raise exception 'Quantity must be between 1 and 20.' using errcode='22023'; end if;
    select p.id,p.name,p.slug,p.sku,p.size_ml,p.price,p.stock into v_product from public.products p where p.slug=v_slug and p.is_published is true;
    if not found then raise exception 'A product in your cart is no longer available.' using errcode='P0001'; end if;
    if coalesce(v_product.stock,0)<v_qty then raise exception 'Not enough stock for %. Available: %.',v_product.name,coalesce(v_product.stock,0) using errcode='P0001'; end if;
    v_subtotal := v_subtotal + pg_catalog.round(v_product.price::numeric*v_qty,2);
    v_lines := v_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_slug',v_product.slug,'product_name',v_product.name,'sku',v_product.sku,'size_ml',v_product.size_ml,
      'quantity',v_qty,'unit_price',v_product.price,'line_total',pg_catalog.round(v_product.price::numeric*v_qty,2)));
  end loop;
  if v_code is not null then
    select * into v_coupon from public.coupons where code=v_code;
    if not found or not v_coupon.is_active then raise exception 'This coupon code is invalid or inactive.' using errcode='P0001'; end if;
    if v_coupon.starts_at is not null and v_coupon.starts_at>pg_catalog.now() then raise exception 'This coupon is not active yet.' using errcode='P0001'; end if;
    if v_coupon.ends_at is not null and v_coupon.ends_at<=pg_catalog.now() then raise exception 'This coupon has expired.' using errcode='P0001'; end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count>=v_coupon.usage_limit then raise exception 'This coupon has reached its usage limit.' using errcode='P0001'; end if;
    if v_subtotal<v_coupon.minimum_order_value then raise exception 'This coupon requires a minimum cart value of ₹%.' ,v_coupon.minimum_order_value using errcode='P0001'; end if;
    if v_coupon.per_customer_limit>0 and (select pg_catalog.count(*) from public.coupon_redemptions cr where cr.coupon_id=v_coupon.id and pg_catalog.lower(cr.email)=v_email)>=v_coupon.per_customer_limit then
      raise exception 'This coupon has already reached its usage limit for this email.' using errcode='P0001';
    end if;
    if v_coupon.discount_type='percent' then
      v_discount := pg_catalog.round(v_subtotal*v_coupon.discount_value/100,2);
      if v_coupon.maximum_discount is not null then v_discount := least(v_discount,v_coupon.maximum_discount); end if;
    else v_discount := v_coupon.discount_value;
    end if;
    v_discount := least(v_subtotal,greatest(0,v_discount));
  end if;
  v_ship := case when v_threshold>0 and v_subtotal>=v_threshold then 0 else v_fee end;
  return pg_catalog.jsonb_build_object('items',v_lines,'subtotal',v_subtotal,'shipping_fee',v_ship,
    'discount_amount',v_discount,'coupon_code',v_code,'total',greatest(0,v_subtotal+v_ship-v_discount),'currency','INR','cod_enabled',v_cod);
end;
$function$;

revoke all on function public.preview_checkout(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.preview_checkout(jsonb,text,text) to anon,authenticated;



create table if not exists public.newsletter_subscribers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  email text not null unique check (email = pg_catalog.lower(pg_catalog.btrim(email)) and pg_catalog.length(email) <= 254),
  source text not null default 'homepage',
  is_subscribed boolean not null default true,
  subscribed_at timestamptz not null default pg_catalog.now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists newsletter_subscribers_active_idx
  on public.newsletter_subscribers (is_subscribed, subscribed_at desc);

alter table public.newsletter_subscribers enable row level security;
revoke all on table public.newsletter_subscribers from public, anon, authenticated;
grant select, update on table public.newsletter_subscribers to authenticated;

drop policy if exists newsletter_subscribers_admin_all on public.newsletter_subscribers;
create policy newsletter_subscribers_admin_all on public.newsletter_subscribers
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create or replace function public.subscribe_newsletter(p_email text, p_source text default 'homepage')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_source text := pg_catalog.left(pg_catalog.btrim(coalesce(p_source, 'homepage')), 80);
begin
  if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' or pg_catalog.length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if v_source !~ '^[a-zA-Z0-9 _.-]{1,80}$' then
    v_source := 'website';
  end if;

  insert into public.newsletter_subscribers (email, source, is_subscribed, subscribed_at, unsubscribed_at, updated_at)
  values (v_email, v_source, true, pg_catalog.now(), null, pg_catalog.now())
  on conflict (email) do update
  set source = excluded.source,
      is_subscribed = true,
      subscribed_at = pg_catalog.now(),
      unsubscribed_at = null,
      updated_at = pg_catalog.now();

  return pg_catalog.jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.subscribe_newsletter(text, text) from public, anon, authenticated;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;


create or replace function public.cancel_order(p_order_number text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_order_number, ''))) < 8
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_order_number, ''))) > 40
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_email, ''))) > 254 then
    raise exception 'Enter the order number and checkout email used for this order.' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where pg_catalog.upper(order_number) = pg_catalog.upper(pg_catalog.btrim(p_order_number))
    and pg_catalog.lower(email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  for update;

  if not found then
    raise exception 'No order matched that order number and email.' using errcode = 'P0002';
  end if;
  if v_order.payment_method <> 'cod' then
    raise exception 'Online-payment orders require support to process a cancellation.' using errcode = '22023';
  end if;
  if v_order.order_status not in ('pending', 'confirmed') then
    raise exception 'This order can no longer be cancelled online. Please contact customer support.' using errcode = '22023';
  end if;

  for v_item in
    select product_slug, pg_catalog.sum(quantity)::integer as quantity
    from public.order_items
    where order_id = v_order.id
    group by product_slug
  loop
    update public.products
    set stock = coalesce(stock, 0) + v_item.quantity,
        updated_at = pg_catalog.now()
    where slug = v_item.product_slug;
  end loop;

  update public.orders
  set order_status = 'cancelled',
      status_note = 'Cancelled by customer',
      updated_at = pg_catalog.now()
  where id = v_order.id;

  return pg_catalog.jsonb_build_object(
    'order_number', v_order.order_number,
    'order_status', 'cancelled',
    'payment_status', v_order.payment_status
  );
end;
$function$;

revoke all on function public.cancel_order(text, text) from public, anon, authenticated;
grant execute on function public.cancel_order(text, text) to anon, authenticated;

commit;
