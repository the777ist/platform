import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Card, CardTitle, CardContent } from "./card";
import { Text } from "./text";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardTitle>Card title</CardTitle>
      <CardContent>
        <Text variant="muted">Card content goes here.</Text>
      </CardContent>
    </Card>
  ),
};
