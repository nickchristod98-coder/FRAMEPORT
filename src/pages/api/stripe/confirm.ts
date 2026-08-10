import type { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateProfileRow, requireApiUser } from '../../../lib/apiAuth';
import {
  PLAN_STORAGE_BYTES,
  PlanTier,
  isPlanTier,
  planFromStripePriceId,
  planFromStripeProductId
} from '../../../lib/plans';
import { getStripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

/**
 * Confirms a completed Checkout Session and updates the signed-in user's plan.
 * Useful locally when Stripe webhooks can't reach localhost; also a fast path after redirect.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireApiUser(req);
    const sessionId =
      typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (!sessionId.startsWith('cs_')) {
      return res.status(400).json({ error: 'Missing Checkout session id' });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'subscription.items.data.price']
    });

    const sessionUserId =
      session.client_reference_id || session.metadata?.supabase_user_id || null;
    if (!sessionUserId || sessionUserId !== user.id) {
      return res.status(403).json({ error: 'Checkout session does not belong to this user' });
    }

    if (session.mode !== 'subscription' || session.status !== 'complete') {
      return res.status(400).json({ error: 'Checkout session is not a completed subscription' });
    }

    await getOrCreateProfileRow(user.id, user.email);

    let planTier: PlanTier = 'pro';
    const metaTier = session.metadata?.plan_tier;
    if (isPlanTier(metaTier) && metaTier !== 'free') planTier = metaTier;

    const subscription =
      typeof session.subscription === 'string'
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;

    if (subscription && typeof subscription !== 'string') {
      const fromMeta = subscription.metadata?.plan_tier;
      if (isPlanTier(fromMeta) && fromMeta !== 'free') {
        planTier = fromMeta;
      } else {
        const price = subscription.items?.data?.[0]?.price;
        planTier =
          planFromStripePriceId(price?.id) ||
          planFromStripeProductId(
            typeof price?.product === 'string' ? price.product : price?.product?.id
          ) ||
          planTier;
      }
    }

    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id || null;

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        plan_tier: planTier,
        storage_limit_bytes: PLAN_STORAGE_BYTES[planTier],
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status:
          subscription && typeof subscription !== 'string' ? subscription.status : 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      planTier,
      storageLimitBytes: PLAN_STORAGE_BYTES[planTier]
    });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    console.error('[stripe/confirm]', err);
    return res.status(status).json({ error: err?.message || 'Could not confirm checkout' });
  }
}
