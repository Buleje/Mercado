import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "Design System/Chip",
  component: Chip,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Filter/tag chip con 3 estados. Reemplaza ~15 patrones de filtros rodondeados custom en el admin.",
      },
    },
  },
  argTypes: {
    active: { control: "boolean" },
    disabled: { control: "boolean" },
    size: { control: "select", options: ["sm", "md"] },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Inactive: Story = {
  args: { children: "Todos" },
};

export const Active: Story = {
  args: { children: "Hoy", active: true },
};

export const Disabled: Story = {
  args: { children: "Futuro", disabled: true },
};

export const WithCount: Story = {
  args: { children: "Pendientes", count: 12 },
};

export const WithCountActive: Story = {
  args: { children: "Pendientes", active: true, count: 12 },
};

export const InteractiveGroup: Story = {
  render: () => {
    const options = ["Todos", "Hoy", "Semana", "Mes"] as const;
    const Component = () => {
      const [active, setActive] = useState<string>("Todos");
      return (
        <div className="flex gap-2">
          {options.map((o) => (
            <Chip key={o} active={active === o} onClick={() => setActive(o)}>
              {o}
            </Chip>
          ))}
        </div>
      );
    };
    return <Component />;
  },
};
