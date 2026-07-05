import * as React from "react";
import { View } from "react-native";
import { colorScheme } from "nativewind";
import { themes, type Theme } from "./lib/theme";

export function ThemeProvider({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  React.useEffect(() => {
    colorScheme.set(theme); // toggles the `.dark` class on web
  }, [theme]);
  return (
    <View style={themes[theme]} className="bg-background flex-1">
      {children}
    </View>
  );
}
