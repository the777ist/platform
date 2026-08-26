// The renderer's security posture, kept out of main.ts so it can be asserted.
//
// These three flags are the whole reason a compromised or malicious page inside the shell cannot
// reach the user's machine. Flipping any one of them is a one-word edit that changes nothing
// visible, breaks no test, and hands the renderer Node.

/** webPreferences that must hold for every window this app opens. */
export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true, // renderer cannot touch Node directly
  nodeIntegration: false, // no Node in the SPA
  sandbox: true,
} as const;

/**
 * What to do when the page asks to open `url` in a new window.
 *
 * http/https go to the OS browser and are DENIED in-app — a link that opens inside the shell
 * looks like part of the application, which is exactly what makes it useful for phishing.
 * `app:` is our own bundle and may open normally. Everything else is denied: "allow" here means
 * "open an arbitrary URL inside the Electron shell", which is not a sensible default for a
 * scheme nobody has thought about (file:, javascript:, and whatever a future OS registers).
 */
export function windowOpenDecision(url: string): { action: "deny" | "allow"; external: boolean } {
  if (url.startsWith("http:") || url.startsWith("https:")) {
    return { action: "deny", external: true };
  }
  if (url.startsWith("app:")) return { action: "allow", external: false };
  return { action: "deny", external: false };
}
