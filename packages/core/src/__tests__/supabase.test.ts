// getSupabase must return ONE client for the process. A second client means a second auth
// listener, a second session refresh timer and a second realtime socket — the sort of thing that
// shows up as a session that randomly reverts or events arriving twice, long after the change
// that caused it.
//
// The auth options are load-bearing too: `detectSessionInUrl` must be web-only (native deep links
// do not carry the URL fragment, and parsing it there throws), and pkce is the flow the local
// stack and the API's JWT verification both assume.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ __brand: "client" })),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({ __brand: "async-storage" }));

// Platform.OS is set on the FRESHLY REQUIRED react-native, not on one imported at the top of this
// file: jest.resetModules() gives the module under test a new react-native instance, so mutating
// the outer one has no effect and every case would silently read the default platform.
function loadSupabase(os: "web" | "ios") {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports */
  (require("react-native") as { Platform: { OS: string } }).Platform.OS = os;
  const mod = require("../supabase") as typeof import("../supabase");
  const { createClient } = require("@supabase/supabase-js") as { createClient: jest.Mock };
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { ...mod, createClient };
}

/** The third argument createClient was called with. */
const authOptions = (createClient: jest.Mock) =>
  (createClient.mock.calls[0]![2] as { auth: Record<string, unknown> }).auth;

describe("getSupabase", () => {
  it("creates the client ONCE and returns the same instance", () => {
    const { getSupabase, createClient } = loadSupabase("ios");

    const first = getSupabase();
    const second = getSupabase();

    expect(first).toBe(second);
    // The module also evaluates `supabase` eagerly, so this is one call in total, not two.
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("exports the eager singleton as the SAME object getSupabase returns", () => {
    const { getSupabase, supabase } = loadSupabase("ios");
    expect(supabase).toBe(getSupabase());
  });

  it("points at the configured project", () => {
    const { createClient } = loadSupabase("ios");
    expect(createClient).toHaveBeenCalledWith(
      "http://localhost:54321",
      "test-anon-key",
      expect.anything(),
    );
  });

  it("persists and auto-refreshes the session", () => {
    const { createClient } = loadSupabase("ios");
    const auth = authOptions(createClient);
    // Without these a reload signs the user out, which is indistinguishable from a bug.
    expect(auth.persistSession).toBe(true);
    expect(auth.autoRefreshToken).toBe(true);
  });

  it("uses the pkce flow", () => {
    const { createClient } = loadSupabase("ios");
    expect(authOptions(createClient).flowType).toBe("pkce");
  });

  it("parses the session from the URL on WEB only", () => {
    expect(authOptions(loadSupabase("web").createClient).detectSessionInUrl).toBe(true);
    // Native deep links do not carry the URL fragment; parsing it there is pointless at best.
    expect(authOptions(loadSupabase("ios").createClient).detectSessionInUrl).toBe(false);
  });
});
