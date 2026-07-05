import figma from "@figma/code-connect";
import { Badge } from "./badge";

// ⚠️ OPEN / TO CONFIRM: replace the placeholder node URL once the real Figma
// Components library file key exists (filled during /bootstrap-design-system).
figma.connect(
  Badge,
  "https://www.figma.com/design/FILE_KEY/Design-System?node-id=BADGE_NODE",
  {
    props: {
      label: figma.string("Label"),
      variant: figma.enum("Variant", {
        Default: "default",
        Secondary: "secondary",
        Destructive: "destructive",
        Outline: "outline",
      }),
    },
    example: ({ label, variant }) => <Badge variant={variant}>{label}</Badge>,
  },
);
