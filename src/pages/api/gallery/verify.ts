import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { publicId, password } = req.body;
  if (!publicId || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    // Log inputs for debugging (remove in production)
    // eslint-disable-next-line no-console
    console.log('[gallery/verify] publicId:', publicId, 'password(received):', password);

    const { data, error } = await supabaseAdmin.rpc('verify_gallery_password', {
      p_public_id: publicId,
      p_password: password
    });

    // eslint-disable-next-line no-console
    console.log('[gallery/verify] rpc result:', { data, error });

    if (error) {
      // eslint-disable-next-line no-console
      console.log('[gallery/verify] RPC error', error);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      // eslint-disable-next-line no-console
      console.log('[gallery/verify] No matching link found for provided password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // rpc returns setof; normalize to first entry
    const entry = Array.isArray(data) ? data[0] : data;
    // eslint-disable-next-line no-console
    console.log('[gallery/verify] verified link:', entry);
    return res.status(200).json({ ok: true, link: entry });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [gallery/verify]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

