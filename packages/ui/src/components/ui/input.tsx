import * as React from "react";
import { TextInput } from "react-native";
import { cn } from "@/lib/utils";

export type InputProps = React.ComponentProps<typeof TextInput>;

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, ...props }, ref) => (
    <TextInput
      ref={ref}
      className={cn(
        "h-10 rounded-md border border-input bg-background px-3 text-base text-foreground",
        className,
      )}
      placeholderTextColor="hsl(var(--muted-foreground))"
      {...props}
    />
  ),
);
Input.displayName = "Input";
