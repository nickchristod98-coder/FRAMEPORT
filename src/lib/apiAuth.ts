import type { NextApiRequest } from 'next';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseAdmin';

function getBearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match?.[1]) return match[1].trim();
  return null;
}

/**
 * Resolve the signed-in Supabase user from the Authorization Bearer token.
 */
export async function requireApiUser(req: NextApiRequest) {
  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error('Missing auth token'), { statusCode: 401 });
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anon) {
    throw Object.assign(new Error('Supabase is not configured'), { statusCode: 500 });
  }

  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
  return data.user;
}

export async function getOrCreateProfileRow(userId: string, email?: string | null) {
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: email || null,
        plan_tier: 'free',
        storage_limit_bytes: 1073741824,
        subscription_status: 'active'
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return created;
}
