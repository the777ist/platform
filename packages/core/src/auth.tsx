import { useEffect, type ReactNode } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useRouter, useSegments } from "expo-router";
import type { Session, User } from "@supabase/supabase-js";

import { getSupabase } from "./supabase";

type SessionState = {
  session: Session | null;
  user: User | null;
  /** true until the initial getSession()/onAuthStateChange has resolved — guards MUST wait on this */
  loading: boolean;
  setSession: (s: Session | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  user: null,
  loading: true,
  setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
}));

/**
 * Wire supabase auth → the store ONCE, at the provider root.
 * Mount <AuthProvider/> high in app/_layout.tsx.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useSessionStore((s) => s.setSession);
  useEffect(() => {
    const supabase = getSupabase();
    // 1) hydrate current session (covers cold start with a persisted session)
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // 2) keep the store in sync (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [setSession]);
  return <>{children}</>;
}

/** Read-only session accessor for screens. */
export function useSession() {
  // useShallow: the selector builds a fresh object — without shallow comparison,
  // zustand v5's useSyncExternalStore sees a new snapshot every render → infinite loop.
  return useSessionStore(
    useShallow((s) => ({ session: s.session, user: s.user, loading: s.loading })),
  );
}

export function getAccessToken(): string | null {
  return useSessionStore.getState().session?.access_token ?? null;
}

// ---- auth actions (thin wrappers; screens call these) -------------------------------

export async function signIn(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const { error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

// ---- route guard ---------------------------------------------------------------------

/**
 * Shared guard hook used by the route-group layouts. Redirects:
 *  - signed OUT + inside (tabs)  → (auth)/login
 *  - signed IN  + inside (auth)  → (tabs)
 * Waits on `loading` so a persisted session does not flash the login screen on cold start.
 */
export function useProtectedRoute() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // CRITICAL: avoid redirect flicker before session hydrates
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, loading, segments, router]);

  return { loading };
}
