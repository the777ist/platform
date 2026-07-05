import figma from "@figma/code-connect";
import { Card, CardTitle, CardContent } from "./card";
import { Text } from "./text";

// ⚠️ OPEN / TO CONFIRM: replace the placeholder node URL once the real Figma
// Components library file key exists (filled during /bootstrap-design-system).
figma.connect(Card, "https://www.figma.com/design/FILE_KEY/Design-System?node-id=CARD_NODE", {
  props: {
    title: figma.string("Title"),
    body: figma.string("Body"),
  },
  example: ({ title, body }) => (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardContent>
        <Text variant="muted">{body}</Text>
      </CardContent>
    </Card>
  ),
});
