import type { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateProfileRow, requireApiUser } from '../../../lib/apiAuth';
import { getStripe, siteUrl } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireApiUser(req);
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
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl()}/pricing`
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    console.error('[stripe/portal]', err);
    return res.status(status).json({ error: err?.message || 'Portal session failed' });
  }
}
