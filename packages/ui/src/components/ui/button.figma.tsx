import figma from "@figma/code-connect";
import { Button } from "./button";

// ⚠️ OPEN / TO CONFIRM: replace the placeholder node URL once the real Figma
// Components library file key exists (filled during /bootstrap-design-system).
figma.connect(Button, "https://www.figma.com/design/FILE_KEY/Design-System?node-id=BUTTON_NODE", {
  props: {
    label: figma.string("Label"),
    variant: figma.enum("Variant", {
      Default: "default",
      Secondary: "secondary",
      Destructive: "destructive",
      Outline: "outline",
      Ghost: "ghost",
    }),
    size: figma.enum("Size", { sm: "sm", default: "default", lg: "lg" }),
  },
  example: ({ label, variant, size }) => (
    <Button variant={variant} size={size}>
      {label}
    </Button>
  ),
});
