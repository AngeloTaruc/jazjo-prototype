-- Hard normalization step (run AFTER categories_and_product_fk migration)
-- Removes legacy products.category text and keeps products.category_id as source of truth.

begin;

-- Ensure all products have valid category_id before dropping legacy text column.
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

alter table public.products
  alter column category_id set not null;

drop index if exists idx_products_category;
alter table public.products drop column if exists category;

commit;
