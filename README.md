# FramePort (Next.js + Supabase + Cloudflare R2)

Premium vision-board platform for filmmakers.

## Setup

1. `npm install`
2. Create a Supabase project
3. Create a Cloudflare R2 bucket + API token (Object Read & Write), and enable a public URL (custom domain or `r2.dev` public access)
4. Add `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=your-bucket-name
NEXT_PUBLIC_R2_PUBLIC_URL=https://your-public-r2-or-custom-domain

# Stripe billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_MAX=price_...
```

5. In Supabase SQL Editor, run:
   - `supabase/frameport_cloud.sql` (boards, media, auth RLS, publish table)
   - `supabase/migrate_profiles_billing.sql` (profiles + Stripe plan fields)
   - `supabase/migrate_board_password.sql` (optional board access passwords)
   - `supabase/migrate_thumbnails_hero.sql` (thumbnail_url, original_url, hero_image_url)
6. Auth → Providers: enable Email. For local testing, you can disable “Confirm email”.
7. Stripe:
   - Create two recurring Prices in EUR: PRO €20/mo and MAX €50/mo
   - Copy Price IDs into `STRIPE_PRICE_PRO` / `STRIPE_PRICE_MAX`
   - Enable Customer Portal
   - Point webhook to `https://YOUR_DOMAIN/api/stripe/webhook` for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
8. On the R2 bucket, allow CORS for your app origin (PUT + GET/HEAD) so browser uploads and media playback work
9. `npm run dev`

## Plans

| Plan | Price | Storage |
|------|-------|---------|
| Free | €0/mo | 1 GB |
| PRO | €20/mo + tax | 20 GB |
| MAX | €50/mo | 50 GB |

Pricing UI: `/pricing`

## What syncs to Supabase

- **Sign up / Sign in** → Supabase Auth
- **Boards** → `vision_boards` table (per user)
- **Videos & images** → Cloudflare R2 (presigned PUT) + metadata rows in `fp_board_media` (`storage_path`, `original_url` / `public_url`, `thumbnail_url`, `size`)
- **Thumbnails** → client-generated WebP at `thumbnails/{mediaId}-thumb.webp`
- **Hero mood frames** → R2 `hero-frames/{boardId}-{timestamp}.jpg` + `vision_boards.hero_image_url`
- **Published client links** → `published_boards` (+ `/v/[publicId]`)
- **Subscriptions** → `profiles` (plan_tier, storage_limit_bytes, Stripe IDs)

Password must be at least 6 characters (Supabase default).
