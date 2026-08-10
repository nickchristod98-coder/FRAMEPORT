import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { getSession, onAuthStateChange, signOut, SessionUser } from '../lib/auth';

export default function AccountMenu() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSession()
      .then(setUser)
      .catch(() => setUser(null));
    const unsub = onAuthStateChange(setUser);
    return unsub;
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center border border-white/30 text-[11px] font-medium tracking-[0.12em] text-white transition hover:border-white"
        aria-label="Account"
      >
        {user.initials}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 min-w-[200px] border border-white/15 bg-black/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-3 text-sm text-white/80">{user.name}</div>
          <div className="mb-4 text-xs text-white/40">{user.email}</div>
          <Link
            href="/dashboard"
            className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            href="/pricing"
            className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
            onClick={() => setOpen(false)}
          >
            Pricing
          </Link>
          <button
            type="button"
            className="text-[11px] uppercase tracking-[0.2em] text-white/50 hover:text-white"
            onClick={async () => {
              await signOut();
              setOpen(false);
              router.push('/');
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
