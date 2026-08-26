// These two numbers are the app's offline story, not arbitrary defaults. gcTime governs how long
// a cached page survives for the persister to restore, so shrinking it to TanStack's 5-minute
// default silently turns "a reload paints instantly from cache" into "every reload spins" — with
// no error and nothing to see in review. staleTime is what stops a refetch storm on every remount.
// jest-expo resolves the NATIVE persister (persist.native.ts), which imports AsyncStorage — and
// the native module is null under jest. The library ships an official jest mock for exactly this.
jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import { makeQueryClient, persister } from "../query";

describe("makeQueryClient", () => {
  it("keeps cached data for a DAY, which is what the persister restores from", () => {
    const defaults = makeQueryClient().getDefaultOptions().queries;
    expect(defaults?.gcTime).toBe(1000 * 60 * 60 * 24);
  });

  it("treats data as fresh for 30s so a remount does not refetch immediately", () => {
    const defaults = makeQueryClient().getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(30_000);
  });

  it("returns a NEW client per call", () => {
    // Sharing one client across tests or across a server render leaks state between them.
    expect(makeQueryClient()).not.toBe(makeQueryClient());
  });
});

describe("persister", () => {
  it("is re-exported so app code has a single import site", () => {
    // The platform-correct implementation is picked by Metro (persist.web / persist.native);
    // app code must never reach for either directly.
    expect(persister).toBeDefined();
    expect(typeof persister.persistClient).toBe("function");
    expect(typeof persister.restoreClient).toBe("function");
  });
});
