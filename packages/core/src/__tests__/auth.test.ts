// The session store is what every route guard and every API request reads from. Two properties
// matter beyond "it stores a session": `loading` must drop to false once auth resolves (guards
// wait on it, so a stuck `true` means a permanently blank app), and `user` must be derived from
// the session rather than tracked separately (two sources of truth would drift).
//
// The auth actions are thin wrappers whose ONLY job is to surface supabase errors. A swallowed
// error there shows a "successful" login that silently did nothing.
import { useSessionStore, getAccessToken, signIn, signUp, signOut } from "../auth";
import { getSupabase } from "../supabase";

jest.mock("../supabase", () => ({ getSupabase: jest.fn(), supabase: {} }));
// expo-router is only used by the route-guard hook, which these tests do not render.
jest.mock("expo-router", () => ({ useRouter: jest.fn(), useSegments: jest.fn() }));

const mockGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;

function fakeAuth(error: Error | null = null) {
  const signInWithPassword = jest.fn().mockResolvedValue({ error });
  const supaSignUp = jest.fn().mockResolvedValue({ error });
  const supaSignOut = jest.fn().mockResolvedValue({ error });
  mockGetSupabase.mockReturnValue({
    auth: { signInWithPassword, signUp: supaSignUp, signOut: supaSignOut },
  } as never);
  return { signInWithPassword, supaSignUp, supaSignOut };
}

const session = (accessToken: string) =>
  ({ access_token: accessToken, user: { id: "u1", email: "a@b.c" } }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ session: null, user: null, loading: true });
});

describe("session store", () => {
  it("starts loading, so guards do not flash the login screen on cold start", () => {
    expect(useSessionStore.getState().loading).toBe(true);
  });

  it("derives user from the session and finishes loading", () => {
    useSessionStore.getState().setSession(session("tok"));

    const state = useSessionStore.getState();
    expect(state.user).toEqual({ id: "u1", email: "a@b.c" });
    expect(state.loading).toBe(false);
  });

  it("clears the user on sign-out and STILL finishes loading", () => {
    useSessionStore.getState().setSession(session("tok"));
    useSessionStore.getState().setSession(null);

    const state = useSessionStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    // A null session that left loading:true would hang every guard forever.
    expect(state.loading).toBe(false);
  });
});

describe("getAccessToken", () => {
  it("returns null when signed out, so no Authorization header is sent", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("reads the token straight from the store, outside React", () => {
    useSessionStore.getState().setSession(session("jwt-xyz"));
    // Synchronous by design: the api interceptor cannot await a hook.
    expect(getAccessToken()).toBe("jwt-xyz");
  });
});

describe("auth actions", () => {
  it("signIn passes the credentials through", async () => {
    const a = fakeAuth();
    await signIn("a@b.c", "pw");
    expect(a.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.c", password: "pw" });
  });

  it.each([
    ["signIn", () => signIn("a@b.c", "pw")],
    ["signUp", () => signUp("a@b.c", "pw")],
    ["signOut", () => signOut()],
  ])("%s surfaces the supabase error instead of swallowing it", async (_name, action) => {
    fakeAuth(new Error("Invalid login credentials"));
    await expect(action()).rejects.toThrow("Invalid login credentials");
  });
});
