-- Supabase schema for LUX ETERNA gallery platform
-- Run this in your Supabase SQL editor or as a migration

-- enable necessary extensions
create extension if not exists "pgcrypto";

-- Projects: a client project / gallery
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamptz default now()
);

-- Gallery links: password-protected links for clients
create table if not exists gallery_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  public_id text unique not null, -- short token used in URL
  password_hash text not null, -- store hashed password using crypt()
  expires_at timestamptz,
  allow_download boolean default true,
  created_at timestamptz default now()
);

-- Media: metadata about uploaded files (stored in Supabase Storage)
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  storage_bucket text not null default 'media',
  storage_path text not null, -- path within the bucket
  public_url text, -- optional public URL to the file (if bucket is public or signed)
  filename text not null,
  mime_type text,
  size bigint,
  width int,
  height int,
  duration numeric, -- for videos (seconds)
  uploaded_by uuid, -- admin user id (optional)
  created_at timestamptz default now()
);

create index if not exists idx_media_project on media(project_id);

-- Ensure legacy installs get the column
alter table media add column if not exists public_url text;

-- Favorites: client favorites per gallery link (no authentication required)
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references gallery_links(id) on delete cascade,
  media_id uuid references media(id) on delete cascade,
  client_token text, -- ephemeral client identifier (e.g. cookie)
  created_at timestamptz default now(),
  unique (link_id, media_id, client_token)
);

-- Helper function to create a gallery link with hashed password
create function create_gallery_link(p_project uuid, p_public_id text, p_password text, p_expires timestamptz)
returns uuid language sql as $$
  insert into gallery_links (project_id, public_id, password_hash, expires_at)
  values (p_project, p_public_id, crypt(p_password, gen_salt('bf')), p_expires)
  returning id;
$$;

-- Verify gallery password: returns link id and project if password matches and link not expired
create function verify_gallery_password(p_public_id text, p_password text)
returns table(id uuid, project_id uuid, allow_download boolean) language sql as $$
  select id, project_id, allow_download
  from gallery_links
  where public_id = p_public_id
    and password_hash = crypt(p_password, password_hash)
    and (expires_at is null or expires_at > now());
$$;

-- Example: a view that joins media with public URL (requires knowing SUPABASE URL and bucket policy)
-- The actual public URL is usually constructed client-side using Supabase Storage API

-- NOTE: Manage access controls and RLS policies in Supabase dashboard for production.

-- Published FramePort vision boards (client-facing share links)
create table if not exists published_boards (
  public_id text primary key,
  board_id text,
  payload jsonb not null,
  updated_at timestamptz default now()
);
