import { supabase } from './supabaseClient';
import {
  Board,
  ensureBoardPublicId,
  getBoard,
  getBoardAssetPublicUrl,
  getBoardMediaBlob,
  getHeroFrameBlob,
  isLocalMediaUrl,
  markBoardPublished,
  resolveHeroFrameDisplayUrl,
  uploadBoardAsset
} from './boards';

export type PublishedMedia = {
  id: string;
  name: string;
  mimeType: string;
  /** Full-resolution / original URL */
  url: string;
  thumbnailUrl?: string | null;
  size?: number | null;
  createdAt?: string | null;
};

export type PublishedPayload = {
  publicId: string;
  boardId: string;
  title: string;
  clientName: string;
  companyName: string;
  logline?: string;
  heroFrameUrl: string | null;
  videos: PublishedMedia[];
  /** Board creation / upload date ISO */
  createdAt?: string;
  updatedAt: string;
  /** Sum of asset sizes in bytes */
  totalSize?: number;
  /** True when clients must enter a password (never includes the password itself) */
  passwordProtected?: boolean;
};

function isPublicHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Ensure the hero frame is a permanent public Supabase Storage URL
 * (never blob: or data: which only work on the creating device).
 */
async function resolvePublishedHeroUrl(board: Board): Promise<string | null> {
  // 1) Prefer stored hero_image_url / resolved display URL
  if (isPublicHttpUrl(board.heroFrameUrl) && !isLocalMediaUrl(board.heroFrameUrl)) {
    return board.heroFrameUrl.split('?')[0];
  }

  // 2) Prefer path → public URL from R2
  if (board.heroFramePath) {
    const fromPath =
      (await resolveHeroFrameDisplayUrl(board.heroFramePath)) ||
      getBoardAssetPublicUrl(board.heroFramePath);
    if (isPublicHttpUrl(fromPath) && !isLocalMediaUrl(fromPath)) {
      return fromPath.split('?')[0];
    }
  }

  // 3) Local blob/data — upload into hero-frames/
  if (board.heroFrameUrl && isLocalMediaUrl(board.heroFrameUrl)) {
    const uploaded = await uploadBoardAsset(board.id, board.heroFrameUrl, 'hero-frame.webp', {
      heroFrame: true
    });
    if (uploaded?.publicUrl) {
      return uploaded.publicUrl;
    }
  }

  // 4) Download stored hero bytes and upload to R2
  const heroBlob = await getHeroFrameBlob(board.id);
  if (heroBlob) {
    const uploaded = await uploadBoardAsset(board.id, heroBlob, 'hero-frame.webp', {
      heroFrame: true
    });
    return uploaded.publicUrl;
  }

  return null;
}

async function resolvePublishedMediaUrl(
  boardId: string,
  media: { id: string; url: string; name: string; mimeType: string; storagePath?: string }
): Promise<string | null> {
  // 1) Prefer permanent public URL from R2 storage path
  if (media.storagePath) {
    const fromPath = getBoardAssetPublicUrl(media.storagePath);
    if (fromPath) return fromPath;
  }

  // 2) Already a stable http(s) public URL (not blob/data, ideally not a signed token URL)
  if (isPublicHttpUrl(media.url) && !isLocalMediaUrl(media.url)) {
    // Drop query params (cache-bust / short-lived signed tokens)
    return media.url.split('?')[0];
  }

  if (media.url && isLocalMediaUrl(media.url)) {
    const uploaded = await uploadBoardAsset(
      boardId,
      media.url,
      media.name || `media-${media.id}`
    );
    return uploaded.publicUrl;
  }

  const blob = await getBoardMediaBlob(boardId, media.id);
  if (blob) {
    const uploaded = await uploadBoardAsset(
      boardId,
      blob,
      media.name || `media-${media.id}`
    );
    return uploaded.publicUrl;
  }

  return null;
}

export async function buildAndPublishSnapshot(boardId: string): Promise<{
  publicId: string;
  url: string;
  payload: PublishedPayload;
}> {
  const publicId = await ensureBoardPublicId(boardId);
  const board = await getBoard(boardId);
  if (!board) throw new Error('Board not found');

  const heroFrameUrl = await resolvePublishedHeroUrl(board);

  const videos: PublishedMedia[] = [];
  for (const v of board.videos) {
    try {
      const url = await resolvePublishedMediaUrl(boardId, v);
      if (!url) continue;
      videos.push({
        id: v.id,
        name: v.name,
        mimeType: v.mimeType,
        url,
        thumbnailUrl: v.thumbnailUrl || null,
        size: v.size ?? null,
        createdAt: v.createdAt ?? null
      });
    } catch (err) {
      console.error('[publish] media upload failed', v.id, err);
    }
  }

  const totalSize = videos.reduce((sum, item) => sum + (Number(item.size) || 0), 0);

  const payload: PublishedPayload = {
    publicId,
    boardId,
    title: board.title,
    clientName: board.clientName,
    companyName: board.companyName,
    logline: board.logline,
    heroFrameUrl,
    videos,
    createdAt: board.createdAt,
    updatedAt: new Date().toISOString(),
    totalSize,
    passwordProtected: Boolean(board.accessPassword && board.accessPassword.trim())
  };

  await markBoardPublished(boardId);

  // Prefer authenticated client upsert (RLS); fall back to API with service role
  const { error } = await supabase.from('published_boards').upsert(
    {
      public_id: publicId,
      board_id: boardId,
      payload,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'public_id' }
  );

  if (error) {
    console.error('[publish] client upsert failed, trying API', error);
    await fetch('/api/boards/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, boardId, payload })
    });
  }

  const url =
    typeof window !== 'undefined' ? `${window.location.origin}/v/${publicId}` : `/v/${publicId}`;

  return { publicId, url, payload };
}

export function getPublishedShareUrl(board: Pick<Board, 'publicId'> | null | undefined) {
  if (!board?.publicId || typeof window === 'undefined') return null;
  return `${window.location.origin}/v/${board.publicId}`;
}

export function getLocalPublished(_publicId: string): PublishedPayload | null {
  // Legacy local snapshots removed — published boards are cloud-backed
  return null;
}
