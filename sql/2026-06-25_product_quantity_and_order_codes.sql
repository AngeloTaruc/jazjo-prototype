alter table if exists public.products
  add column if not exists quantity_per_case integer not null default 1;

alter table if exists public.products
  add constraint products_quantity_per_case_positive
  check (quantity_per_case > 0);

create unique index if not exists orders_order_code_unique_idx
  on public.orders (order_code);
