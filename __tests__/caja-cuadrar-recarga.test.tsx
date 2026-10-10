/**
 * Caja › Cuadrar: el «Más» suma las acciones de Caja (Arqueo express y Arqueo
 * guiado, que CIERRA la caja). Los cuadres se cargan al montar y nada más, así
 * que tras un arqueo hecho desde ahí el contador y la tabla seguían diciendo
 * «abierta» (y guardar el conteo rebotaba con CajaNoAbiertaError).
 *
 * Lo que se prueba: cada acción que termina relee la caja Y vuelve a montar los
 * cuadres. Los cuadres y los modales van simulados: interesa el cableado.
 */

import { useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { MenuAccion } from "@/components/admin/shared/action-menu";

const h = vi.hoisted(() => ({ montajes: 0, fetchData: vi.fn(async () => {}) }));

vi.mock("@/contexts/tenant-context", () => ({
  useTenant: () => ({ branding: { name: "Bodega" } }),
}));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => "admin" }));
vi.mock("@/components/admin/caja/use-atajos-caja", () => ({ useAtajosCaja: () => undefined }));
vi.mock("@/components/admin/caja/use-parte-del-dia", () => ({
  useParteDelDia: () => ({ parte: null }),
}));
vi.mock("@/components/admin/caja/use-caja-registradora", () => ({
  useCajaRegistradora: () => ({
    currentRegister: {
      id: "caja-1",
      status: "OPEN",
      openedAt: "2026-10-10T13:00:00.000Z",
      movements: [],
    },
    stats: { expectedCash: 100, salesCount: 2 },
    loading: false,
    errorCarga: null,
    fetchData: h.fetchData,
    closedRegisters: [],
    cashTolerance: 1,
    setCashTolerance: vi.fn(),
    paymentBreakdown: {},
  }),
}));

/* La cabecera de Caja, reducida a un botón por acción del «Más». */
vi.mock("@/components/admin/caja/CajaCabecera", () => ({
  CajaCabecera: ({ acciones }: { acciones: MenuAccion[] }) => (
    <div>
      {acciones.map((a) => (
        <button key={a.id} type="button" disabled={a.disabled} onClick={() => a.onSelect?.()}>
          {a.label}
        </button>
      ))}
    </div>
  ),
}));

/* Los cuadres: cuentan sus montajes y piden la cabecera a Caja, como el real. */
vi.mock("@/components/admin/CashAuditTab", () => ({
  default: function CuadresSimulados({
    cabecera,
  }: {
    cabecera?: (p: {
      titulo: ReactNode;
      indicadores: ReactNode;
      acciones: MenuAccion[];
    }) => ReactNode;
  }) {
    useEffect(() => {
      h.montajes += 1;
    }, []);
    return <>{cabecera?.({ titulo: "Cuadres", indicadores: null, acciones: [] })}</>;
  },
}));

/* Los modales terminan apenas se abren: `onHecho` y luego `onCerrar`. */
function TerminaAlAbrir({ onHecho, onCerrar }: { onHecho: () => void; onCerrar: () => void }) {
  useEffect(() => {
    onHecho();
    onCerrar();
  }, [onHecho, onCerrar]);
  return null;
}
vi.mock("@/components/admin/caja/ModalArqueoGuiado", () => ({ ModalArqueoGuiado: TerminaAlAbrir }));
vi.mock("@/components/admin/caja/ModalArqueoExpress", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  ModalArqueoExpress: TerminaAlAbrir,
}));

import CashRegisterTab from "@/components/admin/CashRegisterTab";

describe("Caja › Cuadrar: las acciones del «Más» refrescan los cuadres", () => {
  beforeEach(() => {
    h.montajes = 0;
    h.fetchData.mockClear();
    window.history.replaceState(
      null,
      "",
      "/admin?tab=ventas-caja&vista=caja-registradora&sub=cuadrar",
    );
  });
  afterEach(cleanup);

  it.each(["Arqueo guiado", "Arqueo express"])(
    "«%s» relee la caja y vuelve a montar los cuadres",
    async (accion) => {
      render(<CashRegisterTab />);
      await waitFor(() => expect(h.montajes).toBe(1));

      fireEvent.click(screen.getByRole("button", { name: accion }));

      await waitFor(() => expect(h.montajes).toBe(2));
      expect(h.fetchData).toHaveBeenCalledTimes(1);
    },
  );
});
