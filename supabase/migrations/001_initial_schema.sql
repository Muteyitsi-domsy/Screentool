-- ScreenFrame: initial schema
-- Run this in the Supabase SQL Editor after creating your project.

-- profiles: one row per authenticated user
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  is_pro boolean default false not null,
  plan_type text default 'free',                -- 'free' | 'subscription' | 'lifetime'
  paddle_customer_id text,
  paddle_subscription_id text,
  subscription_status text default 'free',      -- 'free' | 'active' | 'canceled' | 'paused'
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Service role (used by the Edge Function) can update any profile
-- No extra policy needed — service role bypasses RLS automatically.

-- Auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable Realtime for the profiles table (so the client gets instant updates)
alter publication supabase_realtime add table public.profiles;
