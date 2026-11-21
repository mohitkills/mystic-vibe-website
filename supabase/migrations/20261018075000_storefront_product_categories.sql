begin;

alter table public.products
  add column if not exists storefront_category text;

update public.products
set storefront_category = case
  when lower(coalesce(fragrance_family, '')) ~ '(marine|aquatic|fresh|citrus|fougere|blue)' then 'fresh-aquatic'
  when lower(coalesce(fragrance_family, '')) ~ '(woody|amber)' then 'woody-amber'
  when lower(coalesce(fragrance_family, '')) ~ '(fruity|floral|gourmand)' then 'fruity-floral'
  else 'perfumes'
end
where storefront_category is null;

alter table public.products
  alter column storefront_category set default 'perfumes',
  alter column storefront_category set not null;

alter table public.products
  add constraint products_storefront_category_check
  check (storefront_category in (
    'deals',
    'bestsellers',
    'perfumes',
    'fresh-aquatic',
    'woody-amber',
    'fruity-floral',
    'new-arrivals',
    'gift-sets'
  ));

create index if not exists products_storefront_category_published_idx
  on public.products (storefront_category, is_published, sort_order);

comment on column public.products.storefront_category is
  'Primary shopper-facing category used by the catalog navigation; Shop All and Perfumes intentionally include every published product.';

commit;
