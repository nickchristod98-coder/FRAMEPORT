import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AccountMenu from '../components/AccountMenu';
import AmbientBackground from '../components/AmbientBackground';
import { getSession, SessionUser, signOut } from '../lib/auth';
import { getBillingProfile, isPaidPlan, UserProfile } from '../lib/billing';
import { planDisplayName, planStorageLabel } from '../lib/plans';
import { openBillingPortal } from '../lib/stripeClient';

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessionUser = await getSession();
        if (!sessionUser) {
          router.replace('/signin?next=/account');
          return;
        }
        const billing = await getBillingProfile();
        if (!cancelled) {
          setUser(sessionUser);
          setProfile(billing);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load account');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleManage() {
    setError(null);
    setPortalLoading(true);
    try {
      await openBillingPortal();
    } catch (err: any) {
      setError(err?.message || 'Could not open billing portal');
      setPortalLoading(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-black" />;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Link href="/signin" className="text-[11px] uppercase tracking-[0.25em] underline">
          Sign in
        </Link>
      </main>
    );
  }

  const tier = profile?.planTier || 'free';
  const planName = planDisplayName(tier);
  const storageLabel = planStorageLabel(tier);
  const free = !isPaidPlan(tier);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <AmbientBackground />

      <header className="relative z-20 flex items-center justify-between px-6 py-6 md:px-10">
        <Link href="/dashboard" className="text-[11px] uppercase tracking-[0.4em] text-white/50">
          FramePort
        </Link>
        <AccountMenu />
      </header>

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-24 pt-10 md:px-10 md:pt-16">
        <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">Account</p>
        <h1 className="font-display mt-4 text-5xl tracking-tight sm:text-6xl">Your profile</h1>

        <div className="mt-12 border border-white/15 bg-white/[0.03] p-8 md:p-10">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="h-24 w-24 rounded-full object-cover ring-1 ring-white/20"
              />
            ) : (
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full border border-white/25 bg-white/5 font-display text-3xl text-white"
                aria-hidden="true"
              >
                {user.initials}
              </div>
            )}

            <div className="min-w-0">
              <p className="font-display text-3xl tracking-tight sm:text-4xl">{user.name}</p>
              <p className="mt-2 truncate text-sm text-white/50">{user.email}</p>
            </div>
          </div>

          <div className="mt-10 border-t border-white/10 pt-8">
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">Current plan</p>
            <p className="mt-3 text-xl font-bold uppercase tracking-wider text-white">
              {planName} PLAN · {storageLabel}
            </p>
            {profile?.subscriptionStatus ? (
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/35">
                Status: {profile.subscriptionStatus}
              </p>
            ) : null}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {free ? (
              <Link
                href="/pricing"
                className="inline-flex flex-1 items-center justify-center bg-white px-5 py-3 text-[11px] uppercase tracking-[0.25em] text-black transition hover:bg-white/90"
              >
                Upgrade
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleManage}
                disabled={portalLoading}
                className="inline-flex flex-1 items-center justify-center border border-white/25 px-5 py-3 text-[11px] uppercase tracking-[0.25em] transition hover:border-white/50 disabled:opacity-60"
              >
                {portalLoading ? 'Opening…' : 'Manage subscription'}
              </button>
            )}
            <Link
              href="/dashboard"
              className="inline-flex flex-1 items-center justify-center border border-white/25 px-5 py-3 text-[11px] uppercase tracking-[0.25em] transition hover:border-white/50"
            >
              Back to dashboard
            </Link>
          </div>

          {error ? <p className="mt-5 text-sm text-red-300">{error}</p> : null}

          <button
            type="button"
            className="mt-8 text-[11px] uppercase tracking-[0.25em] text-white/40 transition hover:text-white"
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
