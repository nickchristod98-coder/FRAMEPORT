import { supabase } from './supabaseClient';

async function authHeaders(): Promise<HeadersInit> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be signed in.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export async function startCheckout(plan: 'pro' | 'max') {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ plan })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not start checkout');
  if (!json.url) throw new Error('Checkout session missing redirect URL');
  window.location.href = json.url as string;
}

export async function openBillingPortal() {
  const res = await fetch('/api/stripe/portal', {
    method: 'POST',
    headers: await authHeaders()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not open billing portal');
  if (!json.url) throw new Error('Portal session missing redirect URL');
  window.location.href = json.url as string;
}
