import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { PrimaryButton } from "./PrimaryButton";

const meta: Meta<typeof PrimaryButton> = {
  title: "Design System/PrimaryButton",
  component: PrimaryButton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Boton unificado del admin y customer journey (ADR-068/069). 4 variantes, 3 tamanos. Reemplaza 30+ patrones duplicados. Soporta `asChild` (Radix Slot) para wrap de `<Link>` o `<a>`.",
      },
    },
  },
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "ghost", "danger"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary", size: "md", children: "Guardar cambios" },
};

export const Secondary: Story = {
  args: { variant: "secondary", size: "md", children: "Cancelar" },
};

export const Ghost: Story = {
  args: { variant: "ghost", size: "md", children: "Ver mas" },
};

export const Danger: Story = {
  args: { variant: "danger", size: "md", children: "Eliminar" },
};

export const WithLeftIcon: Story = {
  args: {
    variant: "primary",
    size: "md",
    leftIcon: <Plus className="h-4 w-4" />,
    children: "Nueva campana",
  },
};

export const WithRightIcon: Story = {
  args: {
    variant: "primary",
    size: "md",
    rightIcon: <ArrowRight className="h-4 w-4" />,
    children: "Continuar",
  },
};

export const Loading: Story = {
  args: { variant: "primary", size: "md", loading: true, children: "Guardando" },
};

export const Disabled: Story = {
  args: { variant: "primary", size: "md", disabled: true, children: "Sin cambios" },
};

export const SizeSm: Story = {
  args: { variant: "primary", size: "sm", leftIcon: <Save className="h-3 w-3" />, children: "Guardar" },
};

export const SizeMd: Story = {
  args: { variant: "primary", size: "md", leftIcon: <Save className="h-4 w-4" />, children: "Guardar" },
};

export const SizeLg: Story = {
  args: { variant: "primary", size: "lg", leftIcon: <Save className="h-4 w-4" />, children: "Guardar cambios" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <PrimaryButton variant="primary">Primary</PrimaryButton>
      <PrimaryButton variant="secondary">Secondary</PrimaryButton>
      <PrimaryButton variant="ghost">Ghost</PrimaryButton>
      <PrimaryButton variant="danger" leftIcon={<Trash2 className="h-4 w-4" />}>
        Eliminar
      </PrimaryButton>
    </div>
  ),
};

export const AsChildLink: Story = {
  render: () => (
    <PrimaryButton asChild rightIcon={<ArrowRight className="h-4 w-4" />}>
      <a href="#destino">Ir al destino</a>
    </PrimaryButton>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Con `asChild` el componente se comporta como Slot de Radix — envuelve un `<Link>` o `<a>` manteniendo estilos y tipografia.",
      },
    },
  },
};
