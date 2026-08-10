export type PlanTier = 'free' | 'pro' | 'max';

export const BYTES_PER_GB = 1024 * 1024 * 1024;

export const PLAN_STORAGE_BYTES: Record<PlanTier, number> = {
  free: 1 * BYTES_PER_GB,
  pro: 20 * BYTES_PER_GB,
  max: 50 * BYTES_PER_GB
};

export type PlanDefinition = {
  id: PlanTier;
  name: string;
  priceLabel: string;
  priceEuros: number | null;
  storageLabel: string;
  storageBytes: number;
  description: string;
  features: string[];
  highlighted?: boolean;
};

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    priceLabel: '€0',
    priceEuros: 0,
    storageLabel: '1 GB',
    storageBytes: PLAN_STORAGE_BYTES.free,
    description: 'Start building vision boards with essential storage.',
    features: ['1 GB storage', 'Unlimited boards', 'Public client links']
  },
  {
    id: 'pro',
    name: 'PRO',
    priceLabel: '€20',
    priceEuros: 20,
    storageLabel: '20 GB',
    storageBytes: PLAN_STORAGE_BYTES.pro,
    description: 'For active projects and larger media libraries.',
    features: ['20 GB storage', 'Priority support', 'Automatic tax at checkout'],
    highlighted: true
  },
  {
    id: 'max',
    name: 'MAX',
    priceLabel: '€50',
    priceEuros: 50,
    storageLabel: '50 GB',
    storageBytes: PLAN_STORAGE_BYTES.max,
    description: 'Maximum capacity for high-volume productions.',
    features: ['50 GB storage', 'Best for studios', 'Automatic tax at checkout']
  }
];

export function isPlanTier(value: string | null | undefined): value is PlanTier {
  return value === 'free' || value === 'pro' || value === 'max';
}

export function planDisplayName(tier: PlanTier): string {
  if (tier === 'pro') return 'PRO';
  if (tier === 'max') return 'MAX';
  return 'Free';
}

export function planStorageLabel(tier: PlanTier): string {
  if (tier === 'pro') return '20 GB';
  if (tier === 'max') return '50 GB';
  return '1 GB';
}

export function planFromStripePriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  const pro = envStripeId('pro');
  const max = envStripeId('max');
  if (pro && priceId === pro) return 'pro';
  if (max && priceId === max) return 'max';
  return null;
}

function envStripeId(plan: 'pro' | 'max'): string | null {
  if (plan === 'pro') {
    return (
      process.env.STRIPE_PRICE_ID_PRO?.trim() ||
      process.env.STRIPE_PRICE_PRO?.trim() ||
      null
    );
  }
  return (
    process.env.STRIPE_PRICE_ID_MAX?.trim() ||
    process.env.STRIPE_PRICE_MAX?.trim() ||
    null
  );
}

/** Raw env value for a paid plan — may be a Price (`price_…`) or Product (`prod_…`) ID. */
export function stripePriceIdForPlan(plan: PlanTier): string | null {
  if (plan === 'pro' || plan === 'max') return envStripeId(plan);
  return null;
}

export function planFromStripeProductId(productId: string | null | undefined): PlanTier | null {
  if (!productId) return null;
  return planFromStripePriceId(productId);
}
