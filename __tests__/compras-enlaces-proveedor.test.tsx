/**
 * Cuentas por pagar: el nombre del proveedor lleva a SU ficha (Compras ›
 * Proveedores, `?proveedor=<id>`) sin recargar el panel, y ctrl + clic queda
 * para el navegador (otra pestaña).
 *
 * `hrefDe` va con el lector prendido: la tabla de `lib/admin/enlaces-panel`
 * nace con `proveedor.abre = false` hasta que `SuppliersTab` lee el parámetro;
 * acá se prueba que la fila pasa el id correcto, no el interruptor.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CosaDelPanel } from "@/lib/admin/enlaces-panel";
import TablaCuentas from "@/components/admin/cuentas-por-pagar/TablaCuentas";
import type { CuentaPorPagar } from "@/components/admin/cuentas-por-pagar/resumen-cuentas";

const irAEnlace = vi.fn();

vi.mock("@/lib/admin/enlaces-panel", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/admin/enlaces-panel")>();
  return {
    ...real,
    hrefDe: (cosa: CosaDelPanel, id?: string | null) => {
      const destino = real.COSAS_DEL_PANEL[cosa].destino;
      return destino && id ? real.hrefDeDestino(destino(id)) : null;
    },
  };
});

vi.mock("@/components/admin/shared/ir-a-enlace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/admin/shared/ir-a-enlace")>()),
  irAEnlace: (href: string) => irAEnlace(href),
}));

const cuenta = (extra: Partial<CuentaPorPagar>): CuentaPorPagar => ({
  id: "cxp-1",
  supplierId: "sup-1",
  supplierName: "Distribuidora Ucayali",
  description: "Factura F001-123",
  amount: 500,
  paidAmount: 100,
  status: "parcial",
  dueDate: "2026-10-15",
  payments: [],
  createdAt: "2026-10-01T10:00:00.000Z",
  ...extra,
});

function dibujar(cuentas: CuentaPorPagar[]) {
  const setAbierto = vi.fn();
  render(
    <TablaCuentas
      cuentas={cuentas}
      hoy="2026-10-09"
      abierto={null}
      setAbierto={setAbierto}
      saving={false}
      onPagar={vi.fn()}
      onEliminar={vi.fn()}
      onAviso={vi.fn()}
    />,
  );
  return { setAbierto };
}

afterEach(() => {
  cleanup();
  irAEnlace.mockReset();
});

describe("TablaCuentas: proveedor como enlace", () => {
  it("el nombre lleva a la ficha del proveedor con su id", () => {
    dibujar([cuenta({})]);
    const enlace = screen.getByRole("link", { name: "Distribuidora Ucayali" });
    expect(enlace.getAttribute("href")).toBe("/admin?tab=compras&vista=proveedores&proveedor=sup-1");
  });

  it("el clic navega sin recargar y no abre nada de la fila; ctrl + clic queda para el navegador", () => {
    const { setAbierto } = dibujar([cuenta({})]);
    const enlace = screen.getByRole("link", { name: "Distribuidora Ucayali" });

    fireEvent.click(enlace, { button: 0, ctrlKey: true });
    expect(irAEnlace).not.toHaveBeenCalled();

    fireEvent.click(enlace, { button: 0 });
    expect(irAEnlace).toHaveBeenCalledWith("/admin?tab=compras&vista=proveedores&proveedor=sup-1");
    expect(setAbierto).not.toHaveBeenCalled();
  });

  it("sin id de proveedor queda el texto, sin enlace", () => {
    dibujar([cuenta({ supplierId: "" })]);
    expect(screen.queryByRole("link", { name: "Distribuidora Ucayali" })).toBeNull();
    expect(screen.getByText("Distribuidora Ucayali")).toBeTruthy();
  });
});
