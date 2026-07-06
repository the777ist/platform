import { render, screen, fireEvent } from "@testing-library/react-native";
import { Button } from "../button";

// RNTL v14: render/fireEvent return Promises — always await (React 19 test renderer).
describe("Button", () => {
  it("renders its label", async () => {
    await render(<Button>Press me</Button>);
    expect(screen.getByText("Press me")).toBeOnTheScreen();
  });

  it("fires onPress", async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Tap</Button>);
    await fireEvent.press(screen.getByText("Tap"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
