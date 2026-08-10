import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { publicId, boardId, payload } = req.body || {};
  if (!publicId || !payload) {
    return res.status(400).json({ error: 'Missing publicId or payload' });
  }

  try {
    const { error } = await supabaseAdmin.from('published_boards').upsert(
      {
        public_id: publicId,
        board_id: boardId || null,
        payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'public_id' }
    );

    if (error) {
      // eslint-disable-next-line no-console
      console.error('API ERROR [boards/publish]:', error);
      // Still OK — client keeps a local snapshot
      return res.status(200).json({ ok: true, remote: false, warning: error.message });
    }

    return res.status(200).json({ ok: true, remote: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('API ERROR [boards/publish]:', err);
    return res.status(200).json({ ok: true, remote: false, warning: err?.message || String(err) });
  }
}
