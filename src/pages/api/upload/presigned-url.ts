import type { NextApiRequest, NextApiResponse } from 'next';
import { requireApiUser, getOrCreateProfileRow } from '../../../lib/apiAuth';
import { PLAN_STORAGE_BYTES, isPlanTier, type PlanTier } from '../../../lib/plans';
import { createPresignedPutUrl, r2PublicUrl } from '../../../lib/r2';
import { isBoardScopedR2Key, originalObjectKey, safeR2FileName } from '../../../lib/r2Paths';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

async function getUsedBytes(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('fp_board_media')
    .select('size')
    .eq('creator_id', userId);
  if (error) throw error;
  return (data || []).reduce((sum, row: any) => sum + (Number(row.size) || 0), 0);
}

/** Allowed R2 key patterns for an owned board (unified prefixes + legacy). */
function isAllowedFileKey(opts: {
  fileKey: string;
  userId: string;
  boardId: string;
}) {
  const key = opts.fileKey;
  if (isBoardScopedR2Key(key, opts.boardId)) return true;

  // Legacy keys from earlier migrations
  const userBoardPrefix = `${opts.userId}/${opts.boardId}/`;
  if (key.startsWith(userBoardPrefix)) return true;
  if (/^thumbnails\/[a-zA-Z0-9_-]+-thumb\.webp$/.test(key)) return true;
  if (key.startsWith(`hero-frames/${opts.boardId}-`)) return true;

  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireApiUser(req);
    const boardId = typeof req.body?.boardId === 'string' ? req.body.boardId.trim() : '';
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : 'upload.bin';
    const contentType =
      typeof req.body?.contentType === 'string' && req.body.contentType
        ? req.body.contentType
        : 'application/octet-stream';
    const fileSize = Number(req.body?.fileSize);
    const mediaId =
      typeof req.body?.mediaId === 'string' && req.body.mediaId.trim()
        ? req.body.mediaId.trim()
        : null;
    const purpose =
      typeof req.body?.purpose === 'string' ? String(req.body.purpose) : 'media';
    const skipQuota =
      req.body?.skipQuota === true || purpose === 'thumbnail' || purpose === 'hero';

    if (!boardId) {
      return res.status(400).json({ error: 'boardId is required' });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return res.status(400).json({ error: 'fileSize must be a positive number' });
    }

    // Confirm board ownership
    const { data: board, error: boardErr } = await supabaseAdmin
      .from('vision_boards')
      .select('id')
      .eq('id', boardId)
      .eq('creator_id', user.id)
      .maybeSingle();
    if (boardErr) throw boardErr;
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const profile = await getOrCreateProfileRow(user.id, user.email);
    const tier: PlanTier = isPlanTier(profile.plan_tier) ? profile.plan_tier : 'free';
    const limitBytes =
      typeof profile.storage_limit_bytes === 'number' && profile.storage_limit_bytes > 0
        ? Number(profile.storage_limit_bytes)
        : PLAN_STORAGE_BYTES[tier];

    const usedBytes = await getUsedBytes(user.id);
    const remaining = Math.max(0, limitBytes - usedBytes);
    if (!skipQuota && fileSize > remaining) {
      return res.status(403).json({
        error: 'Storage limit reached. Upgrade your plan for more space.',
        usedBytes,
        limitBytes,
        remainingBytes: remaining
      });
    }

    const id =
      mediaId ||
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    let fileKey: string;
    const requestedKey =
      typeof req.body?.fileKey === 'string' ? req.body.fileKey.trim().replace(/^\/+/, '') : '';
    if (requestedKey) {
      if (!isAllowedFileKey({ fileKey: requestedKey, userId: user.id, boardId })) {
        return res.status(403).json({ error: 'Invalid file key for this board' });
      }
      fileKey = requestedKey;
    } else if (purpose === 'thumbnail') {
      fileKey = `thumbnails/board-${boardId}/${safeR2FileName(fileName)}`;
    } else if (purpose === 'hero') {
      fileKey = `hero-frames/board-${boardId}-${Date.now()}.webp`;
    } else {
      // Default originals: originals/board-{id}/{mediaId}-{filename}
      fileKey = originalObjectKey(boardId, `${id}-${safeR2FileName(fileName)}`);
    }

    const signed = await createPresignedPutUrl({
      fileKey,
      contentType
    });

    return res.status(200).json({
      uploadUrl: signed.uploadUrl,
      fileKey: signed.fileKey,
      publicUrl: signed.publicUrl || r2PublicUrl(fileKey),
      mediaId: id,
      usedBytes,
      limitBytes,
      remainingBytes: remaining
    });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    console.error('[upload/presigned-url]', err);
    return res.status(status).json({ error: err?.message || 'Could not create upload URL' });
  }
}
