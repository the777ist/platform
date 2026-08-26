// env.ts fails LOUDLY and EARLY on purpose: a missing EXPO_PUBLIC_* var throws at module load
// rather than surfacing later as a request to `undefined/v1/items` or a supabase client pointed at
// nowhere. The thrown message must name the variable — "Missing required env var" alone would send
// someone hunting through three .env files.
//
// Each case re-imports the module in isolation, because the export is evaluated once at import.
function loadEnv(overrides: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  jest.resetModules();
  try {
    // require, not a dynamic import: this jest setup runs without --experimental-vm-modules,
    // so `await import()` throws. require() is what re-evaluates the module after resetModules.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("../env") as typeof import("../env")).env;
  } finally {
    process.env = saved;
  }
}

describe("env", () => {
  it.each(["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"])(
    "throws NAMING %s when it is missing",
    (name) => {
      expect(() => loadEnv({ [name]: undefined })).toThrow(`Missing required env var: ${name}`);
    },
  );

  it("throws on an EMPTY string, not just an absent var", () => {
    // pydantic-settings has the same trap on the API side: "" is not None, and an
    // empty-string URL fails much later and much less clearly.
    expect(() => loadEnv({ EXPO_PUBLIC_API_URL: "" })).toThrow(
      "Missing required env var: EXPO_PUBLIC_API_URL",
    );
  });

  it("exposes the required values", () => {
    const env = loadEnv({ EXPO_PUBLIC_API_URL: "http://localhost:8010" });
    expect(env.API_URL).toBe("http://localhost:8010");
  });

  it("treats observability config as OPTIONAL so local and CI need no DSN", () => {
    const env = loadEnv({ EXPO_PUBLIC_SENTRY_DSN: undefined });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("defaults ENV to development rather than undefined", () => {
    // ENV tags every Sentry event; `undefined` would make production events unfilterable.
    const env = loadEnv({ EXPO_PUBLIC_ENV: undefined });
    expect(env.ENV).toBe("development");
  });
});
