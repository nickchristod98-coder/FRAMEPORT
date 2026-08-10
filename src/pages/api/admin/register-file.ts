import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { projectId, storageBucket = 'media', storagePath, filename, mimeType, size, width, height, duration } =
    req.body;
  if (!projectId || !storagePath || !filename) return res.status(400).json({ error: 'Missing fields' });

  // Debug log incoming request
  // eslint-disable-next-line no-console
  console.log('Registering file in DB:', { projectId, storageBucket, storagePath, filename, mimeType, size, width, height, duration });

  try {
    // Try to construct a public URL for the uploaded file (if bucket/public policy allows)
    let publicUrl: string | null = null;
    try {
      const { data: pubData } = supabaseAdmin.storage.from(storageBucket).getPublicUrl(storagePath);
      if (pubData?.publicUrl) {
        publicUrl = pubData.publicUrl;
      }
    } catch (e) {
      // ignore
    }

    const { data, error } = await supabaseAdmin
      .from('media')
      .insert([
        {
          project_id: projectId,
          storage_bucket: storageBucket,
          storage_path: storagePath,
          public_url: publicUrl,
          filename,
          mime_type: mimeType,
          size,
          width: width || null,
          height: height || null,
          duration: duration || null
        }
      ])
      .select()
      .single();
    if (error) {
      // eslint-disable-next-line no-console
      console.error('DB Insert Error:', error);
      throw error;
    }
    return res.status(200).json({ media: data });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [register-file]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

