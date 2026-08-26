// Tier-1 owned primitives are the contract every product's UI is built from, so their variant
// maps are API, not styling detail. Two properties matter beyond "it renders":
//
//  - every variant resolves to SEMANTIC tokens (bg-primary, text-foreground …). A raw colour here
//    would silently opt that variant out of the whole brand mechanism.
//  - a caller's className BEATS the variant's own classes. Without that, product-local overrides
//    would depend on stylesheet order.
import { render, screen } from "@testing-library/react-native";
import { Text as RNText } from "react-native";
import { Button, buttonVariants, buttonTextVariants } from "../button";
import { cn } from "../../../lib/utils";

describe("buttonVariants", () => {
  it("defaults to the primary token, not a colour", () => {
    expect(buttonVariants()).toContain("bg-primary");
  });

  it.each([
    ["default", "bg-primary"],
    ["secondary", "bg-secondary"],
    ["destructive", "bg-destructive"],
    ["outline", "bg-background"],
    ["ghost", "bg-transparent"],
  ])("maps variant %s to %s", (variant, expected) => {
    expect(buttonVariants({ variant: variant as never })).toContain(expected);
  });

  it.each([
    ["sm", "h-9"],
    ["default", "h-10"],
    ["lg", "h-11"],
  ])("maps size %s to %s", (size, expected) => {
    expect(buttonVariants({ size: size as never })).toContain(expected);
  });

  it("pairs each variant with a readable foreground token", () => {
    // A background token without its matching foreground is how you get invisible text in
    // one theme and not the other.
    expect(buttonTextVariants({ variant: "default" })).toContain("text-primary-foreground");
    expect(buttonTextVariants({ variant: "destructive" })).toContain("text-destructive-foreground");
    expect(buttonTextVariants({ variant: "outline" })).toContain("text-foreground");
  });

  it("names NO raw colours in any variant", () => {
    const every = [
      buttonVariants(),
      ...(["default", "secondary", "destructive", "outline", "ghost"] as const).map((variant) =>
        [buttonVariants({ variant }), buttonTextVariants({ variant })].join(" "),
      ),
    ].join(" ");

    expect(every).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(every).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });
});

describe("Button", () => {
  it("wraps string children in Text so callers do not have to", async () => {
    await render(<Button>Save</Button>);
    expect(screen.getByText("Save")).toBeOnTheScreen();
  });

  it("passes non-string children through untouched", async () => {
    await render(
      <Button>
        <RNText>Custom child</RNText>
      </Button>,
    );
    expect(screen.getByText("Custom child")).toBeOnTheScreen();
  });

  it("exposes the button role, which is how tests and screen readers find it", async () => {
    await render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("lets a caller's className BEAT the variant's own class", () => {
    // cn() resolves the conflict; without it both classes ship and order decides.
    // Mirrors how Button composes cva output with the caller's className.
    expect(cn(buttonVariants({ variant: "default" }), "bg-destructive")).toContain(
      "bg-destructive",
    );
    expect(cn(buttonVariants({ variant: "default" }), "bg-destructive")).not.toContain(
      "bg-primary",
    );
  });
});
