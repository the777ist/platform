// Key ruling #6: hoisted pnpm linker => metro must watch the workspace root and walk BOTH
// node_modules (project, workspace). Never set disableHierarchicalLookups.
// Sentry FIRST (getSentryExpoConfig wraps expo's getDefaultConfig and adds the Sentry
// serializer for source maps), THEN the monorepo wiring, THEN wrap with NativeWind.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../../..");

const config = getSentryExpoConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./global.css" });
