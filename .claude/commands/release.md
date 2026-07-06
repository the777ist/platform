Release a product surface to PRODUCTION (trunk-based: `main` already auto-deploys staging).
Arguments: $ARGUMENTS = `<product> <surface>` — surface ∈ `api` | `app` | `desktop` | `ota`.

Tag format is EXACT (`<product>-<surface>-v*`); the workflows parse the product token from it:

```bash
# api    → deploy-api.yml     → flyctl deploy -c fly.production.toml
git tag <product>-api-v1.2.0     && git push origin <product>-api-v1.2.0
# app    → eas-build.yml      → store build (native changes only)
git tag <product>-app-v1.2.0     && git push origin <product>-app-v1.2.0
# ota    → eas-update.yml     → eas update --channel production (JS-only changes)
git tag <product>-ota-v1.2.0     && git push origin <product>-ota-v1.2.0
# desktop → electron-release.yml → 3-OS matrix, publishes to <org>/<product>-desktop-releases
#           (tag MUST match desktop/package.json "version")
git tag <product>-desktop-v1.2.0 && git push origin <product>-desktop-v1.2.0
```

Mobile rule: OTA for JS-only changes; a store build only when native deps/config changed.
