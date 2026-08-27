// ThemeProvider is where the entire token system becomes real at runtime: it is the one place
// that turns `theme="dark"` into actual CSS variables on the tree, and the one place that tells
// NativeWind to flip the `.dark` class on web. Both halves fail SILENTLY and asymmetrically —
// drop the vars and native loses its theme while web keeps working off global.css; drop the
// colorScheme call and native looks perfect while web dark mode never engages. Neither throws,
// and neither shows up in a screenshot of the platform you happened to check.
//
// `vars` is mocked to identity so the resolved token map is inspectable; `colorScheme.set` is a
// spy because its effect (a class on document) has no representation in a native test tree.
// Jest hoists jest.mock() above everything, so the factory must be prefixed `mock` to reference
// this at all — and must call it LAZILY rather than capture it. Reading `mockSetColorScheme` as
// the value of `set` binds whatever it holds when the module graph resolves, which is before the
// const below has run: the mock then exposes `set: undefined` and the provider throws.
const mockSetColorScheme = jest.fn();
jest.mock("nativewind", () => ({
  vars: (tokens: Record<string, string>) => tokens,
  colorScheme: { set: (scheme: string) => mockSetColorScheme(scheme) },
}));

import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ThemeProvider } from "../theme-provider";

const styleFor = async (theme: "light" | "dark") => {
  mockSetColorScheme.mockClear();
  await render(
    <ThemeProvider theme={theme}>
      <Text>content</Text>
    </ThemeProvider>,
  );
  return screen.toJSON() as unknown as { props: { style: Record<string, string> } };
};

describe("ThemeProvider", () => {
  it("renders its children", async () => {
    await styleFor("light");
    expect(screen.getByText("content")).toBeOnTheScreen();
  });

  it("puts the theme's CSS variables on the tree", async () => {
    const tree = await styleFor("light");
    // Through the rendered component, not by reading `themes` — the question is whether the
    // vars actually reach the view, which is the only thing children can inherit from.
    expect(tree.props.style).toHaveProperty("--background");
    expect(tree.props.style).toHaveProperty("--foreground");
  });

  it("selects the theme it was given, rather than a fixed one", async () => {
    const light = (await styleFor("light")).props.style;
    const dark = (await styleFor("dark")).props.style;

    // Compares the two modes against EACH OTHER instead of against literal token values: a
    // rebrand is allowed to change every value in here, but light and dark must never resolve
    // to the same thing. Hardcoding `themes.light` in the component passes any single-theme
    // assertion and fails this one.
    expect(light["--background"]).not.toBe(dark["--background"]);
    expect(light["--foreground"]).not.toBe(dark["--foreground"]);
  });

  it("tells NativeWind which scheme is active, so web's .dark class follows", async () => {
    await styleFor("dark");
    // The argument matters, not just the call: `colorScheme.set("light")` on a dark theme is
    // the exact bug this catches, and it is invisible on native.
    expect(mockSetColorScheme).toHaveBeenCalledWith("dark");

    await styleFor("light");
    expect(mockSetColorScheme).toHaveBeenCalledWith("light");
  });

  it("fills the screen and paints the background token", async () => {
    // A provider that does not stretch leaves the OS background showing through under the
    // content — visible only on device, and only in dark mode.
    const tree = await styleFor("light");
    expect((tree.props as { className?: string }).className).toContain("flex-1");
    expect((tree.props as { className?: string }).className).toContain("bg-background");
  });
});
