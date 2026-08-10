import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

let supabaseAdmin: SupabaseClient;

if (supabaseUrl && supabaseServiceRole) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, { auth: { persistSession: false } });
} else {
  // Avoid creating a client with empty values which throws at import time.
  // Export a proxy that throws a helpful error when any method is accessed.
  const missingMessage =
    'Supabase admin environment variables are not set. Ensure SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are provided.';
  supabaseAdmin = new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error(missingMessage);
        };
      }
    }
  ) as unknown as SupabaseClient;
  // eslint-disable-next-line no-console
  console.warn('Supabase admin client not configured:', missingMessage);
}

export { supabaseAdmin };
