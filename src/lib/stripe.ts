import Stripe from 'stripe';
import type { NextApiRequest } from 'next';

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

function headerValue(req: NextApiRequest | undefined, name: string): string | null {
  if (!req?.headers) return null;
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Resolve the public site origin for Stripe redirect URLs.
 * Prefer request Origin / Host, then NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL.
 */
export function siteUrl(req?: NextApiRequest) {
  const fromOrigin = headerValue(req, 'origin');
  if (fromOrigin) return fromOrigin.replace(/\/+$/, '');

  const fromApp = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (fromApp) return fromApp;

  const fromSite = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  if (fromSite) return fromSite;

  const proto = headerValue(req, 'x-forwarded-proto') || 'http';
  const host = headerValue(req, 'x-forwarded-host') || headerValue(req, 'host');
  if (host) return `${proto}://${host}`.replace(/\/+$/, '');

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '');

  return 'http://localhost:3000';
}
