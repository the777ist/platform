import { useState } from "react";
import { View } from "react-native";
import { Link, useRouter } from "expo-router";
import { signIn } from "@platform/core";
import { Button, Card, Input, Text } from "@platform/ui";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      // the guard (useProtectedRoute) handles the redirect once the session lands;
      // an explicit replace is a harmless belt-and-braces.
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="bg-background flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm gap-4 p-6">
        <Text className="text-foreground text-2xl font-semibold">Sign in</Text>
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <Text className="text-destructive">{error}</Text> : null}
        <Button onPress={onSubmit} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <Link href="/(auth)/signup" className="text-primary text-center">
          No account? Sign up
        </Link>
      </Card>
    </View>
  );
}
