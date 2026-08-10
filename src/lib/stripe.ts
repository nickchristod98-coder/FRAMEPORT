import Stripe from 'stripe';

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  if (!stripeSingleton) {
    // Use the SDK default API version bundled with the installed stripe package.
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

export function siteUrl() {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
