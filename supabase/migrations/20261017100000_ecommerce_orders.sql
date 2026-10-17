begin;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
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
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method text not null default 'cod' check (payment_method in ('cod')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded','cod_collected')),
  order_status text not null default 'pending' check (order_status in ('pending','confirmed','processing','shipped','delivered','cancelled','returned','refunded')),
  carrier text,
  tracking_number text,
  status_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
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
  created_at timestamptz not null default now()
);

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);
create index if not exists orders_status_created_idx
  on public.orders (order_status, created_at desc);
create index if not exists orders_number_idx
  on public.orders (order_number);
create index if not exists order_items_order_idx
  on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on table public.orders, public.order_items from anon, authenticated;
grant select on table public.orders, public.order_items to authenticated;
revoke update on table public.orders from anon, authenticated;

drop policy if exists orders_read_own_or_admin on public.orders;
create policy orders_read_own_or_admin
  on public.orders for select to authenticated
  using (auth.uid() = user_id or (select private.is_admin()));

drop policy if exists orders_update_admin_only on public.orders;
create policy orders_update_admin_only
  on public.orders for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists order_items_read_own_or_admin on public.order_items;
create policy order_items_read_own_or_admin
  on public.order_items for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or (select private.is_admin()))
    )
  );

create or replace function public.place_order(
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text default 'cod',
  p_customer_notes text default null
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
begin
  if pg_catalog.jsonb_typeof(p_customer) is distinct from 'object' then
    raise exception 'Customer details are required.' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Your cart is invalid. Please refresh and try again.' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_array_length(p_items) < 1 or pg_catalog.jsonb_array_length(p_items) > 25 then
    raise exception 'Your cart must contain between 1 and 25 different line items.' using errcode = '22023';
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
    raise exception 'Store shipping settings are invalid. Please contact the store.' using errcode = 'P0001';
  end if;
  if not v_cod_enabled then
    raise exception 'Cash on Delivery is temporarily unavailable. Please contact the store.' using errcode = 'P0001';
  end if;

  v_order_number := 'MV-' || pg_catalog.to_char(pg_catalog.clock_timestamp(), 'YYYYMMDD') || '-' ||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders (
    order_number, user_id, customer_name, email, phone,
    shipping_address_line1, shipping_address_line2, city, state, postal_code, country,
    customer_notes, subtotal, shipping_fee, discount_amount, total,
    payment_method, payment_status, order_status
  ) values (
    v_order_number, v_user_id, v_name, v_email, v_phone,
    v_address1, v_address2, v_city, v_state, v_postal_code, v_country,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_customer_notes, '')), 1000), ''),
    0, 0, 0, 0, 'cod', 'pending', 'pending'
  )
  returning id into v_order_id;

  -- Lock products in slug order so concurrent checkouts reserve stock atomically.
  for v_item in
    select line.value
    from pg_catalog.jsonb_array_elements(p_items) as line(value)
    order by line.value ->> 'slug'
  loop
    v_slug := pg_catalog.btrim(coalesce(v_item ->> 'slug', ''));
    if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'A product in your cart is invalid. Please refresh your cart.' using errcode = '22023';
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
      raise exception 'A product price is invalid. Please contact the store.' using errcode = 'P0001';
    end if;
    if coalesce(v_product.stock, 0) < v_quantity then
      raise exception 'Not enough stock for %. Available quantity: %.', v_product.name, coalesce(v_product.stock, 0) using errcode = 'P0001';
    end if;

    update public.products
      set stock = stock - v_quantity, updated_at = pg_catalog.now()
      where id = v_product.id and stock >= v_quantity;
    if not found then
      raise exception 'Stock changed while placing your order. Please retry.' using errcode = 'P0001';
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
      v_product.size_ml, v_product_image, v_quantity, v_product.price::numeric,
      v_line_total
    );
  end loop;

  if v_item_count < 1 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;

  v_shipping_fee := case
    when v_free_threshold > 0 and v_subtotal >= v_free_threshold then 0
    else v_standard_shipping
  end;

  update public.orders
    set subtotal = v_subtotal,
        shipping_fee = v_shipping_fee,
        total = v_subtotal + v_shipping_fee,
        updated_at = pg_catalog.now()
    where id = v_order_id;

  return pg_catalog.jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_fee', v_shipping_fee,
    'discount_amount', 0,
    'total', v_subtotal + v_shipping_fee,
    'currency', 'INR',
    'payment_method', 'cod',
    'payment_status', 'pending',
    'order_status', 'pending'
  );
end;
$function$;

revoke all on function public.place_order(jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb, text, text) to anon, authenticated;

create or replace function public.lookup_order(
  p_order_number text,
  p_email text
)
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
    'total', o.total,
    'carrier', o.carrier,
    'tracking_number', o.tracking_number,
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
      from public.order_items i
      where i.order_id = o.id
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

  select * into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  if v_order.order_status = 'cancelled' and p_order_status <> 'cancelled' then
    raise exception 'A cancelled order cannot be reopened from this screen.' using errcode = '22023';
  end if;
  if p_order_status = 'cancelled' and v_order.order_status in ('shipped','delivered','returned','refunded') then
    raise exception 'An order that has shipped or completed cannot be cancelled. Contact the customer to arrange a return or refund.' using errcode = '22023';
  end if;
  if v_order.order_status in ('returned','refunded') and p_order_status not in ('returned','refunded') then
    raise exception 'A returned or refunded order cannot be moved back to active fulfilment.' using errcode = '22023';
  end if;

  if p_order_status = 'cancelled' and v_order.order_status <> 'cancelled' then
    for v_item in
      select product_slug, pg_catalog.sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id
      group by product_slug
    loop
      update public.products
      set stock = coalesce(stock, 0) + v_item.quantity,
          updated_at = pg_catalog.now()
      where slug = v_item.product_slug;
    end loop;
  end if;

  update public.orders
  set order_status = p_order_status,
      payment_status = p_payment_status,
      carrier = v_carrier,
      tracking_number = v_tracking,
      status_note = v_note,
      updated_at = pg_catalog.now()
  where id = p_order_id
  returning * into v_order;

  return pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'order_status', v_order.order_status,
    'payment_status', v_order.payment_status,
    'updated_at', v_order.updated_at
  );
end;
$function$;

revoke all on function public.admin_update_order(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_order(uuid, text, text, text, text, text) to authenticated;

commit;
