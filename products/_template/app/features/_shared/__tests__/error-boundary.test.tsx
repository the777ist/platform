// The global error boundary is a PHILOSOPHY "Operational defaults" guarantee: the template app
// ships error UX so a render-time throw shows a recoverable screen instead of a white one. It is
// stamped byte-for-byte into every product, so a regression here ships to all of them at once.
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { ErrorBoundary } from "../error-boundary";

// A component that throws on demand, so the boundary's real catch path is exercised rather
// than simulated by poking state.
function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("kaboom");
  return <Text>all good</Text>;
}

// React logs the caught error to console.error; silence it so a PASSING test does not print a
// stack trace that reads like a failure.
let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("ErrorBoundary", () => {
  it("renders its children when nothing throws", async () => {
    await render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeOnTheScreen();
  });

  it("catches a render-time throw and shows the recovery screen, not a blank one", async () => {
    await render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeOnTheScreen();
    // The message is surfaced so the user (and a bug report) has something actionable.
    expect(screen.getByText("kaboom")).toBeOnTheScreen();
    expect(screen.getByText("Try again")).toBeOnTheScreen();
  });

  it("recovers when Try again is pressed", async () => {
    // The child stops throwing on the retry, which is what a transient failure looks like.
    let explode = true;
    function Flaky() {
      if (explode) throw new Error("transient");
      return <Text>recovered</Text>;
    }

    await render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeOnTheScreen();

    explode = false;
    await fireEvent.press(screen.getByText("Try again"));

    expect(screen.getByText("recovered")).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});
