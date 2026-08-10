import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const { data, error } = await supabaseAdmin.from('projects').select('id, title, description, created_at, gallery_links(*)');
    if (error) throw error;
    return res.status(200).json({ projects: data });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [projects]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

