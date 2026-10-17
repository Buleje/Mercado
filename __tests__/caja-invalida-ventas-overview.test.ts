/**
 * El Tablero de Ventas (`VentasOverviewDB.get`, "use cache" ~2 min, tag
 * `ventas-overview-${tenantId}`) guarda el saldo de la caja abierta. Con HEAD
 * nadie purgaba ese tag al escribir en la caja: anotar un ingreso o cambiar su
 * medio dejaba el tablero con el saldo viejo hasta 2 minutos.
 *
 * Cada camino que escribe un movimiento de caja (apertura, cierre, anotar,
 * anotar dentro de una tx de adelanto/liquidación, cambio de medio) debe
 * invalidar ESE tag y sólo el del tenant que escribió.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    cashMovement: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
    cashRegister: { findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    liquidacionCuenta: { findFirst: vi.fn() },
  };
  return { tx, revalidateTag: vi.fn(), abrir: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidateTag: H.revalidateTag, cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: typeof H.tx) => unknown) => fn(H.tx),
    cashRegister: { create: H.abrir },
  },
}));
vi.mock("@/lib/prisma-rls", () => ({ withRlsTx: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), getOrSet: (_k: string, _t: number, fn: () => unknown) => fn() }));

import { CashRegistersMovementsDB } from "@/lib/db/cash-registers-movements.db";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { invalidarVentasOverview, tagVentasOverview } from "@/lib/caja/invalidar-ventas-overview";

const FECHA = new Date("2026-09-30T15:00:00Z");
const FILA_MOV = { id: "m1", cashRegisterId: "c1", type: "ingreso", amount: 50, method: "efectivo", description: "x", createdAt: FECHA, saleId: null };
const FILA_CAJA = {
  id: "c1", openedAt: FECHA, closedAt: null, openingAmount: 0, closingAmount: null, expectedAmount: null,
  difference: null, status: "abierta", notes: null, movements: [],
};

const tagsInvalidados = () => H.revalidateTag.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  H.tx.$queryRaw.mockResolvedValue([{ status: "abierta", id: "c1" }]);
  H.tx.cashMovement.create.mockResolvedValue(FILA_MOV);
  H.tx.cashMovement.findFirst.mockResolvedValue({ ...FILA_MOV, type: "egreso", method: "efectivo" });
  H.tx.cashMovement.updateMany.mockResolvedValue({ count: 1 });
  H.tx.cashMovement.groupBy.mockResolvedValue([]);
  H.tx.cashRegister.findFirst.mockResolvedValue({ openingAmount: 0, movements: [], closedAt: null });
  H.tx.cashRegister.updateMany.mockResolvedValue({ count: 1 });
  H.tx.cashRegister.findUnique.mockResolvedValue(FILA_CAJA);
  H.tx.liquidacionCuenta.findFirst.mockResolvedValue(null);
  H.abrir.mockResolvedValue(FILA_CAJA);
});

describe("invalidarVentasOverview", () => {
  it("purga el tag exacto del tenant, con vencimiento inmediato", () => {
    invalidarVentasOverview("t1");
    expect(H.revalidateTag).toHaveBeenCalledWith("ventas-overview-t1", { expire: 0 });
    expect(tagVentasOverview("t1")).toBe("ventas-overview-t1");
  });

  it("fuera de un request de Next (revalidateTag lanza) no rompe la escritura", () => {
    H.revalidateTag.mockImplementationOnce(() => {
      throw new Error("static generation store missing");
    });
    expect(() => invalidarVentasOverview("t1")).not.toThrow();
  });

  it("sin tenant no purga nada", () => {
    invalidarVentasOverview("");
    expect(H.revalidateTag).not.toHaveBeenCalled();
  });
});

describe("cada escritor de caja invalida el tablero del tenant", () => {
  it("anotar un movimiento manual (createMovement)", async () => {
    await CashRegistersMovementsDB.createMovement("t1", { cashRegisterId: "c1", type: "ingreso", amount: 50, method: "efectivo", description: "x" });
    expect(tagsInvalidados()).toEqual(["ventas-overview-t1"]);
  });

  it("anotar dentro de la tx de un adelanto o liquidación (createMovementEnTx)", async () => {
    await CashRegistersMovementsDB.createMovementEnTx(H.tx as never, "t1", { cashRegisterId: "c1", type: "egreso", amount: 50, method: "efectivo", description: "x" });
    expect(tagsInvalidados()).toEqual(["ventas-overview-t1"]);
  });

  it("createMovementEnTx exige tenantId", async () => {
    await expect(
      CashRegistersMovementsDB.createMovementEnTx(H.tx as never, "", { cashRegisterId: "c1", type: "egreso", amount: 50, method: "efectivo", description: "x" }),
    ).rejects.toThrow(/tenantId/);
    expect(H.revalidateTag).not.toHaveBeenCalled();
  });

  it("cambiar el medio", async () => {
    await CashRegistersMovementsDB.cambiarMedio("t1", { cashRegisterId: "c1", movementId: "m1", metodo: "yape" });
    expect(tagsInvalidados()).toEqual(["ventas-overview-t1"]);
  });

  it("cambiar el medio que termina en 409 (carrera) NO invalida", async () => {
    H.tx.cashMovement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(CashRegistersMovementsDB.cambiarMedio("t1", { cashRegisterId: "c1", movementId: "m1", metodo: "yape" })).rejects.toBeTruthy();
    expect(H.revalidateTag).not.toHaveBeenCalled();
  });

  it("anotar una venta, un arqueo o un ingreso del asistente (addMovement)", async () => {
    await CashRegistersDB.addMovement("c1", { type: "venta", amount: 10, method: "efectivo", description: "v" }, "t1");
    expect(tagsInvalidados()).toEqual(["ventas-overview-t1"]);
  });

  it("abrir la caja", async () => {
    await CashRegistersDB.open("t1", 100);
    expect(tagsInvalidados()).toEqual(["ventas-overview-t1"]);
  });

  it("cerrar la caja", async () => {
    await CashRegistersDB.close("t1", "c1", 0);
    expect(tagsInvalidados()).toEqual(["ventas-overview-t1"]);
  });

  it("una caja que no se pudo anotar (cerrada) NO invalida", async () => {
    H.tx.$queryRaw.mockResolvedValueOnce([{ status: "cerrada" }]);
    await expect(CashRegistersDB.addMovement("c1", { type: "venta", amount: 10, method: "efectivo", description: "v" }, "t1")).rejects.toBeTruthy();
    expect(H.revalidateTag).not.toHaveBeenCalled();
  });
});
