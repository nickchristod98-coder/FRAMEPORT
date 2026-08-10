# FramePort (Next.js + Supabase)

Premium vision-board platform for filmmakers.

## Setup

1. `npm install`
2. Create a Supabase project
3. Add `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

4. In Supabase SQL Editor, run:
   - `supabase/frameport_cloud.sql` (boards, media, auth RLS, publish table)
5. In Storage, create a public bucket named **`boards`**
6. Auth → Providers: enable Email. For local testing, you can disable “Confirm email”.
7. `npm run dev`

## What syncs to Supabase

- **Sign up / Sign in** → Supabase Auth
- **Boards** → `fp_boards` table (per user)
- **Videos & images** → Storage bucket `boards` + rows in `fp_board_media`
- **Published client links** → `published_boards` (+ `/v/[publicId]`)

Password must be at least 6 characters (Supabase default).
