-- Store-level settings for checkout totals.
-- Run in Supabase SQL Editor.

begin;

create table if not exists public.app_settings (
  key text primary key,
  value numeric(12, 2) not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, description)
values
  ('delivery_fee', 60, 'Default delivery fee in PHP'),
  ('free_delivery_minimum', 800, 'Subtotal needed for free delivery in PHP')
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;

create policy "app_settings_public_read"
on public.app_settings
for select
using (true);

commit;
