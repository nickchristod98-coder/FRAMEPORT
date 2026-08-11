import type { NextApiRequest, NextApiResponse } from 'next';
import { r2PublicUrl } from '../../../lib/r2';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const {
    boardId,
    projectId,
    storagePath,
    filename,
    mimeType,
    size,
    publicUrl: providedPublicUrl,
    originalUrl,
    thumbnailUrl,
    creatorId
  } = req.body;

  const resolvedBoardId = boardId || projectId;
  if (!resolvedBoardId || !storagePath || !filename) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  console.log('Registering file in fp_board_media:', {
    boardId: resolvedBoardId,
    storagePath,
    filename,
    mimeType,
    size
  });

  try {
    const publicUrl =
      providedPublicUrl ||
      originalUrl ||
      r2PublicUrl(storagePath) ||
      null;

    const row: Record<string, any> = {
      board_id: resolvedBoardId,
      filename,
      mime_type: mimeType || 'application/octet-stream',
      storage_path: storagePath,
      public_url: publicUrl,
      original_url: originalUrl || publicUrl,
      thumbnail_url: thumbnailUrl || null,
      size: size ?? null,
      sort_order: 0
    };
    if (creatorId) row.creator_id = creatorId;

    const { data, error } = await supabaseAdmin
      .from('fp_board_media')
      .insert([row])
      .select()
      .single();
    if (error) {
      console.error('DB Insert Error:', error);
      throw error;
    }
    return res.status(200).json({ media: data });
  } catch (err: any) {
    console.error('API ERROR [register-file]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}
