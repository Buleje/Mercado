/**
 * «Cambiar medio» no se ofrece en el pago de una liquidación.
 *
 * Medido 2026-09-30 en Blas: el ingreso de S/ 1.200 «Liquidación de adelanto
 * ADL-2026-0001» mostraba el selector, pero el servidor responde 409
 * `liquidacion` (su medio también está en el acta firmada). Con HEAD la pantalla
 * no sabía qué movimientos eran de una liquidación.
 *
 *   1. criterio puro compartido con el servidor (mismo WHERE en el 409 y en la lista);
 *   2. el GET de cajas marca `liquidacionCodigo` SOLO en ingresos/egresos de cajas
 *      abiertas, con el tenant en el WHERE;
 *   3. la pantalla muestra el texto en vez del selector.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const H = vi.hoisted(() => ({
  cajas: vi.fn(),
  liqFindMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cashRegister: { findMany: H.cajas },
    cashMovement: { groupBy: H.groupBy },
    liquidacionCuenta: { findMany: H.liqFindMany },
  },
}));
vi.mock("@/lib/prisma-rls", () => ({ withRlsTx: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), getOrSet: (_k: string, _t: number, fn: () => unknown) => fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: vi.fn(), notice: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import {
  liquidacionDelMovimiento,
  textoMedioFijadoPorLiquidacion,
  whereDePagoDeLiquidacion,
} from "@/lib/caja/cambiar-medio";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { CambiarMedioMovimiento } from "@/components/admin/cash-register/CambiarMedioMovimiento";

describe("1 · criterio puro", () => {
  const LIQS = [
    { codigo: "LIQ-2026-0001", cajaMovimientoId: "m-liq" },
    { codigo: "LIQ-2026-0002", cajaMovimientoId: null },
  ];

  it("un movimiento es de una liquidación si alguna lo tiene como cajaMovimientoId", () => {
    expect(liquidacionDelMovimiento("m-liq", LIQS)).toBe("LIQ-2026-0001");
    expect(liquidacionDelMovimiento("otro", LIQS)).toBeNull();
    expect(liquidacionDelMovimiento("m-liq", [])).toBeNull();
  });

  it("una liquidación sin movimiento de caja no marca a nadie", () => {
    expect(liquidacionDelMovimiento("null", LIQS)).toBeNull();
  });

  it("el WHERE lleva siempre el tenant, para uno o para varios", () => {
    expect(whereDePagoDeLiquidacion("t1", "m1")).toEqual({ tenantId: "t1", cajaMovimientoId: "m1" });
    expect(whereDePagoDeLiquidacion("t1", ["m1", "m2"])).toEqual({ tenantId: "t1", cajaMovimientoId: { in: ["m1", "m2"] } });
  });

  it("la frase nombra la liquidación y dice cómo se corrige", () => {
    expect(textoMedioFijadoPorLiquidacion("LIQ-2026-0007")).toBe(
      "Medio fijado por la liquidación LIQ-2026-0007: se corrige anulándola",
    );
  });
});

describe("2 · CashRegistersDB.getAll marca los pagos de liquidación", () => {
  const f = new Date("2026-09-30T15:00:00Z");
  const mov = (id: string, type: string) => ({ id, cashRegisterId: "c1", type, amount: 1200, method: "efectivo", description: "d", createdAt: f, saleId: null });
  const caja = (id: string, status: string, movements: ReturnType<typeof mov>[]) => ({
    id, openedAt: f, closedAt: status === "abierta" ? null : f, openingAmount: 0, closingAmount: null,
    expectedAmount: null, difference: null, status, notes: null, movements,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    H.groupBy.mockResolvedValue([]);
    H.liqFindMany.mockResolvedValue([{ codigo: "LIQ-2026-0001", cajaMovimientoId: "m-liq" }]);
  });

  it("el ingreso pagado por una liquidación trae su código; el resto no", async () => {
    H.cajas.mockResolvedValue([caja("c1", "abierta", [mov("m-liq", "ingreso"), mov("m-otro", "egreso"), mov("m-venta", "venta")])]);
    const [c] = await CashRegistersDB.getAll("t1");
    expect(c.movements.find((m) => m.id === "m-liq")?.liquidacionCodigo).toBe("LIQ-2026-0001");
    expect(c.movements.find((m) => m.id === "m-otro")?.liquidacionCodigo).toBeUndefined();
    expect(c.movements.find((m) => m.id === "m-venta")?.liquidacionCodigo).toBeUndefined();
    // Sólo se consultan ingresos/egresos, con el tenant en el WHERE.
    expect(H.liqFindMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", cajaMovimientoId: { in: ["m-liq", "m-otro"] } });
  });

  it("una caja cerrada no consulta nada (ahí el selector no se ofrece)", async () => {
    H.cajas.mockResolvedValue([caja("c2", "cerrada", [mov("m-liq", "ingreso")])]);
    await CashRegistersDB.getAll("t1");
    expect(H.liqFindMany).not.toHaveBeenCalled();
  });

  it("si la lectura de liquidaciones falla, la caja igual se devuelve", async () => {
    H.liqFindMany.mockRejectedValue(new Error("db"));
    H.cajas.mockResolvedValue([caja("c1", "abierta", [mov("m-liq", "ingreso")])]);
    const [c] = await CashRegistersDB.getAll("t1");
    expect(c.movements).toHaveLength(1);
    expect(c.movements[0].liquidacionCodigo).toBeUndefined();
  });
});

describe("3 · la pantalla", () => {
  const base = { id: "m1", type: "ingreso", amount: 1200, method: "efectivo", description: "Liquidación de adelanto ADL-2026-0001" };
  const props = { cashRegisterId: "c1", esperadoActual: 0, formato: (n: number) => `S/ ${n}`, onCambiado: vi.fn() };

  it("pago de liquidación: texto en vez del selector", () => {
    render(<CambiarMedioMovimiento {...props} movimiento={{ ...base, liquidacionCodigo: "LIQ-2026-0001" }} />);
    expect(screen.getByText("Medio fijado por la liquidación LIQ-2026-0001: se corrige anulándola")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("movimiento común: sigue el selector", () => {
    render(<CambiarMedioMovimiento {...props} movimiento={base} />);
    expect(screen.getByRole("combobox")).toBeTruthy();
  });
});
