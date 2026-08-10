-- Optional client access password for shared vision boards.
-- Run in Supabase SQL editor.

alter table public.vision_boards
  add column if not exists access_password text;

comment on column public.vision_boards.access_password is
  'Optional plaintext password clients must enter to view the published board.';
