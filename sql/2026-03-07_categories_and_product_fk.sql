-- Categories normalization for ecommerce-style admin flow
-- Run this in Supabase SQL Editor before using category management features.

begin;

create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_name_unique_idx
  on public.categories (lower(name));

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

alter table public.products
  add column if not exists category_id uuid;

insert into public.categories (name)
select distinct trim(p.category) as name
from public.products p
where trim(coalesce(p.category, '')) <> ''
on conflict do nothing;

update public.products p
set category_id = c.id
from public.categories c
where p.category_id is null
  and lower(trim(coalesce(p.category, ''))) = lower(c.name);

insert into public.categories (name)
select 'Uncategorized'
where not exists (
  select 1 from public.categories where lower(name) = 'uncategorized'
);

update public.products p
set category_id = c.id
from public.categories c
where p.category_id is null
  and lower(c.name) = 'uncategorized';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_category_id_fkey'
  ) then
    alter table public.products
      add constraint products_category_id_fkey
      foreign key (category_id)
      references public.categories (id)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists products_category_id_idx
  on public.products (category_id);

alter table public.products
  alter column category_id set not null;

-- Keep legacy products.category text synced from categories.name for compatibility
update public.products p
set category = c.name
from public.categories c
where p.category_id = c.id
  and coalesce(p.category, '') <> c.name;

-- Optional hard-normalization:
-- After app code fully uses category_id, you may drop legacy text column:
-- alter table public.products drop column if exists category;

-- RLS setup for categories (readable by everyone; writes via backend/service role)
alter table public.categories enable row level security;

drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read"
on public.categories
for select
using (true);

commit;
