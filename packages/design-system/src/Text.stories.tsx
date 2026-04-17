import type { Meta, StoryObj } from "@storybook/react";
import { Text } from "./Text";

const meta: Meta<typeof Text> = {
  title: "Design System/Text",
  component: Text,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Primitive tipografico con 8 variantes semanticas (ADR-070). Reemplaza combinaciones arbitrarias de `text-[Xpx] font-X leading-X tracking-X`. Cada variante combina size + weight + leading + tracking + color en una sola prop.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["kicker", "label", "body", "heading", "title", "kpi-value", "kpi-delta", "caption"],
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Body: Story = {
  args: { variant: "body", children: "Texto principal de lectura (14px snug primary)." },
};

export const Kicker: Story = {
  args: { variant: "kicker", children: "Seccion" },
};

export const Label: Story = {
  args: { variant: "label", children: "Campo" },
};

export const Heading: Story = {
  args: { variant: "heading", children: "Heading de seccion" },
};

export const Title: Story = {
  args: { variant: "title", children: "Titulo de modulo" },
};

export const KpiValue: Story = {
  args: { variant: "kpi-value", children: "S/ 1,234.56" },
};

export const KpiDelta: Story = {
  args: { variant: "kpi-delta", children: "+12.3%", className: "text-[var(--data-success)]" },
};

export const Caption: Story = {
  args: { variant: "caption", children: "Nota al pie — 10px tertiary" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Text variant="kicker">KICKER</Text>
      <Text variant="label">Label</Text>
      <Text variant="body">Body text default. Medium length string to see line-height in action.</Text>
      <Text variant="heading">Heading</Text>
      <Text variant="title">Title module</Text>
      <Text variant="kpi-value">S/ 1,234.56</Text>
      <Text variant="kpi-delta" className="text-[var(--data-success)]">+12.3%</Text>
      <Text variant="caption">Caption footer</Text>
    </div>
  ),
};
