import type { Meta, StoryObj } from "@storybook/react";
import ErrorBoundary, { SimpleErrorFallback } from "../components/ErrorBoundary";

const meta: Meta<typeof ErrorBoundary> = {
  title: "UI/ErrorBoundary",
  component: ErrorBoundary,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Captura errores de React en el árbol de componentes hijos y muestra una UI de recuperación. Incluye opción de reintentar y volver al inicio.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

// Componente que lanza un error intencionalmente para mostrar el boundary
function ComponenteConError() {
  throw new Error("Error de ejemplo: módulo de inventario no disponible");
}

// Componente que renderiza correctamente (para mostrar el estado normal)
function ComponenteNormal() {
  return (
    <div className="p-8 text-center">
      <p className="text-lg font-semibold text-foreground">
        Componente funcionando correctamente
      </p>
      <p className="text-sm text-muted mt-2">
        El ErrorBoundary no se activa cuando todo va bien.
      </p>
    </div>
  );
}

export const EstadoNormal: Story = {
  args: {
    children: <ComponenteNormal />,
  },
};

export const ErrorCapturado: Story = {
  args: {
    children: <ComponenteConError />,
    showDetails: true,
  },
};

export const ConMensajePersonalizado: Story = {
  args: {
    children: <ComponenteConError />,
    errorMessage: "El módulo de ventas no está disponible",
    showDetails: true,
  },
};

export const ConFallbackPersonalizado: Story = {
  args: {
    children: <ComponenteConError />,
    fallbackRender: (error, reset) => (
      <SimpleErrorFallback error={error} reset={reset} />
    ),
  },
};

export const ConFallbackEstatico: Story = {
  args: {
    children: <ComponenteConError />,
    fallback: (
      <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 m-4">
        <p className="text-amber-800 dark:text-amber-200 font-semibold">
          Este módulo no está disponible temporalmente.
        </p>
      </div>
    ),
  },
};
