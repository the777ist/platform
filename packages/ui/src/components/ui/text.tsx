import * as React from "react";
import { Text as RNText } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const textVariants = cva("text-base text-foreground", {
  variants: {
    variant: {
      default: "",
      muted: "text-muted-foreground",
      destructive: "text-destructive",
    },
    size: {
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-xl font-semibold",
    },
  },
  defaultVariants: { variant: "default", size: "base" },
});

export type TextProps = React.ComponentProps<typeof RNText> & VariantProps<typeof textVariants>;

export function Text({ className, variant, size, ...props }: TextProps) {
  return <RNText className={cn(textVariants({ variant, size }), className)} {...props} />;
}

export { textVariants };
