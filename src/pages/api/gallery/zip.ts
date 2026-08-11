import type { NextApiRequest, NextApiResponse } from 'next';
import JSZip from 'jszip';
import { r2PublicUrl } from '../../../lib/r2';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '200mb'
    }
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { publicId, mediaIds } = req.body;
  if (!publicId || !mediaIds || !Array.isArray(mediaIds)) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    let boardId: string | number | null = null;

    const { data: published } = await supabaseAdmin
      .from('published_boards')
      .select('board_id')
      .eq('public_id', publicId)
      .maybeSingle();
    if (published?.board_id) {
      boardId = published.board_id;
    } else {
      const { data: linkData, error: linkErr } = await supabaseAdmin
        .from('gallery_links')
        .select('id, project_id')
        .eq('public_id', publicId)
        .maybeSingle();
      if (linkErr || !linkData) return res.status(404).json({ error: 'Gallery not found' });
      boardId = linkData.project_id;
    }

    const { data: mediaRows, error: mediaErr } = await supabaseAdmin
      .from('fp_board_media')
      .select('*')
      .in('id', mediaIds)
      .eq('board_id', boardId);
    if (mediaErr) throw mediaErr;

    const zip = new JSZip();

    for (const m of mediaRows || []) {
      try {
        const url =
          m.original_url ||
          m.public_url ||
          r2PublicUrl(m.storage_path);
        if (!url) {
          console.warn('[gallery/zip] skipping media with no URL', m.id);
          continue;
        }
        const fileRes = await fetch(url);
        if (!fileRes.ok) {
          console.warn('[gallery/zip] failed download', { url, status: fileRes.status });
          continue;
        }
        const arrayBuffer = await fileRes.arrayBuffer();
        zip.file(m.filename || `file-${m.id}`, Buffer.from(arrayBuffer));
      } catch (e) {
        console.warn('[gallery/zip] skip file due to error', e);
      }
    }

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="gallery_${publicId}.zip"`);
    res.send(content);
  } catch (err: any) {
    console.error('API ERROR [gallery/zip]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}
