import { View } from "react-native";
import { signOut, useSession } from "@platform/core";
import { Button, Text } from "@platform/ui";
import { AvatarUploader } from "../../features/settings/avatar-uploader";
import { useThemeStore } from "../../features/settings/use-theme";

export default function Settings() {
  const { theme, toggle } = useThemeStore();
  const { user } = useSession();
  return (
    <View className="flex-1 gap-6 bg-background p-4">
      <View className="gap-4">
        <Text>Theme: {theme}</Text>
        <Button onPress={toggle}>Toggle dark mode</Button>
      </View>
      <AvatarUploader />
      <View className="gap-3">
        {user ? <Text className="text-muted-foreground">{user.email}</Text> : null}
        <Button variant="outline" onPress={() => void signOut()}>
          Sign out
        </Button>
      </View>
    </View>
  );
}
