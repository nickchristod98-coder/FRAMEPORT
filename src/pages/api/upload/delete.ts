import type { NextApiRequest, NextApiResponse } from 'next';
import { requireApiUser } from '../../../lib/apiAuth';
import { deleteR2Object } from '../../../lib/r2';
import { isBoardScopedR2Key } from '../../../lib/r2Paths';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

function isAllowedDeleteKey(fileKey: string, userId: string, boardId?: string | null) {
  if (boardId && isBoardScopedR2Key(fileKey, boardId)) return true;
  if (fileKey.startsWith(`${userId}/`)) return true;
  if (fileKey.startsWith('originals/board-')) return true;
  if (fileKey.startsWith('thumbnails/')) return true;
  if (fileKey.startsWith('hero-frames/')) return true;
  return false;
}

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

    const mediaId = typeof req.body?.mediaId === 'string' ? req.body.mediaId.trim() : '';
    const boardId = typeof req.body?.boardId === 'string' ? req.body.boardId.trim() : '';

    let ownedBoardId = boardId || null;

    if (mediaId) {
      const { data: row } = await supabaseAdmin
        .from('fp_board_media')
        .select('id, creator_id, storage_path, thumbnail_url, board_id')
        .eq('id', mediaId)
        .eq('creator_id', user.id)
        .maybeSingle();
      if (!row) {
        return res.status(404).json({ error: 'Media not found' });
      }
      ownedBoardId = String(row.board_id);
    } else if (boardId) {
      const { data: board } = await supabaseAdmin
        .from('vision_boards')
        .select('id')
        .eq('id', boardId)
        .eq('creator_id', user.id)
        .maybeSingle();
      if (!board) {
        return res.status(404).json({ error: 'Board not found' });
      }
    } else if (!fileKey.startsWith(`${user.id}/`)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!isAllowedDeleteKey(fileKey, user.id, ownedBoardId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await deleteR2Object(fileKey);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    console.error('[upload/delete]', err);
    return res.status(status).json({ error: err?.message || 'Delete failed' });
  }
}
