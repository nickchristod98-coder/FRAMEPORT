import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AccountMenu from '../components/AccountMenu';
import StickyBoardHeader from '../components/StickyBoardHeader';
import { getSession } from '../lib/auth';
import { getBillingProfile, isPaidPlan, UserProfile } from '../lib/billing';
import { PLANS, PlanTier } from '../lib/plans';
import { openBillingPortal, startCheckout } from '../lib/stripeClient';
import { supabase } from '../lib/supabaseClient';

export default function PricingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    getSession()
      .then(async (user) => {
        setSignedIn(!!user);
        if (user) {
          const billing = await getBillingProfile();
          setProfile(billing);
        }
      })
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    const sessionId =
      typeof router.query.session_id === 'string' ? router.query.session_id : null;

    if (router.query.checkout === 'success') {
      setBanner('Payment successful. Updating your plan…');
      (async () => {
        try {
          if (sessionId) {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (token) {
              const res = await fetch('/api/stripe/confirm', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionId })
              });
              const json = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(json.error || 'Could not confirm checkout');
            }
          }
          const billing = await getBillingProfile();
          setProfile(billing);
          setBanner(
            billing
              ? `You're on ${billing.planTier.toUpperCase()} — ${Math.round(
                  billing.storageLimitBytes / (1024 * 1024 * 1024)
                )} GB storage.`
              : 'Payment successful. Your plan will update in a few moments.'
          );
        } catch (err: any) {
          console.error('[pricing] confirm checkout', err);
          setBanner('Payment received. If your plan does not update, refresh in a moment.');
          getBillingProfile()
            .then(setProfile)
            .catch(() => undefined);
        }
      })();
    } else if (router.query.checkout === 'cancel' || router.query.checkout === 'cancelled') {
      setBanner('Checkout canceled. No charges were made.');
    }
  }, [router.isReady, router.query.checkout, router.query.session_id]);

  async function onSubscribe(plan: 'pro' | 'max') {
    setError(null);
    if (!signedIn) {
      router.push(`/signin?next=${encodeURIComponent('/pricing')}`);
      return;
    }
    setLoadingPlan(plan);
    try {
      await startCheckout(plan);
    } catch (err: any) {
      setError(err?.message || 'Could not start checkout');
      setLoadingPlan(null);
    }
  }

  async function onManage() {
    setError(null);
    setLoadingPlan('pro');
    try {
      await openBillingPortal();
    } catch (err: any) {
      setError(err?.message || 'Could not open billing portal');
      setLoadingPlan(null);
    }
  }

  const currentTier = profile?.planTier || 'free';
  const paid = isPaidPlan(currentTier);

  return (
    <main className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
      <StickyBoardHeader
        left={
          <Link href={signedIn ? '/dashboard' : '/'} className="text-[11px] uppercase tracking-[0.4em] text-white">
            FramePort
          </Link>
        }
        right={
          signedIn ? (
            <AccountMenu />
          ) : (
            <Link
              href="/signin"
              className="text-[11px] uppercase tracking-[0.25em] text-white/70 transition hover:text-white"
            >
              Sign in
            </Link>
          )
        }
      />

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-32 md:px-10">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">Pricing</p>
          <h1 className="font-display mt-4 text-5xl tracking-tight sm:text-6xl md:text-7xl">
            Storage that scales with your work
          </h1>
          <p className="mt-6 text-lg text-white/60">
            Start free with 1 GB. Upgrade when your boards need room for more footage and stills.
            Tax is calculated automatically at checkout.
          </p>
        </div>

        {banner ? (
          <p className="mt-8 border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white/80">
            {banner}
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        {profile ? (
          <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-white/50">
            Current plan: {currentTier.toUpperCase()}
            {profile.subscriptionStatus ? ` · ${profile.subscriptionStatus}` : ''}
          </p>
        ) : null}

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.id;
            return (
              <div
                key={plan.id}
                className={`flex flex-col border p-8 ${
                  plan.highlighted
                    ? 'border-white bg-white/[0.06]'
                    : 'border-white/15 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-3xl">{plan.name}</h2>
                  {plan.highlighted ? (
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/55">Popular</span>
                  ) : null}
                </div>
                <p className="mt-4 flex items-end gap-1">
                  <span className="font-display text-5xl">{plan.priceLabel}</span>
                  {plan.id !== 'free' ? (
                    <span className="mb-1 text-sm text-white/45">/mo + tax</span>
                  ) : (
                    <span className="mb-1 text-sm text-white/45">/mo</span>
                  )}
                </p>
                <p className="mt-2 text-sm text-white/55">{plan.storageLabel} storage</p>
                <p className="mt-5 text-sm leading-relaxed text-white/65">{plan.description}</p>
                <ul className="mt-6 space-y-2 text-sm text-white/70">
                  {plan.features.map((f) => (
                    <li key={f}>— {f}</li>
                  ))}
                </ul>

                <div className="mt-10">
                  {plan.id === 'free' ? (
                    <Link
                      href={signedIn ? '/dashboard' : '/signup'}
                      className="inline-flex w-full items-center justify-center border border-white/25 px-5 py-3 text-[11px] uppercase tracking-[0.25em] transition hover:border-white/50"
                    >
                      {signedIn ? (isCurrent ? 'Current plan' : 'Go to dashboard') : 'Get started'}
                    </Link>
                  ) : isCurrent ? (
                    <button
                      type="button"
                      onClick={onManage}
                      disabled={!!loadingPlan}
                      className="inline-flex w-full items-center justify-center bg-white px-5 py-3 text-[11px] uppercase tracking-[0.25em] text-black transition hover:bg-white/90 disabled:opacity-60"
                    >
                      {loadingPlan ? 'Opening…' : 'Manage Subscription'}
                    </button>
                  ) : currentTier === 'pro' && plan.id === 'max' ? (
                    <button
                      type="button"
                      onClick={() => onSubscribe('max')}
                      disabled={!!loadingPlan}
                      className="inline-flex w-full items-center justify-center bg-white px-5 py-3 text-[11px] uppercase tracking-[0.25em] text-black transition hover:bg-white/90 disabled:opacity-60"
                    >
                      {loadingPlan === 'max' ? 'Upgrading…' : 'Upgrade to MAX'}
                    </button>
                  ) : paid && !isCurrent ? (
                    <button
                      type="button"
                      onClick={onManage}
                      disabled={!!loadingPlan}
                      className="inline-flex w-full items-center justify-center border border-white/25 px-5 py-3 text-[11px] uppercase tracking-[0.25em] transition hover:border-white/50 disabled:opacity-60"
                    >
                      {loadingPlan ? 'Opening…' : 'Manage Subscription'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSubscribe(plan.id as 'pro' | 'max')}
                      disabled={!!loadingPlan}
                      className={`inline-flex w-full items-center justify-center px-5 py-3 text-[11px] uppercase tracking-[0.25em] transition disabled:opacity-60 ${
                        plan.highlighted
                          ? 'bg-white text-black hover:bg-white/90'
                          : 'border border-white/25 hover:border-white/50'
                      }`}
                    >
                      {loadingPlan === plan.id ? 'Redirecting…' : 'Subscribe'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
