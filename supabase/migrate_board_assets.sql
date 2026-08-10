-- Create public board_assets bucket for mood frames, images, and project videos.
-- Run in Supabase SQL editor if the bucket does not already exist.

insert into storage.buckets (id, name, public)
values ('board_assets', 'board_assets', true)
on conflict (id) do update set public = true;

drop policy if exists "board_assets_storage_select" on storage.objects;
create policy "board_assets_storage_select" on storage.objects
  for select using (bucket_id = 'board_assets');

drop policy if exists "board_assets_storage_insert" on storage.objects;
create policy "board_assets_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'board_assets' and auth.role() = 'authenticated'
  );

drop policy if exists "board_assets_storage_update" on storage.objects;
create policy "board_assets_storage_update" on storage.objects
  for update using (
    bucket_id = 'board_assets' and auth.role() = 'authenticated'
  );

drop policy if exists "board_assets_storage_delete" on storage.objects;
create policy "board_assets_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'board_assets' and auth.role() = 'authenticated'
  );

-- Persist permanent public URLs alongside storage paths
alter table public.fp_board_media add column if not exists public_url text;
