// TYPE surface for tsc + web bundlers: TypeScript does not resolve the .web/.native
// platform extensions, so the bare module re-exports the web persister. Metro/Expo
// resolve persist.native.ts / persist.web.ts AHEAD of this file per platform.
export { persister } from "./persist.web";
