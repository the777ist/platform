// The login screen is the one place a user meets an auth failure, so its error path matters as
// much as its happy path: a swallowed error looks like a button that does nothing. It also trims
// the email before submitting — a trailing space pasted from a password manager would otherwise
// produce "invalid credentials" against an account that exists.
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { signIn } from "@platform/core";
import { LoginScreen } from "../login";

jest.mock("@platform/core", () => ({ signIn: jest.fn() }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    useRouter: () => ({ replace: mockReplace }),
    // Link renders its children as text so the test can assert the sign-up affordance exists.
    Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue(undefined);
});

async function fillAndSubmit(email: string, password = "hunter2") {
  await fireEvent.changeText(screen.getByPlaceholderText("Email"), email);
  await fireEvent.changeText(screen.getByPlaceholderText("Password"), password);
  await fireEvent.press(submitButton());
}

/** The heading and the submit control share the label "Sign in", so a text query is ambiguous —
 *  the role is what distinguishes the thing you can actually press. */
function submitButton() {
  return screen.getByRole("button", { name: "Sign in" });
}

describe("LoginScreen", () => {
  it("renders the form and a route to sign up", async () => {
    await render(<LoginScreen />);
    expect(screen.getByPlaceholderText("Email")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("Password")).toBeOnTheScreen();
    expect(screen.getByText("No account? Sign up")).toBeOnTheScreen();
  });

  it("TRIMS the email before signing in", async () => {
    await render(<LoginScreen />);
    await fillAndSubmit("  user@example.com  ");

    // Untrimmed, this is a login failure against an account that exists — and one of the
    // most confusing failures a user can hit, because the address looks correct.
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "hunter2"));
  });

  it("navigates into the app on success", async () => {
    await render(<LoginScreen />);
    await fillAndSubmit("user@example.com");

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(tabs)"));
  });

  it("shows the failure reason instead of silently doing nothing", async () => {
    mockSignIn.mockRejectedValue(new Error("Invalid login credentials"));
    await render(<LoginScreen />);
    await fillAndSubmit("user@example.com");

    expect(await screen.findByText("Invalid login credentials")).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to a readable message when the failure is not an Error", async () => {
    mockSignIn.mockRejectedValue("network blip");
    await render(<LoginScreen />);
    await fillAndSubmit("user@example.com");

    expect(await screen.findByText("Sign-in failed")).toBeOnTheScreen();
  });

  it("clears a previous error when the user retries", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Invalid login credentials"));
    await render(<LoginScreen />);
    await fillAndSubmit("user@example.com");
    expect(await screen.findByText("Invalid login credentials")).toBeOnTheScreen();

    mockSignIn.mockResolvedValue(undefined);
    await fireEvent.press(submitButton());

    // A stale error left on screen after a successful retry reads as a failure.
    await waitFor(() => expect(screen.queryByText("Invalid login credentials")).toBeNull());
  });
});
