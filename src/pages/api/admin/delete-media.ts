import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { mediaId } = req.body;
  if (!mediaId) return res.status(400).json({ error: 'Missing mediaId' });
  try {
    // fetch media row
    const { data: mediaRow, error: fetchErr } = await supabaseAdmin.from('media').select('*').eq('id', mediaId).maybeSingle();
    if (fetchErr || !mediaRow) return res.status(404).json({ error: 'Media not found' });

    const bucket = mediaRow.storage_bucket || 'galleries';
    const path = mediaRow.storage_path;
    // delete object from storage
    try {
      const { error: delErr } = await supabaseAdmin.storage.from(bucket).remove([path]);
      if (delErr) {
        // log but continue to delete db row
        // eslint-disable-next-line no-console
        console.warn('Storage delete error', delErr);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Storage delete exception', e);
    }

    // delete db row
    const { error: dbErr } = await supabaseAdmin.from('media').delete().eq('id', mediaId);
    if (dbErr) throw dbErr;

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [admin/delete-media]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

