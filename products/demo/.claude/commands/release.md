Release THIS product's surface to production. Argument: $ARGUMENTS (surface: api | app |
ota | desktop). Staging is already automatic on merge to main.

```bash
git tag demo-$ARGUMENTS-v<semver> && git push origin demo-$ARGUMENTS-v<semver>
```

- `api` → Fly production deploy (migrations run as release_command)
- `app` → EAS store build (ONLY for native changes)
- `ota` → EAS Update to the production channel (JS-only changes)
- `desktop` → 3-OS electron-builder publish to `the777incident/demo-desktop-releases`
  (tag version MUST match `desktop/package.json` "version")
