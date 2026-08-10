import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { linkId, mediaId, clientToken } = req.body;
  if (!linkId || !mediaId || !clientToken) return res.status(400).json({ error: 'Missing fields' });
  try {
    // toggle favorite: if exists delete, else insert
    const { data: existing } = await supabaseAdmin
      .from('favorites')
      .select('*')
      .eq('link_id', linkId)
      .eq('media_id', mediaId)
      .eq('client_token', clientToken);
    if (existing && existing.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('favorites')
        .delete()
        .eq('link_id', linkId)
        .eq('media_id', mediaId)
        .eq('client_token', clientToken);
      if (delErr) throw delErr;
      return res.status(200).json({ favorited: false });
    } else {
      const { data, error } = await supabaseAdmin.from('favorites').insert([
        { link_id: linkId, media_id: mediaId, client_token: clientToken }
      ]);
      if (error) throw error;
      return res.status(200).json({ favorited: true });
    }
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [gallery/favorite]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

