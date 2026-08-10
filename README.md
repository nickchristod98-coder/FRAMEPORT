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
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=board_assets
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Stripe billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_MAX=price_...
```

4. In Supabase SQL Editor, run:
   - `supabase/frameport_cloud.sql` (boards, media, auth RLS, publish table)
   - `supabase/migrate_board_assets.sql` (creates public `board_assets` bucket + policies)
   - `supabase/migrate_profiles_billing.sql` (profiles + Stripe plan fields)
5. In Storage, confirm a **public** bucket named exactly **`board_assets`** exists
6. Auth → Providers: enable Email. For local testing, you can disable “Confirm email”.
7. Stripe:
   - Create two recurring Prices in EUR: PRO €20/mo and MAX €50/mo
   - Copy Price IDs into `STRIPE_PRICE_PRO` / `STRIPE_PRICE_MAX`
   - Enable Customer Portal
   - Point webhook to `https://YOUR_DOMAIN/api/stripe/webhook` for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
8. `npm run dev`

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
- **Videos & images** → Storage bucket `board_assets` + rows in `fp_board_media`
- **Published client links** → `published_boards` (+ `/v/[publicId]`)
- **Subscriptions** → `profiles` (plan_tier, storage_limit_bytes, Stripe IDs)

Password must be at least 6 characters (Supabase default).
