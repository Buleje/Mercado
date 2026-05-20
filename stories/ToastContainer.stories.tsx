import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ToastContainer } from "../components/ToastContainer";
import { useToastStore } from "../hooks/use-toast";

const meta: Meta<typeof ToastContainer> = {
  title: "UI/ToastContainer",
  component: ToastContainer,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Contenedor de notificaciones toast. Se monta una vez en el layout raíz. Usa el store global `useToastStore` para agregar/eliminar mensajes.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ToastContainer>;

// Helper para inyectar toasts en el store global antes de renderizar
function WithToasts({
  position,
  toasts,
}: {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
  toasts: Array<{ type: "success" | "error" | "warning" | "info"; title?: string; message: string }>;
}) {
  const store = useToastStore();

  // Solo agrega toasts si el store está vacío (evita duplicados en re-renders)
  if (store.toasts.length === 0) {
    toasts.forEach((t) => store.add({ ...t, dismissible: true }));
  }

  return <ToastContainer position={position} />;
}

export const Exito: Story = {
  render: () => (
    <WithToasts
      position="top-right"
      toasts={[{ type: "success", title: "Venta registrada", message: "Orden #1042 guardada exitosamente" }]}
    />
  ),
};

export const Error: Story = {
  render: () => (
    <WithToasts
      position="top-right"
      toasts={[{ type: "error", title: "Error de conexión", message: "No se pudo conectar con el servidor. Intenta de nuevo." }]}
    />
  ),
};

export const Advertencia: Story = {
  render: () => (
    <WithToasts
      position="top-right"
      toasts={[{ type: "warning", title: "Stock bajo", message: "Arroz Superior tiene solo 5 unidades disponibles" }]}
    />
  ),
};

export const Informacion: Story = {
  render: () => (
    <WithToasts
      position="top-right"
      toasts={[{ type: "info", message: "El reporte estará listo en unos minutos" }]}
    />
  ),
};

export const MultiplesNotificaciones: Story = {
  render: () => (
    <WithToasts
      position="top-right"
      toasts={[
        { type: "success", title: "Producto actualizado", message: "Precio modificado correctamente" },
        { type: "warning", title: "Stock bajo", message: "Leche Gloria tiene 3 unidades" },
        { type: "info", message: "Sincronización completada" },
      ]}
    />
  ),
};

export const PosicionInferiorDerecha: Story = {
  render: () => (
    <WithToasts
      position="bottom-right"
      toasts={[{ type: "success", title: "Guardado", message: "Cambios aplicados correctamente" }]}
    />
  ),
};
