import { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  initials: string;
};

function initialsFromName(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length) return parts[0].slice(0, 2).toUpperCase();
  return (email || 'FP').slice(0, 2).toUpperCase();
}

export function mapUser(user: User | null | undefined): SessionUser | null {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const name = (meta.full_name as string) || (meta.name as string) || user.email?.split('@')[0] || 'User';
  const email = user.email || '';
  return {
    id: user.id,
    email,
    name,
    initials: initialsFromName(name, email)
  };
}

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: name.trim(),
        name: name.trim()
      }
    }
  });
  if (error) throw error;
  return {
    user: mapUser(data.user),
    session: data.session,
    needsEmailConfirmation: !data.session
  };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) throw error;
  return mapUser(data.user);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user) return null;
  return mapUser(data.session.user);
}

export async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export function onAuthStateChange(callback: (user: SessionUser | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(mapUser(session?.user));
  });
  return () => data.subscription.unsubscribe();
}
