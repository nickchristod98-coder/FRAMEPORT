import type { NextApiRequest, NextApiResponse } from 'next';
import { requireApiUser } from '../../../lib/apiAuth';
import { deleteR2Object } from '../../../lib/r2';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireApiUser(req);
    const fileKey = typeof req.body?.fileKey === 'string' ? req.body.fileKey.trim() : '';
    if (!fileKey) {
      return res.status(400).json({ error: 'fileKey is required' });
    }

    // Only allow deleting objects under the caller's user prefix
    if (!fileKey.startsWith(`${user.id}/`)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Optional ownership check when mediaId provided
    const mediaId = typeof req.body?.mediaId === 'string' ? req.body.mediaId.trim() : '';
    if (mediaId) {
      const { data: row } = await supabaseAdmin
        .from('fp_board_media')
        .select('id, creator_id, storage_path')
        .eq('id', mediaId)
        .eq('creator_id', user.id)
        .maybeSingle();
      if (!row || row.storage_path !== fileKey) {
        return res.status(404).json({ error: 'Media not found' });
      }
    }

    await deleteR2Object(fileKey);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    console.error('[upload/delete]', err);
    return res.status(status).json({ error: err?.message || 'Delete failed' });
  }
}
