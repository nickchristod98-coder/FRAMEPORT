import type { NextApiRequest, NextApiResponse } from 'next';
import { deleteR2Object } from '../../../lib/r2';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

function keyFromUrl(url: string | null | undefined) {
  if (!url) return null;
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!base || !url.startsWith(base + '/')) return null;
  return url.slice(base.length + 1).split('?')[0] || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { mediaId } = req.body;
  if (!mediaId) return res.status(400).json({ error: 'Missing mediaId' });
  try {
    const { data: mediaRow, error: fetchErr } = await supabaseAdmin
      .from('fp_board_media')
      .select('*')
      .eq('id', mediaId)
      .maybeSingle();
    if (fetchErr || !mediaRow) return res.status(404).json({ error: 'Media not found' });

    // Delete R2 objects (original + thumbnail when present)
    const keys = new Set<string>();
    if (mediaRow.storage_path) keys.add(mediaRow.storage_path);
    const thumbKey = keyFromUrl(mediaRow.thumbnail_url);
    if (thumbKey) keys.add(thumbKey);
    for (const key of keys) {
      try {
        await deleteR2Object(key);
      } catch (e) {
        console.warn('R2 delete error', key, e);
      }
    }

    const { error: dbErr } = await supabaseAdmin.from('fp_board_media').delete().eq('id', mediaId);
    if (dbErr) throw dbErr;

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('API ERROR [admin/delete-media]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}
