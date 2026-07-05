import type { StorybookConfig } from "@storybook/react-native-web-vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-native-web-vite",
    options: {
      pluginReactOptions: {
        jsxRuntime: "automatic",
        jsxImportSource: "nativewind",
      },
    },
  },
  stories: ["../src/**/*.stories.tsx"],
  addons: [],
  // react-native -> react-native-web aliasing is handled by the framework's bundled
  // vite-plugin-rnw — do NOT add a manual alias. Package-internal imports are RELATIVE
  // (a source-consumed package cannot use an @/ alias — downstream app tsc/metro would
  // not resolve it), so no path alias is needed here either.
  // The Tailwind v3 pipeline on global.css runs via PostCSS — postcss.config.js
  // (tailwindcss + autoprefixer) is picked up automatically by Vite; global.css is
  // imported in preview.tsx so NativeWind utilities resolve.
  viteFinal: async (cfg) => {
    // nativewind eagerly re-exports verifyInstallation from its CJS doctor chain
    // (nativewind/dist/doctor.js -> react-native-css-interop/dist/doctor*.js). The
    // framework's RN transform pipeline leaves those pure-CJS files unconverted in the
    // PRODUCTION rollup pass, so the static build dies at runtime with
    // "ReferenceError: exports is not defined" (dev is fine — Vite's dep optimizer
    // converts CJS on the fly). This targeted plugin ESM-wraps exactly those files.
    cfg.plugins = cfg.plugins ?? [];
    cfg.plugins.push({
      name: "fix-css-interop-doctor-cjs",
      transform(code: string, id: string) {
        const isDoctor =
          /(react-native-css-interop|nativewind)[\\/]dist[\\/]doctor(\.native)?\.js/.test(
            id,
          );
        if (
          !isDoctor ||
          !/(^|\n)\s*exports\./.test(code) ||
          code.includes("export ")
        ) {
          return null;
        }
        const names = [...code.matchAll(/exports\.(\w+)\s*=/g)]
          .map((m) => m[1])
          .filter((n) => n !== "__esModule");
        const unique = [...new Set(names)];
        // Aliased bindings — the file may declare a local of the same name
        // (e.g. `function verifyInstallation` + `exports.verifyInstallation = ...`).
        const bindings = unique
          .map((n) => `const __cjs_${n} = exports.${n};`)
          .join("\n");
        const reexports = unique.map((n) => `__cjs_${n} as ${n}`).join(", ");
        // Hoist static require("x") calls into ESM imports + a local require shim
        // (once this file is ESM-ified the commonjs plugin no longer converts them).
        const reqIds = [
          ...new Set(
            [...code.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]),
          ),
        ];
        const imports = reqIds
          .map((r, i) => `import * as __req_${i} from "${r}";`)
          .join("\n");
        const requireShim = reqIds.length
          ? `const require = (id) => {\n${reqIds
              .map((r, i) => `  if (id === "${r}") return __req_${i};`)
              .join("\n")}\n  throw new Error("unresolved require: " + id);\n};`
          : "";
        return {
          code:
            `${imports}\nconst exports = {}; const module = { exports };\n${requireShim}\n${code}\n` +
            `${bindings}\nexport { ${reexports} };\nexport default exports;\n`,
          map: null,
        };
      },
    });
    return cfg;
  },
};
export default config;
