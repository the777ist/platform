Scaffold a product feature end-to-end. Argument: $ARGUMENTS (feature name, kebab-case).

Backend first — follow the api recipe VERBATIM (api/CLAUDE.md):
`model → service → schema → router → openapi → typegen`.

Then the frontend slice:

1. `app/features/$ARGUMENTS/` — screens + logic (compositions in
   `app/features/$ARGUMENTS/components/`; promote to `packages/ui` on 2nd use).
2. Wire data via the GENERATED TanStack hooks from `@the777incident/template-api-client`.
3. Route files in `app/app/` stay thin one-liners re-exporting from the feature.
4. Realtime (if mutations should fan out): broadcast in the service after commit +
   subscribe via `subscribeAndInvalidate` (see `features/home/use-items-realtime.ts`).
5. Tests: RNTL beside the source (`__tests__/`), pytest for the api layer.
