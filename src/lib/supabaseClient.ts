import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const missingMessage =
  'Supabase environment variables are not set. Please create .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.';

let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  // Pass project URL only — createClient adds /auth/v1, /rest/v1, etc. itself
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    }
  });
} else {
  supabase = new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error(missingMessage);
        };
      }
    }
  ) as unknown as SupabaseClient;
}

export { supabase };
