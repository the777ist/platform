import * as React from "react";
import { TextInput } from "react-native";
import { cn } from "../../lib/utils";

export type InputProps = React.ComponentProps<typeof TextInput>;

export const Input = React.forwardRef<TextInput, InputProps>(({ className, ...props }, ref) => (
  <TextInput
    ref={ref}
    className={cn(
      "border-input bg-background text-foreground h-10 rounded-md border px-3 text-base",
      className,
    )}
    placeholderTextColor="hsl(var(--muted-foreground))"
    {...props}
  />
));
Input.displayName = "Input";
