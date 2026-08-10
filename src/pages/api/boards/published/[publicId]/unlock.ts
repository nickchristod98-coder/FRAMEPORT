import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { publicId } = req.query;
  if (!publicId || Array.isArray(publicId) || !String(publicId).trim()) {
    return res.status(400).json({ error: 'Missing publicId' });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const id = String(publicId).trim();

  try {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const key = serviceKey || anonKey;
    if (!supabaseUrl || !key) {
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    const client = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: board, error } = await client
      .from('vision_boards')
      .select('access_password')
      .eq('public_id', id)
      .maybeSingle();

    if (error) {
      console.error('[unlock] board lookup', error);
      return res.status(404).json({ error: 'Board not found' });
    }

    const expected = board?.access_password ? String(board.access_password) : '';
    if (!expected) {
      return res.status(200).json({ ok: true, unlocked: true });
    }

    if (password !== expected) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    return res.status(200).json({ ok: true, unlocked: true });
  } catch (err: any) {
    console.error('[unlock]', err);
    return res.status(500).json({ error: err?.message || 'Unlock failed' });
  }
}
