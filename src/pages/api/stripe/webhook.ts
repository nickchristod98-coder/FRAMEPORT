import type { NextApiRequest, NextApiResponse } from 'next';
import type Stripe from 'stripe';
import { PLAN_STORAGE_BYTES, PlanTier, isPlanTier, planFromStripePriceId, planFromStripeProductId } from '../../../lib/plans';
import { getStripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const config = {
  api: {
    bodyParser: false
  }
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function applyPlanToUser(opts: {
  userId: string;
  planTier: PlanTier;
  subscriptionId?: string | null;
  customerId?: string | null;
  status?: string | null;
}) {
  const patch: Record<string, unknown> = {
    plan_tier: opts.planTier,
    storage_limit_bytes: PLAN_STORAGE_BYTES[opts.planTier],
    updated_at: new Date().toISOString()
  };
  if (opts.subscriptionId !== undefined) patch.stripe_subscription_id = opts.subscriptionId;
  if (opts.customerId) patch.stripe_customer_id = opts.customerId;
  if (opts.status) patch.subscription_status = opts.status;

  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', opts.userId)
    .maybeSingle();

  if (!existing) {
    const { error: insertErr } = await supabaseAdmin.from('profiles').insert({
      id: opts.userId,
      ...patch,
      plan_tier: opts.planTier,
      storage_limit_bytes: PLAN_STORAGE_BYTES[opts.planTier]
    });
    if (insertErr) throw insertErr;
    return;
  }

  const { error } = await supabaseAdmin.from('profiles').update(patch).eq('id', opts.userId);
  if (error) throw error;
}

async function resolveUserIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.id || null;
}

function planFromSubscription(sub: Stripe.Subscription): PlanTier {
  const fromMeta = sub.metadata?.plan_tier;
  if (isPlanTier(fromMeta) && fromMeta !== 'free') return fromMeta;

  const price = sub.items?.data?.[0]?.price;
  const fromPrice = planFromStripePriceId(price?.id);
  if (fromPrice) return fromPrice;

  const productId = typeof price?.product === 'string' ? price.product : price?.product?.id;
  const fromProduct = planFromStripeProductId(productId);
  if (fromProduct) return fromProduct;

  return 'free';
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return;

  const userId = session.client_reference_id || session.metadata?.supabase_user_id || null;
  if (!userId) {
    console.error('[stripe/webhook] checkout missing user id', session.id);
    return;
  }

  const stripe = getStripe();
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id || null;

  let planTier: PlanTier = 'pro';
  const metaTier = session.metadata?.plan_tier;
  if (isPlanTier(metaTier) && metaTier !== 'free') {
    planTier = metaTier;
  }

  let status = 'active';
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    planTier = planFromSubscription(sub);
    status = sub.status || 'active';
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id || null;

  await applyPlanToUser({
    userId,
    planTier,
    subscriptionId,
    customerId,
    status
  });
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const userId = await resolveUserIdFromSubscription(sub);
  if (!userId) {
    console.error('[stripe/webhook] subscription update missing user', sub.id);
    return;
  }

  if (sub.status === 'canceled') {
    await applyPlanToUser({
      userId,
      planTier: 'free',
      subscriptionId: null,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      status: sub.status
    });
    return;
  }

  const planTier = planFromSubscription(sub);
  await applyPlanToUser({
    userId,
    planTier,
    subscriptionId: sub.id,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    status: sub.status
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = await resolveUserIdFromSubscription(sub);
  if (!userId) {
    console.error('[stripe/webhook] subscription deleted missing user', sub.id);
    return;
  }

  await applyPlanToUser({
    userId,
    planTier: 'free',
    subscriptionId: null,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    status: 'canceled'
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured' });
  }

  try {
    const stripe = getStripe();
    const buf = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const event = stripe.webhooks.constructEvent(buf, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[stripe/webhook]', err);
    return res.status(400).json({ error: err?.message || 'Webhook error' });
  }
}
