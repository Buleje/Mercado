import type { Meta, StoryObj } from "@storybook/react";
import { Check, Crown, Shield, ShoppingBag } from "lucide-react";
import { IconBadge } from "./IconBadge";

const meta: Meta<typeof IconBadge> = {
  title: "Design System/IconBadge",
  component: IconBadge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Badge/chip de icono para numerar pasos, marcar tiers, envolver iconos pequenos. Reemplaza ~23 patrones duplicados tipo `<span className=\"inline-flex h-5 w-5 ... bg-[var(--text-primary)] text-[var(--surface-canvas)]\">`.",
      },
    },
  },
  argTypes: {
    size: { control: "select", options: ["xs", "sm", "md", "step", "lg", "xl"] },
    shape: { control: "select", options: ["circle", "square"] },
    intent: { control: "select", options: ["primary", "muted", "success", "warning", "danger"] },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "1", size: "md", shape: "circle", intent: "primary" },
};

export const StepNumber: Story = {
  args: { children: "3", size: "sm", shape: "circle", intent: "primary" },
};

export const CheckMark: Story = {
  args: { children: <Check className="h-4 w-4" />, size: "md", shape: "circle", intent: "success" },
};

export const SquareShape: Story = {
  args: { children: <ShoppingBag className="h-4 w-4" />, size: "md", shape: "square" },
};

export const LargeIcon: Story = {
  args: { children: <Crown className="h-6 w-6" />, size: "lg", shape: "square", intent: "primary" },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconBadge size="xs">1</IconBadge>
      <IconBadge size="sm">2</IconBadge>
      <IconBadge size="md">3</IconBadge>
      <IconBadge size="step">4</IconBadge>
      <IconBadge size="lg">5</IconBadge>
      <IconBadge size="xl">6</IconBadge>
    </div>
  ),
};

export const AllIntents: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconBadge intent="primary"><Shield className="h-4 w-4" /></IconBadge>
      <IconBadge intent="muted">A</IconBadge>
      <IconBadge intent="success"><Check className="h-4 w-4" /></IconBadge>
      <IconBadge intent="warning">!</IconBadge>
      <IconBadge intent="danger">X</IconBadge>
    </div>
  ),
};
