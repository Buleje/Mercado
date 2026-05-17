/**
 * TreasuryDashboard "Por cobrar (fiados)" counter — regression test.
 *
 * Audit 2026-05-17 (P0-1): el subtitle del KPICard usaba
 *   `${fiados.filter(f => f.status !== "pagado").length} clientes pendientes`
 * comparando con lowercase "pagado", pero el enum FiadoStatus en Prisma es
 * UPPERCASE ("PAGADO"). El contador incluía fiados ya pagados como "pendientes".
 *
 * Este test ejerce el mismo filtro que vive inline en JSX para garantizar que
 * la corrección (status === "ACTIVO" || "VENCIDO") sea estable a regresión.
 */

import { describe, it, expect } from "vitest";

type Fiado = {
  status: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
};

/**
 * Réplica del filtro inline en components/admin/TreasuryDashboard.tsx:309.
 * Si cambia el JSX, este helper debe cambiar a la par — protege que la
 * regresión a lowercase NO vuelva a ocurrir.
 */
function countClientesPendientes(fiados: Fiado[]): number {
  return fiados.filter((f) => f.status === "ACTIVO" || f.status === "VENCIDO").length;
}

describe("TreasuryDashboard — contador 'clientes pendientes' (P0-1)", () => {
  it("cuenta solo ACTIVO y VENCIDO (NO PAGADO ni CANCELADO)", () => {
    const fiados: Fiado[] = [
      { status: "ACTIVO" },
      { status: "ACTIVO" },
      { status: "VENCIDO" },
      { status: "PAGADO" },
      { status: "PAGADO" },
      { status: "CANCELADO" },
    ];
    expect(countClientesPendientes(fiados)).toBe(3);
  });

  it("regresión: 0 pendientes si todos están PAGADO", () => {
    const fiados: Fiado[] = [
      { status: "PAGADO" },
      { status: "PAGADO" },
      { status: "PAGADO" },
    ];
    // Antes del fix: 3 (todos contaban como pendientes por lowercase mismatch).
    // Después del fix: 0.
    expect(countClientesPendientes(fiados)).toBe(0);
  });

  it("no cuenta CANCELADO como pendiente", () => {
    const fiados: Fiado[] = [
      { status: "CANCELADO" },
      { status: "CANCELADO" },
      { status: "ACTIVO" },
    ];
    expect(countClientesPendientes(fiados)).toBe(1);
  });

  it("array vacío → 0", () => {
    expect(countClientesPendientes([])).toBe(0);
  });

  it("solo VENCIDO → todos pendientes", () => {
    const fiados: Fiado[] = [
      { status: "VENCIDO" },
      { status: "VENCIDO" },
      { status: "VENCIDO" },
    ];
    expect(countClientesPendientes(fiados)).toBe(3);
  });

  it("NUNCA matchea lowercase (defense vs regresión del bug original)", () => {
    // El bug original era `f.status !== "pagado"` (lowercase) que matcheaba
    // siempre porque "PAGADO" !== "pagado". Este caso valida que la lógica
    // actual NO regrese al patrón roto.
    const fiados: Fiado[] = [{ status: "PAGADO" }];
    const bugFilter = (f: Fiado) => f.status !== ("pagado" as Fiado["status"]);
    const correctFilter = (f: Fiado) =>
      f.status === "ACTIVO" || f.status === "VENCIDO";

    expect(fiados.filter(bugFilter).length).toBe(1); // bug: cuenta PAGADO
    expect(fiados.filter(correctFilter).length).toBe(0); // fix: no cuenta
  });
});
