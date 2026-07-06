import { useState } from "react";
import { View } from "react-native";
import { Link, useRouter } from "expo-router";
import { signUp } from "@platform/core";
import { Button, Card, Input, Text } from "@platform/ui";

export function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signUp(email.trim(), password);
      // With local enable_confirmations = false the session lands immediately and the
      // guard (useProtectedRoute) redirects; the explicit replace is belt-and-braces.
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="bg-background flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm gap-4 p-6">
        <Text className="text-foreground text-2xl font-semibold">Create account</Text>
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
          {busy ? "Signing up…" : "Sign up"}
        </Button>
        <Link href="/(auth)/login" className="text-primary text-center">
          Have an account? Sign in
        </Link>
      </Card>
    </View>
  );
}
