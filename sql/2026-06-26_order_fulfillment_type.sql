alter table public.orders
  add column if not exists fulfillment_type text not null default 'delivery';

update public.orders
set fulfillment_type = 'delivery'
where fulfillment_type is null
   or fulfillment_type not in ('delivery', 'pickup');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfillment_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_fulfillment_type_check
      check (fulfillment_type in ('delivery', 'pickup'));
  end if;
end $$;
