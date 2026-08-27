// Small store, real contract: the theme toggle is what drives the light/dark CSS-var set, so
// "starts light" and "toggle actually alternates" are the two things every product depends on.
// A toggle that only ever set "dark" would look correct on the first press and be stuck after.
import { useThemeStore } from "../use-theme";

beforeEach(() => useThemeStore.setState({ theme: "light" }));

describe("useThemeStore", () => {
  it("starts in light", () => {
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("ALTERNATES rather than setting one value", () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("dark");

    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("round-trips over repeated toggles", () => {
    const seen = [1, 2, 3, 4].map(() => {
      useThemeStore.getState().toggle();
      return useThemeStore.getState().theme;
    });
    expect(seen).toEqual(["dark", "light", "dark", "light"]);
  });
});
