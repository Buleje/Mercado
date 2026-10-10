import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DemoTablaFiltrosColumna, filasDemo } from "../components/admin/shared/filtros-columna/demo-tabla-de-prueba";

/**
 * Filtros en la cabecera, tipo Excel (Fase 1 — primitivo genérico).
 *
 * Generaliza `ctp-filtros-panel.tsx` del Libro CTP: la columna se filtra desde
 * SU cabecera (texto, multi, rango o fecha), OR adentro de la columna y AND
 * entre columnas. Usar el toolbar de Storybook (Tema) para ver light/dark, y
 * "Ocultar columna Categoría" con un filtro puesto para ver que el chip no
 * queda huérfano.
 */
const meta: Meta<typeof DemoTablaFiltrosColumna> = {
  title: "Admin/FiltrosColumna",
  component: DemoTablaFiltrosColumna,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DemoTablaFiltrosColumna>;

export const Default: Story = {
  args: { filas: filasDemo() },
};

export const SinDatos: Story = {
  args: { filas: [] },
};
