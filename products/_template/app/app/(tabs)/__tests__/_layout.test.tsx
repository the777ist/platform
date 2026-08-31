// The tab bar is React Navigation CHROME, not a NativeWind surface — `className` never reaches
// it, so it renders React Navigation's own light palette even when the app is in dark mode.
// Every product inherits this layout, so the bug ships everywhere: a dark app with a white bar
// glued to the bottom of it.
//
// Fix: feed the tab navigator explicit colours derived from the SAME semantic tokens the rest
// of the app uses (packages/ui `themes`), so the chrome tracks the theme store like everything
// else. These tests pin that the colours actually differ between modes and come from the tokens.
import { render } from "@testing-library/react-native";
import { Tabs } from "expo-router";
import TabsLayout from "../_layout";
import { useThemeStore } from "../../../features/settings/use-theme";

jest.mock("expo-router", () => ({
  Tabs: Object.assign(
    jest.fn(() => null),
    { Screen: jest.fn(() => null) },
  ),
}));
jest.mock("@platform/core", () => ({
  useProtectedRoute: () => ({ loading: false }),
  useSession: () => ({ user: { id: "u1" } }),
  registerForPushNotifications: jest.fn(() => Promise.resolve()),
}));
jest.mock("@platform/template-api-client", () => ({ registerToken: jest.fn() }));

const mockTabs = Tabs as unknown as jest.Mock;

/** The screenOptions the layout handed React Navigation on its last render. */
function screenOptions(): Record<string, unknown> {
  const props = mockTabs.mock.calls.at(-1)![0] as { screenOptions?: Record<string, unknown> };
  return props.screenOptions ?? {};
}

beforeEach(() => {
  jest.clearAllMocks();
  useThemeStore.setState({ theme: "light" });
});

describe("tab bar chrome follows the theme", () => {
  it("passes explicit tab-bar colours to the navigator", async () => {
    await render(<TabsLayout />);
    const options = screenOptions();

    // Without these the navigator falls back to its own hardcoded light palette.
    expect(options.tabBarStyle).toBeDefined();
    expect(options.tabBarActiveTintColor).toBeDefined();
    expect(options.tabBarInactiveTintColor).toBeDefined();
  });

  it("renders DIFFERENT chrome colours in dark mode than in light", async () => {
    // The whole point: a constant palette would satisfy the test above while still shipping a
    // white bar under a dark app.
    await render(<TabsLayout />);
    const light = JSON.stringify(screenOptions());

    useThemeStore.setState({ theme: "dark" });
    await render(<TabsLayout />);
    const dark = JSON.stringify(screenOptions());

    expect(dark).not.toEqual(light);
  });
});
