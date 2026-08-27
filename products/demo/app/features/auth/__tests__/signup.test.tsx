// Signup is a SEPARATE code path from login, not a variant of it. It is the classic place for a
// copy-paste divergence to hide: fix the email trim on one screen and forget the other, and the
// bug survives in exactly the flow a brand-new user hits first.
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { signUp } from "@platform/core";
import { SignupScreen } from "../signup";

jest.mock("@platform/core", () => ({ signUp: jest.fn() }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    useRouter: () => ({ replace: mockReplace }),
    Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

const mockSignUp = signUp as jest.MockedFunction<typeof signUp>;

/** "Sign up" labels both nothing else here, but the role query keeps this consistent with the
 *  login suite, where the heading and the button genuinely collide. */
const submitButton = () => screen.getByRole("button", { name: "Sign up" });

async function fillAndSubmit(email: string, password = "hunter2") {
  await fireEvent.changeText(screen.getByPlaceholderText("Email"), email);
  await fireEvent.changeText(screen.getByPlaceholderText("Password"), password);
  await fireEvent.press(submitButton());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue(undefined);
});

describe("SignupScreen", () => {
  it("renders the form and a route back to sign-in", async () => {
    await render(<SignupScreen />);
    expect(screen.getByText("Create account")).toBeOnTheScreen();
    expect(screen.getByText("Have an account? Sign in")).toBeOnTheScreen();
  });

  it("TRIMS the email before signing up", async () => {
    await render(<SignupScreen />);
    await fillAndSubmit("  new@example.com  ");

    // Worse here than on login: an untrimmed address would CREATE the account under a
    // value the user can never type again.
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "hunter2"));
  });

  it("navigates into the app on success", async () => {
    await render(<SignupScreen />);
    await fillAndSubmit("new@example.com");

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(tabs)"));
  });

  it("shows the failure reason and stays put", async () => {
    mockSignUp.mockRejectedValue(new Error("User already registered"));
    await render(<SignupScreen />);
    await fillAndSubmit("taken@example.com");

    expect(await screen.findByText("User already registered")).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to a readable message when the failure is not an Error", async () => {
    mockSignUp.mockRejectedValue("boom");
    await render(<SignupScreen />);
    await fillAndSubmit("new@example.com");

    expect(await screen.findByText("Sign-up failed")).toBeOnTheScreen();
  });
});
