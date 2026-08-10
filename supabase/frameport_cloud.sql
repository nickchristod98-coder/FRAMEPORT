-- FramePort cloud schema (run in Supabase SQL editor)
-- Matches live project: vision_boards.id is BIGINT, ownership column is creator_id
-- Requires: Auth enabled, Storage bucket named `vision-board-media` (public read recommended)

create extension if not exists "pgcrypto";

create table if not exists public.vision_boards (
  id bigserial primary key,
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  client_name text not null,
  company_name text not null,
  logline text,
  public_id text unique,
  published_at timestamptz,
  hero_media_id uuid,
  hero_time numeric default 0,
  hero_frame_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_vision_boards_creator on public.vision_boards(creator_id);
create index if not exists idx_vision_boards_public on public.vision_boards(public_id);

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

create index if not exists idx_fp_board_media_board on public.fp_board_media(board_id);

do $$ begin
  alter table public.vision_boards
    add constraint vision_boards_hero_media_id_fkey
    foreign key (hero_media_id) references public.fp_board_media(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists public.published_boards (
  public_id text primary key,
  board_id bigint references public.vision_boards(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz default now()
);

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

drop policy if exists "boards_storage_select" on storage.objects;
create policy "boards_storage_select" on storage.objects
  for select using (bucket_id = 'vision-board-media');

drop policy if exists "boards_storage_insert" on storage.objects;
create policy "boards_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'vision-board-media' and auth.role() = 'authenticated'
  );

drop policy if exists "boards_storage_update" on storage.objects;
create policy "boards_storage_update" on storage.objects
  for update using (
    bucket_id = 'vision-board-media' and auth.role() = 'authenticated'
  );

drop policy if exists "boards_storage_delete" on storage.objects;
create policy "boards_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'vision-board-media' and auth.role() = 'authenticated'
  );
