import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function createClientOrNull(): SupabaseClient | null {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const key = serviceKey || anonKey;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { publicId } = req.query;
  if (!publicId || Array.isArray(publicId) || !String(publicId).trim()) {
    return res.status(400).json({ error: 'Missing publicId' });
  }

  const id = String(publicId).trim();

  try {
    const client = createClientOrNull();
    if (!client) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const { data, error } = await client
      .from('published_boards')
      .select('payload, board_id')
      .eq('public_id', id)
      .maybeSingle();

    if (error) {
      console.error('Published board fetch error:', error);
      return res.status(404).json({ error: 'Board not found' });
    }

    if (!data?.payload) {
      return res.status(404).json({ error: 'Board not found' });
    }

    let requiresPassword = Boolean((data.payload as any)?.passwordProtected);
    try {
      const { data: board } = await client
        .from('vision_boards')
        .select('access_password')
        .eq('public_id', id)
        .maybeSingle();
      if (board) {
        requiresPassword = Boolean(board.access_password && String(board.access_password).length > 0);
      }
    } catch (err) {
      console.warn('[published] access_password lookup failed', err);
    }

    // Never leak the password to the client
    const payload = { ...(data.payload as object), passwordProtected: requiresPassword };

    return res.status(200).json({ payload, requiresPassword });
  } catch (error) {
    console.error('Published board fetch error:', error);
    return res.status(404).json({ error: 'Board not found' });
  }
}
