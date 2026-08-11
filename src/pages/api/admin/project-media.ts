import type { NextApiRequest, NextApiResponse } from 'next';
import { r2PublicUrl } from '../../../lib/r2';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const { projectId, boardId } = req.query;
  const id = (boardId || projectId) as string | string[] | undefined;
  if (!id || Array.isArray(id)) return res.status(400).json({ error: 'Missing boardId' });

  try {
    const { data, error } = await supabaseAdmin
      .from('fp_board_media')
      .select('*')
      .eq('board_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    const signed = (data || []).map((m: any) => {
      const original =
        m.original_url ||
        m.public_url ||
        r2PublicUrl(m.storage_path) ||
        null;
      return {
        ...m,
        public_url: original,
        original_url: original,
        thumbnail_url: m.thumbnail_url || null,
        signedUrl: original
      };
    });
    return res.status(200).json({ media: signed });
  } catch (err: any) {
    console.error('API ERROR [admin/project-media]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}
