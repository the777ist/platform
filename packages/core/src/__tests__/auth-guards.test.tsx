// The route guards are the CLIENT half of the authorization boundary, and auth.test.ts says so
// out loud: "expo-router is only used by the route-guard hook, which these tests do not render."
// That comment stood while the hooks that decide whether an unauthenticated user sees a
// protected screen went unasserted.
//
// Three properties, each of which fails in a different direction:
//
//   the `loading` gate    without it every cold start bounces to login before the session
//                         hydrates — and the obvious "fix" for that flicker is to weaken the
//                         guard itself
//   redirect OUT          no session outside the auth group must go to login, or protected
//                         screens render for a signed-out user
//   redirect IN           a signed-in user sitting on the login screen must be moved along, or
//                         they are stuck staring at a form they have already completed
import { renderHook } from "@testing-library/react-native";
import { useRouter, useSegments } from "expo-router";

import { useProtectedRoute, useRequireAuth, useSessionStore } from "../auth";

jest.mock("../supabase", () => ({ getSupabase: jest.fn(), supabase: {} }));
jest.mock("expo-router", () => ({ useRouter: jest.fn(), useSegments: jest.fn() }));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseSegments = useSegments as jest.MockedFunction<typeof useSegments>;

const replace = jest.fn();
const session = { access_token: "t", user: { id: "u1", email: "a@b.c" } } as never;

/** Put the store and the router in a given state, then render the guard. */
async function guard(
  hook: () => unknown,
  { signedIn, loading, segment }: { signedIn: boolean; loading: boolean; segment: string },
) {
  useSessionStore.setState({
    session: signedIn ? session : null,
    user: signedIn ? { id: "u1" } : null,
    loading,
  } as never);
  mockUseSegments.mockReturnValue([segment] as never);
  await renderHook(hook);
}

beforeEach(() => {
  jest.clearAllMocks();
  replace.mockClear();
  mockUseRouter.mockReturnValue({ replace } as never);
});

describe("useProtectedRoute", () => {
  it("does NOT redirect while the session is still loading", async () => {
    // The flicker gate. Without it, a cold start throws every user at the login screen for a
    // frame before their stored session hydrates.
    await guard(useProtectedRoute, { signedIn: false, loading: true, segment: "(tabs)" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-OUT user on a protected route to login", async () => {
    await guard(useProtectedRoute, { signedIn: false, loading: false, segment: "(tabs)" });
    expect(replace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("leaves a signed-out user alone while they are IN the auth group", async () => {
    // Redirecting to login from login is an infinite loop, not a guard.
    await guard(useProtectedRoute, { signedIn: false, loading: false, segment: "(auth)" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("moves a signed-IN user off the auth group", async () => {
    await guard(useProtectedRoute, { signedIn: true, loading: false, segment: "(auth)" });
    expect(replace).toHaveBeenCalledWith("/(tabs)");
  });

  it("leaves a signed-in user on a protected route alone", async () => {
    // The common case: no redirect on every render of every screen.
    await guard(useProtectedRoute, { signedIn: true, loading: false, segment: "(tabs)" });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("useRequireAuth", () => {
  it("does NOT redirect while loading", async () => {
    await guard(useRequireAuth, { signedIn: false, loading: true, segment: "settings" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out user to login", async () => {
    await guard(useRequireAuth, { signedIn: false, loading: false, segment: "settings" });
    expect(replace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("leaves a signed-in user in place", async () => {
    await guard(useRequireAuth, { signedIn: true, loading: false, segment: "settings" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("returns the session so a screen can render without reading the store itself", async () => {
    // Two sources of truth for "who is signed in" is how a screen ends up showing one user's
    // chrome around another user's data.
    useSessionStore.setState({ session, user: { id: "u1" }, loading: false } as never);
    mockUseSegments.mockReturnValue(["settings"] as never);
    const { result } = await renderHook(() => useRequireAuth());
    expect(result.current.session).toBe(session);
    expect(result.current.loading).toBe(false);
  });
});
