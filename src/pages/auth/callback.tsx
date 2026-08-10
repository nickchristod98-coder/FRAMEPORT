import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * Email confirmation / OAuth return URL.
 * Supabase redirects here after signup confirmation.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Confirming your account…');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Handle both hash tokens and code exchange if present
        const { error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (hash.includes('access_token') || hash.includes('error')) {
          // supabase-js with detectSessionInUrl will parse the hash
          await supabase.auth.getSession();
        }

        const params = new URLSearchParams(
          typeof window !== 'undefined' ? window.location.search : ''
        );
        const code = params.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        if (cancelled) return;
        setMessage('Signed in — redirecting…');
        await router.replace('/dashboard');
      } catch (err: any) {
        console.error('[auth/callback]', err);
        if (cancelled) return;
        setMessage(err?.message || 'Could not complete sign-in.');
        window.setTimeout(() => {
          router.replace('/signin');
        }, 2500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <p className="text-sm text-white/60">{message}</p>
    </main>
  );
}
