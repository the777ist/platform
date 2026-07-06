import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { placeholder: "Type here" } };
export const WithValue: Story = { args: { defaultValue: "Hello world" } };
export const Disabled: Story = {
  args: { placeholder: "Disabled", editable: false, className: "opacity-50" },
};
