// Publishable-only values so `env.ts` resolves at import time. env.ts throws on a missing
// EXPO_PUBLIC_* var, and api.ts imports it transitively, so this must run before any module
// is evaluated (jest.config.js wires it as `setupFiles`, not `setupFilesAfterEach`).
//
// These are fake local values on purpose — nothing here reaches a real service.
process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000";
process.env.EXPO_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.EXPO_PUBLIC_ENV = "test";
