import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const { publicId } = req.query;
  if (!publicId || Array.isArray(publicId)) return res.status(400).json({ error: 'Missing publicId' });

  try {
    const { data, error } = await supabaseAdmin
      .from('published_boards')
      .select('payload')
      .eq('public_id', publicId)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.error('API ERROR [boards/published]:', error);
      return res.status(404).json({ error: 'Not found' });
    }
    if (!data?.payload) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ payload: data.payload });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [boards/published]:', err);
    return res.status(500).json({ error: err?.message || 'Server error' });
  }
}
