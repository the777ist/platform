import { contextBridge, ipcRenderer } from "electron";

// Minimal, explicit, safe surface. Expose ONLY what the SPA needs — never the raw
// ipcRenderer or Node APIs. Today the renderer is the unmodified Expo web bundle, so
// this is deliberately tiny; grow it deliberately, one method at a time.
const api = {
  /** Identifies the runtime so the shared UI can branch (e.g. "desktop" vs "web"). */
  platform: "desktop" as const,
  /** App version, surfaced read-only for an About/settings line. */
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
};

export type DesktopBridge = typeof api;

contextBridge.exposeInMainWorld("desktop", api);
