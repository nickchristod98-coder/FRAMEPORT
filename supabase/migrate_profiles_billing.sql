-- Profiles + billing fields for Stripe subscription plans.
-- Run in Supabase SQL editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'pro', 'max')),
  storage_limit_bytes bigint not null default 1073741824,
  subscription_status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profiles_stripe_customer on public.profiles(stripe_customer_id);
create index if not exists idx_profiles_plan_tier on public.profiles(plan_tier);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a free profile for every new auth user
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan_tier, storage_limit_bytes, subscription_status)
  values (new.id, new.email, 'free', 1073741824, 'active')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Backfill existing auth users
insert into public.profiles (id, email, plan_tier, storage_limit_bytes, subscription_status)
select id, email, 'free', 1073741824, 'active'
from auth.users
on conflict (id) do nothing;
