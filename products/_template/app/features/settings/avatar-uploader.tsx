import { useState } from "react";
import { Image, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadAvatar, useSession } from "@the777incident/core";
import { Button, Text } from "@the777incident/ui";

export function AvatarUploader() {
  const { user } = useSession();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick() {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      // MediaTypeOptions is deprecated in current expo-image-picker; MediaType array form.
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await uploadAvatar(user.id, {
        uri: asset.uri,
        mimeType: asset.mimeType,
        name: asset.fileName ?? "avatar.jpg",
      });
      setUrl(url); // render it back from Storage
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3">
      <Text className="text-foreground text-lg font-medium">Avatar</Text>
      {url ? (
        <Image source={{ uri: url }} className="h-24 w-24 rounded-full" />
      ) : (
        <View className="bg-muted h-24 w-24 rounded-full" />
      )}
      {error ? <Text className="text-destructive">{error}</Text> : null}
      <Button onPress={onPick} disabled={busy}>
        {busy ? "Uploading…" : "Upload avatar"}
      </Button>
    </View>
  );
}
