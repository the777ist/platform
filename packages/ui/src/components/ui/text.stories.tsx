import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text } from "./text";

const meta: Meta<typeof Text> = {
  title: "UI/Text",
  component: Text,
  args: { children: "The quick brown fox" },
};
export default meta;
type Story = StoryObj<typeof Text>;

export const Default: Story = { args: { variant: "default" } };
export const Muted: Story = { args: { variant: "muted" } };
export const Destructive: Story = { args: { variant: "destructive" } };
export const Small: Story = { args: { size: "sm" } };
export const Base: Story = { args: { size: "base" } };
export const Large: Story = { args: { size: "lg" } };
export const ExtraLarge: Story = { args: { size: "xl" } };
