// Cross-platform copy of the exported Expo web build into the desktop renderer dir.
// Run as part of `build` (after ^export:web has produced ../app/dist via turbo).
import { cp, rm, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(here, "..");
const SRC = path.join(desktopDir, "..", "app", "dist"); // products/_template/app/dist
const DEST = path.join(desktopDir, "renderer"); // products/_template/desktop/renderer

async function main() {
  try {
    await access(path.join(SRC, "index.html"), constants.F_OK);
  } catch {
    console.error(
      `[copy-renderer] Missing ${path.join(SRC, "index.html")}.\n` +
        `Run the web export first: turbo run export:web --filter=*template-app ` +
        `(turbo's ^export:web edge does this automatically via the workspace devDependency).`,
    );
    process.exit(1);
  }

  await rm(DEST, { recursive: true, force: true }); // clean stale assets/hashes
  await cp(SRC, DEST, { recursive: true });
  console.log(`[copy-renderer] copied ${SRC} -> ${DEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
