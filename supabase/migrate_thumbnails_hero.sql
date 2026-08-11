-- Thumbnails + hero image URL columns for Cloudflare R2 pipeline
alter table public.fp_board_media add column if not exists thumbnail_url text;
alter table public.fp_board_media add column if not exists original_url text;

-- Backfill original_url from existing public_url where missing
update public.fp_board_media
set original_url = public_url
where original_url is null and public_url is not null;

alter table public.vision_boards add column if not exists hero_image_url text;
