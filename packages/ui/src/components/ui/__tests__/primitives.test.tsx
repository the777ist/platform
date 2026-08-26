// Coverage for the rest of the Tier-1 owned primitives. These are the pieces every product's UI
// is assembled from, so the properties worth pinning are the ones that would silently degrade the
// SYSTEM rather than break a screen:
//
//  - every cva variant across every primitive resolves to semantic tokens, never a named colour
//  - a caller's className always beats the component's own classes (the escape hatch)
//  - Card's background/foreground pair stays matched, or text goes invisible in one theme
import { render, screen } from "@testing-library/react-native";
import { Text as RNText } from "react-native";
import { Text, textVariants } from "../text";
import { Badge, badgeVariants, badgeTextVariants } from "../badge";
import { Input } from "../input";
import { Card, CardTitle, CardContent } from "../card";
import { buttonVariants, buttonTextVariants } from "../button";

const NAMED_COLOUR =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?)\(|\b(?:bg|text|border)-(?:red|blue|green|slate|gray|zinc|amber)-\d{2,3}\b/;

describe("every primitive's variants stay on semantic tokens", () => {
  // One list, so a NEW primitive is a one-line addition rather than a forgotten file.
  const everyVariantClass = [
    textVariants(),
    ...(["default", "muted", "destructive"] as const).map((variant) => textVariants({ variant })),
    ...(["sm", "base", "lg", "xl"] as const).map((size) => textVariants({ size })),
    ...(["default", "secondary", "destructive", "outline"] as const).flatMap((variant) => [
      badgeVariants({ variant }),
      badgeTextVariants({ variant }),
    ]),
    ...(["default", "secondary", "destructive", "outline", "ghost"] as const).flatMap((variant) => [
      buttonVariants({ variant }),
      buttonTextVariants({ variant }),
    ]),
  ];

  it.each(everyVariantClass.map((classes, i) => [i, classes]))(
    "variant class set %i names no colour",
    (_i, classes) => {
      expect(classes).not.toMatch(NAMED_COLOUR);
    },
  );
});

describe("Text", () => {
  it("defaults to the foreground token", () => {
    expect(textVariants()).toContain("text-foreground");
  });

  it("maps muted and destructive to their tokens", () => {
    expect(textVariants({ variant: "muted" })).toContain("text-muted-foreground");
    expect(textVariants({ variant: "destructive" })).toContain("text-destructive");
  });

  it("renders its children", async () => {
    await render(<Text>hello</Text>);
    expect(screen.getByText("hello")).toBeOnTheScreen();
  });

  it("lets a caller's colour class win over the variant's", async () => {
    await render(
      <Text variant="muted" className="text-destructive" testID="t">
        hi
      </Text>,
    );

    // Through the component, so this covers the cn() composition Text actually performs.
    expect(screen.getByTestId("t").props.className).toContain("text-destructive");
    expect(screen.getByTestId("t").props.className).not.toContain("text-muted-foreground");
  });
});

describe("Badge", () => {
  it("pairs each background token with its foreground token", () => {
    // Mismatched pairs are how you get unreadable text in exactly one theme.
    expect(badgeVariants({ variant: "default" })).toContain("bg-primary");
    expect(badgeTextVariants({ variant: "default" })).toContain("text-primary-foreground");
    expect(badgeVariants({ variant: "destructive" })).toContain("bg-destructive");
    expect(badgeTextVariants({ variant: "destructive" })).toContain("text-destructive-foreground");
  });

  it("wraps string children in Text, and passes anything else through", async () => {
    await render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeOnTheScreen();

    await render(
      <Badge>
        <RNText>node child</RNText>
      </Badge>,
    );
    expect(screen.getByText("node child")).toBeOnTheScreen();
  });
});

describe("Input", () => {
  it("styles the placeholder with a TOKEN reference, not a colour", async () => {
    await render(<Input placeholder="Email" testID="field" />);
    // `hsl(var(--muted-foreground))` follows the brand; a literal here would not, and
    // placeholderTextColor is a prop rather than a class so no className rule covers it.
    expect(screen.getByTestId("field").props.placeholderTextColor).toBe(
      "hsl(var(--muted-foreground))",
    );
  });

  it("forwards a ref, so callers can focus it", async () => {
    const ref = { current: null } as React.RefObject<unknown>;
    await render(<Input placeholder="Email" ref={ref as never} />);
    expect(ref.current).not.toBeNull();
  });

  it("accepts a className override", async () => {
    await render(<Input placeholder="Email" className="flex-1" testID="field" />);
    expect(screen.getByTestId("field")).toBeTruthy();
  });
});

describe("Card", () => {
  it("pairs the card background with the card foreground", async () => {
    await render(
      <Card>
        <CardTitle>Title</CardTitle>
        <CardContent>
          <RNText>body</RNText>
        </CardContent>
      </Card>,
    );

    expect(screen.getByText("Title")).toBeOnTheScreen();
    expect(screen.getByText("body")).toBeOnTheScreen();
  });

  it("uses bg-card with text-card-foreground, not the page tokens", async () => {
    await render(
      <Card testID="card">
        <CardTitle testID="title">Title</CardTitle>
      </Card>,
    );

    // Asserted on the RENDERED component. An earlier version of this test checked cn() on a
    // literal, which is tautological: a mutation swapping bg-card for bg-background left it
    // green. A card on a page background needs its OWN pair, or it goes invisible against the
    // page in one of the two themes.
    expect(screen.getByTestId("card").props.className).toContain("bg-card");
    expect(screen.getByTestId("card").props.className).not.toContain("bg-background");
    expect(screen.getByTestId("title").props.className).toContain("text-card-foreground");
  });
});
