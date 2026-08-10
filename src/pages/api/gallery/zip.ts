import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import JSZip from 'jszip';

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
  if (!publicId || !mediaIds || !Array.isArray(mediaIds)) return res.status(400).json({ error: 'Missing fields' });
  try {
    // find link
    const { data: linkData, error: linkErr } = await supabaseAdmin
      .from('gallery_links')
      .select('id, project_id')
      .eq('public_id', publicId)
      .maybeSingle();
    if (linkErr || !linkData) return res.status(404).json({ error: 'Gallery not found' });

    // fetch media rows
    const { data: mediaRows, error: mediaErr } = await supabaseAdmin
      .from('media')
      .select('*')
      .in('id', mediaIds)
      .eq('project_id', linkData.project_id);
    if (mediaErr) throw mediaErr;

    const zip = new JSZip();

    // for each media, download from storage and add to zip
    for (const m of mediaRows || []) {
      try {
        const bucket = m.storage_bucket || 'galleries';
        const path = m.storage_path;
        if (!path) {
          // eslint-disable-next-line no-console
          console.warn('[gallery/zip] skipping media with empty storage_path', m);
          continue;
        }
        const { data: fileData, error: fileErr } = await supabaseAdmin.storage.from(bucket).download(path);
        if (fileErr || !fileData) {
          // eslint-disable-next-line no-console
          console.warn('[gallery/zip] failed download', { path, error: fileErr });
          continue;
        }
        // fileData is a Readable/Blob-like object; convert to buffer
        // @ts-ignore
        const arrayBuffer = await fileData.arrayBuffer();
        zip.file(m.filename, Buffer.from(arrayBuffer));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[gallery/zip] skip file due to error', e);
        continue;
      }
    }

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="gallery_${publicId}.zip"`);
    res.send(content);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [gallery/zip]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

