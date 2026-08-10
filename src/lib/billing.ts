import { supabase } from './supabaseClient';
import { getAuthUserId } from './auth';
import { isPlanTier, PLAN_STORAGE_BYTES, PlanTier } from './plans';

export type UserProfile = {
  id: string;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planTier: PlanTier;
  storageLimitBytes: number;
  subscriptionStatus: string | null;
};

function mapProfile(row: any): UserProfile {
  const tier: PlanTier = isPlanTier(row.plan_tier) ? row.plan_tier : 'free';
  return {
    id: row.id,
    email: row.email ?? null,
    stripeCustomerId: row.stripe_customer_id ?? null,
    stripeSubscriptionId: row.stripe_subscription_id ?? null,
    planTier: tier,
    storageLimitBytes:
      typeof row.storage_limit_bytes === 'number' && row.storage_limit_bytes > 0
        ? row.storage_limit_bytes
        : PLAN_STORAGE_BYTES[tier],
    subscriptionStatus: row.subscription_status ?? null
  };
}

/** Ensure a free profile row exists for the signed-in user. */
export async function ensureProfile(userId?: string): Promise<UserProfile> {
  const id = userId || (await getAuthUserId());
  if (!id) throw new Error('You must be signed in.');

  const { data: existing, error: readErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readErr && !/schema cache|does not exist|relation/i.test(readErr.message || '')) {
    console.error('[billing] ensureProfile read', readErr);
  }

  if (existing) return mapProfile(existing);

  const { data: authData } = await supabase.auth.getUser();
  const email = authData.user?.email || null;

  const { data: created, error: insertErr } = await supabase
    .from('profiles')
    .upsert(
      {
        id,
        email,
        plan_tier: 'free',
        storage_limit_bytes: PLAN_STORAGE_BYTES.free,
        subscription_status: 'active'
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (insertErr) {
    // Profiles table may not be migrated yet — fall back to free defaults
    console.warn('[billing] ensureProfile upsert failed', insertErr.message);
    return {
      id,
      email,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      planTier: 'free',
      storageLimitBytes: PLAN_STORAGE_BYTES.free,
      subscriptionStatus: 'active'
    };
  }

  return mapProfile(created);
}

export async function getBillingProfile(): Promise<UserProfile | null> {
  const userId = await getAuthUserId();
  if (!userId) return null;
  return ensureProfile(userId);
}

export function isPaidPlan(tier: PlanTier) {
  return tier === 'pro' || tier === 'max';
}
