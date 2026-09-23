/**
 * Revisión 23-09 (hallazgo 4): el modal «Declarar producción» del lote monta la
 * tira con «Anular el día», pero no avisaba a sus pantallas padre: la tabla del
 * libro seguía mostrando lo anulado hasta cerrar. Ahora pasa `onCambioEnElLibro`.
 */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const H = vi.hoisted(() => ({ props: null as null | { onCambioEnElLibro?: () => void } }));
vi.mock("@/components/admin/forestal/CtpSemanaDeProduccion", () => ({
  default: (p: { onCambioEnElLibro?: () => void }) => {
    H.props = p;
    return <div data-testid="tira">tira</div>;
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("lo que se anula desde la tira del modal llega a quien lo abrió", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ jornadas: [], codigos: [], medidas: [] }), { status: 200 }),
    ),
  );
  const { default: Modal } =
    await import("@/components/admin/forestal/CtpRegistrarProduccionModal");
  const onCambioEnElLibro = vi.fn();
  render(
    <Modal
      material={{ especie: "Tornillo", piezas: 3, volumenM3: 10, permisos: ["CON-25-001"] }}
      fecha="2026-09-16"
      guardando={false}
      error={null}
      onConfirmar={() => {}}
      onClose={() => {}}
      onCambioEnElLibro={onCambioEnElLibro}
    />,
  );
  await screen.findByTestId("tira");
  H.props?.onCambioEnElLibro?.();
  expect(onCambioEnElLibro).toHaveBeenCalledTimes(1);
});
