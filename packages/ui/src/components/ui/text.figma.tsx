import figma from "@figma/code-connect";
import { Text } from "./text";

// ⚠️ OPEN / TO CONFIRM: replace the placeholder node URL once the real Figma
// Components library file key exists (filled during /bootstrap-design-system).
figma.connect(
  Text,
  "https://www.figma.com/design/FILE_KEY/Design-System?node-id=TEXT_NODE",
  {
    props: {
      label: figma.string("Label"),
      variant: figma.enum("Variant", {
        Default: "default",
        Muted: "muted",
        Destructive: "destructive",
      }),
      size: figma.enum("Size", { sm: "sm", base: "base", lg: "lg", xl: "xl" }),
    },
    example: ({ label, variant, size }) => (
      <Text variant={variant} size={size}>
        {label}
      </Text>
    ),
  },
);
