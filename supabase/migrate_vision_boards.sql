-- Run this once in the Supabase SQL editor.
-- vision_boards.id is BIGINT in your project — all FKs must match that type.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- vision_boards: add app columns (id stays bigint)
-- ---------------------------------------------------------------------------
alter table public.vision_boards add column if not exists title text;
alter table public.vision_boards add column if not exists client_name text;
alter table public.vision_boards add column if not exists company_name text;
alter table public.vision_boards add column if not exists logline text;
alter table public.vision_boards add column if not exists public_id text;
alter table public.vision_boards add column if not exists published_at timestamptz;
alter table public.vision_boards add column if not exists hero_media_id uuid;
alter table public.vision_boards add column if not exists hero_time numeric default 0;
alter table public.vision_boards add column if not exists hero_frame_path text;
alter table public.vision_boards add column if not exists updated_at timestamptz default now();

update public.vision_boards set title = coalesce(nullif(title, ''), 'Untitled') where title is null;
update public.vision_boards set client_name = coalesce(nullif(client_name, ''), 'Client') where client_name is null;
update public.vision_boards set company_name = coalesce(nullif(company_name, ''), 'Company') where company_name is null;

alter table public.vision_boards alter column title set not null;
alter table public.vision_boards alter column client_name set not null;
alter table public.vision_boards alter column company_name set not null;

create unique index if not exists idx_vision_boards_public_id on public.vision_boards(public_id);
create index if not exists idx_vision_boards_creator on public.vision_boards(creator_id);

-- ---------------------------------------------------------------------------
-- fp_board_media: board_id must be bigint to match vision_boards.id
-- If a previous attempt created the table with uuid board_id, rebuild it.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fp_board_media'
      and column_name = 'board_id'
      and data_type <> 'bigint'
  ) then
    alter table public.vision_boards drop constraint if exists vision_boards_hero_media_id_fkey;
    drop table public.fp_board_media cascade;
  end if;
end $$;

create table if not exists public.fp_board_media (
  id uuid primary key default gen_random_uuid(),
  board_id bigint not null references public.vision_boards(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  mime_type text,
  storage_path text not null,
  sort_order int not null default 0,
  size bigint,
  created_at timestamptz default now()
);

-- Harden columns if table already existed with missing fields
alter table public.fp_board_media add column if not exists creator_id uuid;
alter table public.fp_board_media add column if not exists filename text;
alter table public.fp_board_media add column if not exists mime_type text;
alter table public.fp_board_media add column if not exists storage_path text;
alter table public.fp_board_media add column if not exists sort_order int default 0;
alter table public.fp_board_media add column if not exists size bigint;

-- Ensure board_id is bigint even if table existed without FK
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fp_board_media'
      and column_name = 'board_id'
      and data_type <> 'bigint'
  ) then
    alter table public.fp_board_media
      alter column board_id type bigint
      using board_id::text::bigint;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fp_board_media_board_id_fkey'
  ) then
    alter table public.fp_board_media
      add constraint fp_board_media_board_id_fkey
      foreign key (board_id) references public.vision_boards(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_fp_board_media_board on public.fp_board_media(board_id);

-- hero_media_id (uuid) → fp_board_media.id (uuid)
do $$ begin
  alter table public.vision_boards
    add constraint vision_boards_hero_media_id_fkey
    foreign key (hero_media_id) references public.fp_board_media(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- published_boards: board_id as bigint to match vision_boards.id
-- ---------------------------------------------------------------------------
create table if not exists public.published_boards (
  public_id text primary key,
  board_id bigint references public.vision_boards(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz default now()
);

-- If published_boards already exists with a non-bigint board_id, coerce it
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'published_boards'
      and column_name = 'board_id'
      and data_type <> 'bigint'
  ) then
    alter table public.published_boards drop constraint if exists published_boards_board_id_fkey;
    alter table public.published_boards
      alter column board_id type bigint
      using nullif(board_id::text, '')::bigint;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'published_boards_board_id_fkey'
  ) then
    alter table public.published_boards
      add constraint published_boards_board_id_fkey
      foreign key (board_id) references public.vision_boards(id) on delete cascade;
  end if;
exception
  when others then
    -- Keep going if empty/legacy rows can't cast; board_id remains nullable without FK
    raise notice 'published_boards FK skipped: %', SQLERRM;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.vision_boards enable row level security;
alter table public.fp_board_media enable row level security;
alter table public.published_boards enable row level security;

drop policy if exists "vision_boards_select_own" on public.vision_boards;
create policy "vision_boards_select_own" on public.vision_boards
  for select using (auth.uid() = creator_id);

drop policy if exists "vision_boards_insert_own" on public.vision_boards;
create policy "vision_boards_insert_own" on public.vision_boards
  for insert with check (auth.uid() = creator_id);

drop policy if exists "vision_boards_update_own" on public.vision_boards;
create policy "vision_boards_update_own" on public.vision_boards
  for update using (auth.uid() = creator_id);

drop policy if exists "vision_boards_delete_own" on public.vision_boards;
create policy "vision_boards_delete_own" on public.vision_boards
  for delete using (auth.uid() = creator_id);

drop policy if exists "fp_media_select_own" on public.fp_board_media;
create policy "fp_media_select_own" on public.fp_board_media
  for select using (auth.uid() = creator_id);

drop policy if exists "fp_media_insert_own" on public.fp_board_media;
create policy "fp_media_insert_own" on public.fp_board_media
  for insert with check (auth.uid() = creator_id);

drop policy if exists "fp_media_update_own" on public.fp_board_media;
create policy "fp_media_update_own" on public.fp_board_media
  for update using (auth.uid() = creator_id);

drop policy if exists "fp_media_delete_own" on public.fp_board_media;
create policy "fp_media_delete_own" on public.fp_board_media
  for delete using (auth.uid() = creator_id);

drop policy if exists "published_boards_public_read" on public.published_boards;
create policy "published_boards_public_read" on public.published_boards
  for select using (true);

drop policy if exists "published_boards_auth_write" on public.published_boards;
create policy "published_boards_auth_write" on public.published_boards
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "published_boards_auth_update" on public.published_boards;
create policy "published_boards_auth_update" on public.published_boards
  for update using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
