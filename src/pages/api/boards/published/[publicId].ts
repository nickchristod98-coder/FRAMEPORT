import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function createPublishedBoardsClient(): SupabaseClient | null {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  // Prefer service role when configured; fall back to anon (public read on published_boards).
  const key = serviceKey || anonKey;
  if (!supabaseUrl || !key) {
    console.error('Published board fetch error:', {
      message: 'Supabase env vars missing',
      hasUrl: Boolean(supabaseUrl),
      hasServiceRole: Boolean(serviceKey),
      hasAnonKey: Boolean(anonKey)
    });
    return null;
  }

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

  try {
    const client = createPublishedBoardsClient();
    if (!client) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const { data, error } = await client
      .from('published_boards')
      .select('payload')
      .eq('public_id', String(publicId).trim())
      .maybeSingle();

    if (error) {
      console.error('Published board fetch error:', error);
      return res.status(404).json({ error: 'Board not found' });
    }

    if (!data?.payload) {
      return res.status(404).json({ error: 'Board not found' });
    }

    return res.status(200).json({ payload: data.payload });
  } catch (error) {
    console.error('Published board fetch error:', error);
    return res.status(404).json({ error: 'Board not found' });
  }
}
