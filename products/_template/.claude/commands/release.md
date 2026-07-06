Release THIS product's surface to production. Argument: $ARGUMENTS (surface: api | app |
ota | desktop). Staging is already automatic on merge to main.

```bash
git tag template-$ARGUMENTS-v<semver> && git push origin template-$ARGUMENTS-v<semver>
```

- `api` → Fly production deploy (migrations run as release_command)
- `app` → EAS store build (ONLY for native changes)
- `ota` → EAS Update to the production channel (JS-only changes)
- `desktop` → 3-OS electron-builder publish to `<org>/template-desktop-releases`
  (tag version MUST match `desktop/package.json` "version")
