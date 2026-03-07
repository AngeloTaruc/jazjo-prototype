-- Rewards logic migration (persistent redemptions + order discount tracking)
-- Run in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  reward_type text not null check (reward_type in ('free_delivery', 'discount_10')),
  points_cost integer not null check (points_cost > 0),
  status text not null default 'reserved' check (status in ('reserved', 'used', 'cancelled')),
  order_id uuid references public.orders(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists idx_reward_redemptions_user on public.reward_redemptions (user_id, created_at desc);
create index if not exists idx_reward_redemptions_status on public.reward_redemptions (status, created_at desc);
create index if not exists idx_reward_redemptions_order on public.reward_redemptions (order_id);

alter table public.orders
  add column if not exists discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0);

alter table public.reward_redemptions enable row level security;

drop policy if exists "reward_redemptions_read_own_or_staff" on public.reward_redemptions;
create policy "reward_redemptions_read_own_or_staff"
on public.reward_redemptions
for select
using (auth.uid() = user_id or public.is_staff_or_admin());

commit;
