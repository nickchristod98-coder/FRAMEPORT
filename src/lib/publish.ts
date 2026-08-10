import { supabase } from './supabaseClient';
import {
  Board,
  ensureBoardPublicId,
  getBoard,
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
  url: string;
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
  updatedAt: string;
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
  // 1) Prefer path → public URL from board-assets / legacy media bucket
  if (board.heroFramePath) {
    const fromPath = await resolveHeroFrameDisplayUrl(board.heroFramePath);
    if (isPublicHttpUrl(fromPath) && !isLocalMediaUrl(fromPath)) {
      return fromPath.split('?')[0]; // stable URL without cache-bust for publish payload
    }
  }

  // 2) Already a public http(s) URL
  if (isPublicHttpUrl(board.heroFrameUrl) && !isLocalMediaUrl(board.heroFrameUrl)) {
    return board.heroFrameUrl.split('?')[0];
  }

  // 3) Local blob/data — upload into board-assets
  if (isLocalMediaUrl(board.heroFrameUrl)) {
    const uploaded = await uploadBoardAsset(board.id, board.heroFrameUrl, 'hero-frame.jpg');
    return uploaded.publicUrl;
  }

  // 4) Download stored hero bytes and upload to board-assets
  const heroBlob = await getHeroFrameBlob(board.id);
  if (heroBlob) {
    const uploaded = await uploadBoardAsset(board.id, heroBlob, 'hero-frame.jpg');
    return uploaded.publicUrl;
  }

  return null;
}

async function resolvePublishedMediaUrl(
  boardId: string,
  media: { id: string; url: string; name: string; mimeType: string }
): Promise<string | null> {
  if (isPublicHttpUrl(media.url) && !isLocalMediaUrl(media.url)) {
    return media.url.split('?')[0];
  }

  if (isLocalMediaUrl(media.url)) {
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
        url
      });
    } catch (err) {
      console.error('[publish] media upload failed', v.id, err);
    }
  }

  const payload: PublishedPayload = {
    publicId,
    boardId,
    title: board.title,
    clientName: board.clientName,
    companyName: board.companyName,
    logline: board.logline,
    heroFrameUrl,
    videos,
    updatedAt: new Date().toISOString()
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
