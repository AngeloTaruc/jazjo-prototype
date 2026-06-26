-- Adds preparation workflow support and inventory movement audit history.

alter table if exists public.orders
  add column if not exists prepared_at timestamptz,
  add column if not exists prepared_by uuid,
  add column if not exists preparation_completed boolean not null default false;

create table if not exists public.order_preparation_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_sku text not null,
  product_name text not null,
  required_qty integer not null default 0,
  is_prepared boolean not null default false,
  prepared_by uuid,
  prepared_at timestamptz,
  validation_message text,
  created_at timestamptz not null default now(),
  unique (order_id, product_sku)
);

create index if not exists order_preparation_items_order_id_idx
  on public.order_preparation_items(order_id);

create table if not exists public.inventory_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  product_sku text,
  product_name text not null,
  order_id uuid,
  before_stock integer not null default 0,
  after_stock integer not null default 0,
  stock_added integer not null default 0,
  stock_deducted integer not null default 0,
  action text not null default 'update',
  remarks text,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_history_product_id_idx
  on public.inventory_history(product_id);

create index if not exists inventory_history_created_at_idx
  on public.inventory_history(created_at desc);
