import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import AmbientBackground from '../components/AmbientBackground';
import { signUp } from '../lib/auth';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters (Supabase requirement).');
      return;
    }
    setLoading(true);
    try {
      const result = await signUp(email, password, name);
      if (result.needsEmailConfirmation) {
        setInfo('Check your email to confirm your account, then sign in.');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err?.message || 'Sign up failed');
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

        <h1 className="font-display mb-10 text-center text-4xl tracking-tight sm:text-5xl">
          Create your account
        </h1>

        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition focus:border-white/60"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition focus:border-white/60"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition focus:border-white/60"
            />
          </label>

          {error && <p className="text-sm text-red-300">{error}</p>}
          {info && <p className="text-sm text-white/70">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full border border-white bg-white px-6 py-4 text-sm font-medium uppercase tracking-[0.22em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Sign up'}
          </button>
        </form>

        <p className="mt-8 text-sm text-white/45">
          Already have an account?{' '}
          <Link href="/signin" className="text-white underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
