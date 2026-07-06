import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { env } from "./env";

/**
 * Platform-correct auth-session storage adapter.
 * - native (iOS/Android): AsyncStorage
 * - web: window.localStorage (createClient defaults to this when storage is undefined,
 *   but we pass it explicitly so SSR/Electron `app://` contexts are deterministic)
 *
 * NOTE: supabase-js is used on the frontend ONLY for auth / Realtime / Storage.
 * Core domain data still flows through FastAPI (Topology decision).
 */
const authStorage =
  Platform.OS === "web"
    ? typeof window !== "undefined"
      ? window.localStorage
      : undefined
    : AsyncStorage;

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      storage: authStorage as never,
      autoRefreshToken: true,
      persistSession: true,
      // Native deep links don't carry the URL fragment session; only web should parse it.
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
    },
  });
  return _client;
}

/** Convenience singleton for call sites that don't need lazy init. */
export const supabase = getSupabase();
