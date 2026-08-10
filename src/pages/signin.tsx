import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AmbientBackground from '../components/AmbientBackground';
import { getSession, signIn, signOut, SessionUser } from '../lib/auth';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [existingUser, setExistingUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    // Detect existing session but do NOT auto-redirect — always let user type credentials
    getSession()
      .then((user) => setExistingUser(user))
      .catch(() => setExistingUser(null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // If someone else is already signed in, clear that session first
      if (existingUser) {
        try {
          await signOut();
        } catch {
          // continue with new sign-in
        }
      }
      await signIn(email.trim(), password);
      await router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <AmbientBackground />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <Link
          href="/"
          className="mb-10 text-[11px] uppercase tracking-[0.4em] text-white/40 transition hover:text-white/70"
        >
          FramePort
        </Link>

        <h1 className="font-display mb-10 text-center text-4xl tracking-tight sm:text-5xl">Sign in</h1>

        {existingUser && (
          <div className="mb-8 w-full max-w-md border border-white/15 bg-white/5 p-4 text-center text-sm text-white/60">
            Currently signed in as <span className="text-white">{existingUser.email}</span>.
            <div className="mt-3 flex justify-center gap-4">
              <Link href="/dashboard" className="text-[11px] uppercase tracking-[0.2em] text-white underline-offset-4 hover:underline">
                Go to dashboard
              </Link>
              <button
                type="button"
                className="text-[11px] uppercase tracking-[0.2em] text-white/50 hover:text-white"
                onClick={async () => {
                  await signOut();
                  setExistingUser(null);
                  setEmail('');
                  setPassword('');
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md space-y-5"
          autoComplete="off"
        >
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">Email</span>
            <input
              type="email"
              name="frameport-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@email.com"
              className="w-full border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-white/60"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">Password</span>
            <input
              type="password"
              name="frameport-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Enter password"
              className="w-full border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-white/60"
            />
          </label>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full border border-white bg-white px-6 py-4 text-sm font-medium uppercase tracking-[0.22em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-8 text-sm text-white/45">
          New here?{' '}
          <Link href="/signup" className="text-white underline-offset-4 hover:underline">
            Let&apos;s Begin
          </Link>
        </p>
      </div>
    </main>
  );
}
