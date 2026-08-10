import type { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateProfileRow, requireApiUser } from '../../../lib/apiAuth';
import { isPlanTier, stripePriceIdForPlan } from '../../../lib/plans';
import { getStripe, siteUrl } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

/**
 * Checkout needs a Price ID. Env may contain either `price_…` or a Product `prod_…`
 * (in which case we resolve the product's default/active recurring price).
 */
async function resolveCheckoutPriceId(planIdOrPriceId: string): Promise<string> {
  if (planIdOrPriceId.startsWith('price_')) return planIdOrPriceId;

  const stripe = getStripe();
  if (planIdOrPriceId.startsWith('prod_')) {
    const product = await stripe.products.retrieve(planIdOrPriceId);
    const defaultPrice =
      typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price?.id;
    if (defaultPrice) return defaultPrice;

    const prices = await stripe.prices.list({
      product: planIdOrPriceId,
      active: true,
      type: 'recurring',
      limit: 1
    });
    if (prices.data[0]?.id) return prices.data[0].id;
    throw new Error(
      `No active recurring price found for product ${planIdOrPriceId}. Add a default price in Stripe.`
    );
  }

  throw new Error(
    `Invalid Stripe ID "${planIdOrPriceId}". Use a Price ID (price_…) or Product ID (prod_…).`
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireApiUser(req);
    const plan = typeof req.body?.plan === 'string' ? req.body.plan.toLowerCase() : '';
    if (!isPlanTier(plan) || plan === 'free') {
      return res.status(400).json({ error: 'Choose a paid plan: pro or max.' });
    }

    const configuredId = stripePriceIdForPlan(plan);
    if (!configuredId) {
      return res.status(500).json({
        error: `Missing Stripe price/product ID for ${plan}. Set STRIPE_PRICE_ID_${plan.toUpperCase()} in env.`
      });
    }

    const priceId = await resolveCheckoutPriceId(configuredId);
    const profile = await getOrCreateProfileRow(user.id, user.email);
    const stripe = getStripe();

    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;
      await supabaseAdmin
        .from('profiles')
        .update({
          stripe_customer_id: customerId,
          email: user.email || profile.email,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
    }

    const origin = siteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancel`,
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto' },
      metadata: {
        supabase_user_id: user.id,
        plan_tier: plan
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_tier: plan
        }
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    console.error('[stripe/checkout]', err);
    return res.status(status).json({ error: err?.message || 'Checkout failed' });
  }
}
