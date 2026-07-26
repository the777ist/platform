import { create } from "zustand";
import type { Theme } from "@sevenfold/ui";

type ThemeState = { theme: Theme; toggle: () => void };
export const useThemeStore = create<ThemeState>((set) => ({
  theme: "light",
  toggle: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
}));
