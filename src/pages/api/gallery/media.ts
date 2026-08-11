import type { NextApiRequest, NextApiResponse } from 'next';
import { r2PublicUrl } from '../../../lib/r2';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const { publicId } = req.query;
  if (!publicId || Array.isArray(publicId)) return res.status(400).json({ error: 'Missing publicId' });
  try {
    // Prefer published_boards (FramePort) when present
    const { data: published } = await supabaseAdmin
      .from('published_boards')
      .select('payload, board_id')
      .eq('public_id', publicId)
      .maybeSingle();

    if (published?.payload?.videos) {
      const media = (published.payload.videos || []).map((v: any) => ({
        id: v.id,
        filename: v.name,
        mime_type: v.mimeType,
        size: v.size ?? null,
        storage_path: null,
        public_url: v.url,
        original_url: v.url,
        thumbnail_url: v.thumbnailUrl || null,
        signedUrl: v.url
      }));
      return res.status(200).json({ media });
    }

    // Legacy gallery_links → fp_board_media by board_id
    const { data: linkData, error: linkErr } = await supabaseAdmin
      .from('gallery_links')
      .select('id, project_id, expires_at')
      .eq('public_id', publicId)
      .maybeSingle();
    if (linkErr || !linkData) return res.status(404).json({ error: 'Gallery not found' });
    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Link expired' });
    }

    const boardId = linkData.project_id;
    const { data: mediaRows, error: mediaErr } = await supabaseAdmin
      .from('fp_board_media')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });
    if (mediaErr) throw mediaErr;

    const signed = (mediaRows || []).map((m: any) => {
      const original =
        m.original_url ||
        m.public_url ||
        r2PublicUrl(m.storage_path) ||
        null;
      return {
        ...m,
        public_url: original,
        original_url: original,
        thumbnail_url: m.thumbnail_url || null,
        signedUrl: original
      };
    });

    return res.status(200).json({ media: signed });
  } catch (err: any) {
    console.error('API ERROR [gallery/media]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}
