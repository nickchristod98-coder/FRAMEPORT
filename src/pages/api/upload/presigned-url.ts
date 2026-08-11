import type { NextApiRequest, NextApiResponse } from 'next';
import { requireApiUser, getOrCreateProfileRow } from '../../../lib/apiAuth';
import { PLAN_STORAGE_BYTES, isPlanTier, type PlanTier } from '../../../lib/plans';
import { createPresignedPutUrl, r2PublicUrl } from '../../../lib/r2';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

async function getUsedBytes(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('fp_board_media')
    .select('size')
    .eq('creator_id', userId);
  if (error) throw error;
  return (data || []).reduce((sum, row: any) => sum + (Number(row.size) || 0), 0);
}

function safeFileName(name: string) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
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
    if (fileSize > remaining) {
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

    const prefix = `${user.id}/${boardId}/`;
    let fileKey: string;
    const requestedKey =
      typeof req.body?.fileKey === 'string' ? req.body.fileKey.trim().replace(/^\/+/, '') : '';
    if (requestedKey) {
      if (!requestedKey.startsWith(prefix)) {
        return res.status(403).json({ error: 'Invalid file key for this board' });
      }
      fileKey = requestedKey;
    } else {
      fileKey = `${prefix}${id}-${safeFileName(fileName)}`;
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
