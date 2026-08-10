import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const { projectId } = req.query;
  if (!projectId || Array.isArray(projectId)) return res.status(400).json({ error: 'Missing projectId' });
  try {
    const { data, error } = await supabaseAdmin.from('media').select('*').eq('project_id', projectId);
    if (error) throw error;
    // create signed URLs for admin preview (short lived)
    const signed = await Promise.all(
      (data || []).map(async (m: any) => {
        try {
          const bucket = m.storage_bucket || 'galleries';
          const { data: urlData, error: urlErr } = await supabaseAdmin.storage.from(bucket).createSignedUrl(m.storage_path, 60 * 60);
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
    console.error('API ERROR [admin/project-media]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

