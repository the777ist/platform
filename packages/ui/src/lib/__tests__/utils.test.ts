// `cn` is the mechanism that makes every component's `className` prop actually override the
// component's own styling. It is one line, and it is load-bearing: without tailwind-merge's
// conflict resolution, `<Button className="bg-destructive">` would emit BOTH `bg-primary` and
// `bg-destructive`, and which one wins would depend on stylesheet order rather than on intent.
import { cn } from "../utils";

describe("cn", () => {
  it("lets a later utility WIN over an earlier conflicting one", () => {
    // This is the whole point: a caller's className must beat the component's default.
    expect(cn("bg-primary", "bg-destructive")).toBe("bg-destructive");
    expect(cn("px-4", "px-6")).toBe("px-6");
  });

  it("keeps utilities that do not conflict", () => {
    expect(cn("flex-row", "items-center")).toBe("flex-row items-center");
  });

  it("drops falsy values so conditional classNames stay readable", () => {
    expect(cn("bg-primary", false, null, undefined, "")).toBe("bg-primary");
  });

  it("accepts the conditional shapes clsx supports", () => {
    expect(cn(["flex-1", "p-4"])).toBe("flex-1 p-4");
    expect(cn({ "bg-primary": true, "bg-muted": false })).toBe("bg-primary");
  });

  it("resolves a conflict across argument shapes, not just within one", () => {
    // A component composes cva output with the caller's className — different arguments.
    expect(cn(["rounded-md", "bg-primary"], { "bg-secondary": true })).toBe(
      "rounded-md bg-secondary",
    );
  });
});
