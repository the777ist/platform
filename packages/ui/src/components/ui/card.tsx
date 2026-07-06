import * as React from "react";
import { View } from "react-native";
import { cn } from "../../lib/utils";
import { Text } from "./text";

export function Card({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View className={cn("border-border bg-card rounded-lg border p-4", className)} {...props} />
  );
}
export function CardTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn("text-card-foreground text-lg font-semibold", className)} {...props} />
  );
}
export function CardContent({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("pt-2", className)} {...props} />;
}
