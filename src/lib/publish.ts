import { supabase } from './supabaseClient';
import {
  Board,
  ensureBoardPublicId,
  getBoard,
  getBoardMediaBlob,
  getHeroFrameBlob,
  markBoardPublished
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

export async function buildAndPublishSnapshot(boardId: string): Promise<{
  publicId: string;
  url: string;
  payload: PublishedPayload;
}> {
  const publicId = await ensureBoardPublicId(boardId);
  const board = await getBoard(boardId);
  if (!board) throw new Error('Board not found');

  // Media already lives in Supabase Storage — reuse public URLs
  let heroFrameUrl = board.heroFrameUrl || null;
  if (!heroFrameUrl) {
    const heroBlob = await getHeroFrameBlob(boardId);
    if (heroBlob) {
      // ensure hero is uploaded via save path already; keep null if missing
      heroFrameUrl = null;
    }
  }

  const videos: PublishedMedia[] = board.videos.map((v) => ({
    id: v.id,
    name: v.name,
    mimeType: v.mimeType,
    url: v.url
  }));

  // If a url is missing, try downloading/rebuilding — skip empty
  const filtered = [];
  for (const v of videos) {
    if (v.url) filtered.push(v);
    else {
      const blob = await getBoardMediaBlob(boardId, v.id);
      if (blob) {
        // already in storage; getBoard should have url — skip if empty
      }
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
    videos: filtered.length ? filtered : videos.filter((v) => !!v.url),
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
