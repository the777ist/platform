// commitlint.config.mjs — Conventional Commits, enforced at the commit-msg tier (lefthook.yml).
// The repo already writes this style; this stops it drifting, and keeps `<type>(<scope>):` parseable
// for any future changelog automation.
//
// Merge commits are ignored by commitlint's built-in defaults, so `git merge` and PR merges pass.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Deliberate deviation from the 100-char default: this repo writes long, specific subjects
    // ("docs: close the local first-run gaps — .env.example local ports, migrate+seed quickstart,
    // stamped port offsets" is 110), and a limit that rejects the house style is a limit that
    // teaches people to pass --no-verify.
    "header-max-length": [2, "always", 120],
    // Bodies routinely carry pasted paths, URLs and command output; hard-wrapping them adds
    // nothing a reader wants. The header is the part that has to stay scannable.
    "body-max-line-length": [0, "always", Infinity],
    "footer-max-line-length": [0, "always", Infinity],
  },
};
