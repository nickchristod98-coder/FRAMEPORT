import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const { publicId } = req.query;
  if (!publicId || Array.isArray(publicId)) return res.status(400).json({ error: 'Missing publicId' });
  try {
    // find link
    const { data: linkData, error: linkErr } = await supabaseAdmin
      .from('gallery_links')
      .select('id, project_id, expires_at')
      .eq('public_id', publicId)
      .maybeSingle();
    if (linkErr || !linkData) return res.status(404).json({ error: 'Gallery not found' });
    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) return res.status(410).json({ error: 'Link expired' });

    // fetch media for project
    const { data: mediaRows, error: mediaErr } = await supabaseAdmin
      .from('media')
      .select('*')
      .eq('project_id', linkData.project_id)
      .order('created_at', { ascending: true });
    if (mediaErr) throw mediaErr;

    // create signed URLs for each (valid for 1 hour)
    const signed = await Promise.all(
      (mediaRows || []).map(async (m: any) => {
        try {
          const bucket = m.storage_bucket || 'galleries';
          const { data: urlData, error: urlErr } = await supabaseAdmin.storage
            .from(bucket)
            .createSignedUrl(m.storage_path, 60 * 60);
          const signedUrl = urlErr ? null : (urlData as any).signedURL;
          return { ...m, signedUrl };
        } catch (e) {
          return { ...m, signedUrl: null };
        }
      })
    );

    return res.status(200).json({ media: signed });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [gallery/media]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

