/**
 * Arqueo guiado: reintentar un cierre que SÍ se hizo (revisión 17-10).
 *
 * Si la respuesta del primer cierre se perdió, el reintento recibe 409
 * `{ yaCerrada, caja }`. «Cerrar caja» ya mostraba ese cierre guardado; el
 * arqueo guiado lo mostraba como error («Esta caja ya estaba cerrada.») y el
 * cajero creía que no había cerrado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));
vi.mock("@/components/admin/turnos/cierre-a-ciegas", () => ({ useCierreACiegas: () => ({ activo: false, ciego: false }) }));
vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

const CAJA = { id: "caja-1", openedAt: "2026-10-17T13:00:00Z", openingAmount: 50, movements: [] };

describe("ModalArqueoGuiado — cierre que ya estaba hecho", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "Esta caja ya estaba cerrada.",
          yaCerrada: true,
          caja: { ...CAJA, closedAt: "2026-10-17T22:00:00Z", closingAmount: 100, expectedAmount: 95 },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    ));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("409 yaCerrada → muestra el cierre guardado (contado y esperado), no un error", async () => {
    const { ModalArqueoGuiado } = await import("@/components/admin/caja/ModalArqueoGuiado");
    const onHecho = vi.fn();
    render(
      <ModalArqueoGuiado
        caja={CAJA as never}
        stats={{ expectedCash: 95 } as never}
        ventasPorMedio={{}}
        onCerrar={vi.fn()}
        onHecho={onHecho}
      />,
    );

    fireEvent.change(screen.getByLabelText("Cantidad de S/100"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Cerrar caja con este conteo/ }));

    await waitFor(() => expect(screen.getByText(/ya estaba cerrada: este es el cierre guardado/)).toBeTruthy());
    expect(screen.getByText("Contaste").nextElementSibling?.textContent).toMatch(/100/);
    expect(screen.getByText("Esperado").nextElementSibling?.textContent).toMatch(/95/);
    expect(screen.queryByText("Esta caja ya estaba cerrada.")).toBeNull();
    // «Listo» relee la caja.
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onHecho).toHaveBeenCalled();
  });
});
