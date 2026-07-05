import figma from "@figma/code-connect";
import { Input } from "./input";

// ⚠️ OPEN / TO CONFIRM: replace the placeholder node URL once the real Figma
// Components library file key exists (filled during /bootstrap-design-system).
figma.connect(
  Input,
  "https://www.figma.com/design/FILE_KEY/Design-System?node-id=INPUT_NODE",
  {
    props: {
      placeholder: figma.string("Placeholder"),
    },
    example: ({ placeholder }) => <Input placeholder={placeholder} />,
  },
);
