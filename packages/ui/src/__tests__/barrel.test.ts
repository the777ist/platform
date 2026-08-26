// BUILDOUT.md §7 lists "Barrel completeness" as a wave-0 gate and it was never built:
// "Every src/components/**/<name>.tsx is exported from src/index.ts. Trivial test, catches the
// most common omission."
//
// The omission is silent and it decays the architecture rather than breaking anything. A new
// component that is not in the barrel simply cannot be imported from `@platform/ui`, so the next
// person either deep-imports `@platform/ui/src/components/ui/thing` — which punches through the
// package boundary and pins every consumer to this package's internal layout — or copies the
// component into their product, which is precisely what promote-on-2nd-use exists to prevent.
// Neither shows up as a failure. Both are permanent.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");
const barrel = readFileSync(join(SRC, "index.ts"), "utf8");

/** Component modules a consumer is meant to import — stories, Code Connect and tests are not. */
function componentModules(): string[] {
  const dir = join(SRC, "components", "ui");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => !f.includes(".stories.") && !f.includes(".figma."))
    .map((f) => f.replace(/\.tsx$/, ""))
    .sort();
}

/** Every symbol a module exports, in either spelling the components actually use. */
function exportedSymbols(source: string): string[] {
  const inline = [
    ...source.matchAll(
      /^export\s+(?:async\s+)?(?:function|const|let|class|type|interface)\s+(\w+)/gm,
    ),
  ].map((m) => m[1] ?? "");
  // `export { badgeVariants, badgeTextVariants };` — the trailing-list form, which half the
  // components use for their cva helpers. A gate that only understood the inline form would
  // miss exactly those.
  const listed = [...source.matchAll(/^export\s*\{([^}]*)\}\s*;/gm)].flatMap((m) =>
    (m[1] ?? "")
      .split(",")
      .map((s) => s.replace(/\btype\b/, "").trim())
      .filter(Boolean),
  );
  return [...new Set([...inline, ...listed])];
}

/** Names the barrel re-exports. */
const barrelSymbols = new Set(
  [...barrel.matchAll(/export\s*\{([^}]*)\}\s*from/g)].flatMap((m) =>
    (m[1] ?? "")
      .split(",")
      .map((s) => s.replace(/\btype\b/, "").trim())
      .filter(Boolean),
  ),
);

describe("the public barrel", () => {
  it("finds the components on disk, so the checks below are not vacuous", () => {
    // If this ever reads zero modules, every assertion after it passes while checking nothing.
    const modules = componentModules();
    expect(modules.length).toBeGreaterThanOrEqual(5);
    expect(modules).toContain("button");
  });

  it.each(componentModules())("re-exports the %s module", (name) => {
    expect(barrel).toContain(`from "./components/ui/${name}"`);
  });

  it.each(componentModules())("exports every public symbol of %s", (name) => {
    const source = readFileSync(join(SRC, "components", "ui", `${name}.tsx`), "utf8");
    const symbols = exportedSymbols(source);
    expect(symbols.length).toBeGreaterThan(0);
    for (const symbol of symbols) {
      // A component whose variants helper is missing from the barrel is the same failure in
      // miniature: consumers can render it but cannot compose against its variants.
      expect(barrelSymbols).toContain(symbol);
    }
  });

  it("exports the theming surface a product needs to render anything", () => {
    // ThemeProvider and themes are what put the CSS variables on the tree. Without them in the
    // barrel a product can import components that render entirely unthemed.
    for (const symbol of ["ThemeProvider", "themes", "Theme", "cn"]) {
      expect(barrelSymbols).toContain(symbol);
    }
  });

  it("re-exports nothing from a module that no longer exists", () => {
    // The other direction: a deleted component leaves a dangling export that fails at build
    // time for every consumer, but not here, and not for whoever deleted it.
    const modules = new Set(componentModules());
    for (const [, path] of barrel.matchAll(/from "\.\/components\/ui\/([\w-]+)"/g)) {
      expect(modules).toContain(path);
    }
  });
});
