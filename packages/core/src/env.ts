// Publishable-only config. Read from EXPO_PUBLIC_* so it is inlined at build time
// for every target. NEVER put secrets here — secrets live in native stores.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  API_URL: required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL),
  SUPABASE_URL: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;
