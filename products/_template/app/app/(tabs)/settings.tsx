import { View } from "react-native";
import { Button, Text } from "@platform/ui";
import { useThemeStore } from "../../features/settings/use-theme";

export default function Settings() {
  const { theme, toggle } = useThemeStore();
  return (
    <View className="flex-1 gap-4 bg-background p-4">
      <Text>Theme: {theme}</Text>
      <Button onPress={toggle}>Toggle dark mode</Button>
    </View>
  );
}
