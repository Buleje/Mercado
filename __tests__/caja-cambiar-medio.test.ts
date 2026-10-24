/**
 * Corregir el MEDIO de un movimiento ya anotado en la caja abierta.
 *
 * Medido 2026-09-28 en el negocio real: la caja abierta desde el 11/06 espera
 * −S/ 6 424 porque tres adelantos (3 642 + 3 217 + 1 000) quedaron como egresos
 * en EFECTIVO, y varios se pagaron por transferencia. Con HEAD no había forma de
 * corregirlo: ni función, ni método de la DB class, ni ruta.
 *
 *   1. la lógica pura: cuánto se mueve el esperado (−6 424 → −2 782);
 *   2. la DB class (prisma mockeado): lock FOR SHARE primero, tenant en el WHERE,
 *      caja cerrada / venta / mismo medio / carrera → 409, invalida el banner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    cashMovement: { findFirst: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
    cashRegister: { findFirst: vi.fn() },
    liquidacionCuenta: { findFirst: vi.fn() },
  };
  return { tx, orden: [] as string[], invalidate: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (t: typeof H.tx) => unknown) => fn(H.tx) },
}));
vi.mock("@/lib/cache", () => ({ invalidate: H.invalidate }));

import {
  efectoEnElEsperado,
  esperadoTrasCambiarMedio,
  medioCorregible,
  nombreDelMedio,
  textoCambioDelEsperado,
} from "@/lib/caja/cambiar-medio";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { CashRegistersMovementsDB, MedioNoCambiadoError } from "@/lib/db/cash-registers-movements.db";

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/* La caja real de Blas (2026-09-28), en su forma más chica que da el mismo número. */
const CAJA_BLAS = [
  { type: "ingreso", method: "efectivo", amount: 100 },
  { type: "ingreso", method: "efectivo", amount: 120 },
  { type: "ingreso", method: "efectivo", amount: 1230 },
  { type: "egreso", method: "efectivo", amount: 3642 }, // ADL-0001
  { type: "egreso", method: "efectivo", amount: 3217 }, // ADL-0002
  { type: "egreso", method: "efectivo", amount: 1000 }, // ADL-0005
  { type: "egreso", method: "efectivo", amount: 15 },
];

describe("1 · lógica pura: cuánto se mueve el esperado", () => {
  it("la caja de Blas espera −6 424; pasar ADL-0001 a transferencia la deja en −2 782", () => {
    const antes = saldoEsperadoDeCaja(0, CAJA_BLAS).esperado;
    expect(antes).toBe(-6424);
    const cambio = esperadoTrasCambiarMedio(antes, CAJA_BLAS[3], "transferencia");
    expect(cambio).toEqual({ antes: -6424, despues: -2782 });
    // La previsualización coincide con recalcular la caja entera con el cambio.
    const recalculado = saldoEsperadoDeCaja(0, CAJA_BLAS.map((m, i) => (i === 3 ? { ...m, method: "transferencia" } : m))).esperado;
    expect(cambio.despues).toBe(recalculado);
    expect(textoCambioDelEsperado(cambio, soles)).toBe("El esperado pasa de S/ -6424.00 a S/ -2782.00.");
  });

  it("egreso ↔ ingreso, ida y vuelta, y entre dos medios fuera del cajón", () => {
    expect(efectoEnElEsperado({ type: "egreso", method: "efectivo", amount: 50 }, "yape")).toBe(50);
    expect(efectoEnElEsperado({ type: "egreso", method: "yape", amount: 50 }, "efectivo")).toBe(-50);
    expect(efectoEnElEsperado({ type: "ingreso", method: "efectivo", amount: 50 }, "plin")).toBe(-50);
    expect(efectoEnElEsperado({ type: "ingreso", method: "tarjeta", amount: 50 }, "efectivo")).toBe(50);
    expect(efectoEnElEsperado({ type: "egreso", method: "yape", amount: 50 }, "transferencia")).toBe(0);
    // Vacío = efectivo (default de la columna).
    expect(efectoEnElEsperado({ type: "egreso", method: "", amount: 10.1 }, "yape")).toBe(10.1);
  });

  it("si el cambio no toca el cajón, la frase lo dice en vez de repetir el número", () => {
    const cambio = esperadoTrasCambiarMedio(200, { type: "egreso", method: "yape", amount: 80 }, "transferencia");
    expect(textoCambioDelEsperado(cambio, soles)).toMatch(/no cambia: sigue en S\/ 200\.00/);
  });

  it("sólo ingresos y egresos se corrigen; el nombre del medio es el de la pantalla", () => {
    expect(medioCorregible("egreso")).toBe(true);
    expect(medioCorregible("ingreso")).toBe(true);
    for (const t of ["venta", "apertura", "cierre", "arqueo"]) expect(medioCorregible(t)).toBe(false);
    expect(nombreDelMedio(" Efectivo ")).toBe("Efectivo");
    expect(nombreDelMedio(null)).toBe("Efectivo");
    expect(nombreDelMedio("fiado")).toBe("fiado");
  });
});

describe("2 · CashRegistersMovementsDB.cambiarMedio (prisma mockeado)", () => {
  const MOV = {
    id: "m1",
    cashRegisterId: "c1",
    type: "egreso",
    amount: 3642,
    method: "efectivo",
    description: "Adelanto ADL-2026-0001 · Juan",
    createdAt: new Date("2026-06-12T15:00:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    H.orden.length = 0;
    H.tx.$queryRaw.mockImplementation(async () => {
      H.orden.push("lock");
      return [{ status: "abierta" }];
    });
    H.tx.cashMovement.findFirst.mockImplementation(async () => {
      H.orden.push("leer");
      return { ...MOV };
    });
    H.tx.cashMovement.updateMany.mockImplementation(async () => {
      H.orden.push("update");
      return { count: 1 };
    });
    H.tx.cashRegister.findFirst.mockResolvedValue({ openingAmount: 0 });
    H.tx.liquidacionCuenta.findFirst.mockResolvedValue(null);
    // Lo que suma la base DESPUÉS del update: ADL-0001 ya en transferencia.
    H.tx.cashMovement.groupBy.mockResolvedValue([
      { type: "ingreso", method: "efectivo", _sum: { amount: 1450 } },
      { type: "egreso", method: "efectivo", _sum: { amount: 4232 } },
      { type: "egreso", method: "transferencia", _sum: { amount: 3642 } },
    ]);
  });

  const cambiar = (metodo: "efectivo" | "yape" | "transferencia" = "transferencia") =>
    CashRegistersMovementsDB.cambiarMedio("t1", { cashRegisterId: "c1", movementId: "m1", metodo });

  it("toma la caja en FOR SHARE ANTES de leer y actualizar, con el tenant en cada WHERE", async () => {
    const r = await cambiar();
    expect(H.orden).toEqual(["lock", "leer", "update"]);
    const sql = (H.tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toMatch(/FOR SHARE/);
    expect(sql).toMatch(/"tenantId"/);
    expect(H.tx.$queryRaw.mock.calls[0].slice(1)).toEqual(["c1", "t1"]);
    expect(H.tx.cashMovement.findFirst.mock.calls[0][0].where).toEqual({ id: "m1", cashRegisterId: "c1", cashRegister: { tenantId: "t1" } });
    // Carrera: el medio LEÍDO va en el WHERE del update.
    expect(H.tx.cashMovement.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "m1", cashRegisterId: "c1", method: "efectivo", cashRegister: { tenantId: "t1" } },
      data: { method: "transferencia" },
    });
    expect(r).toMatchObject({ metodoAnterior: "efectivo", esperadoAntes: -6424, esperadoDespues: -2782 });
    expect(r?.movimiento.method).toBe("transferencia");
    expect(H.invalidate).toHaveBeenCalledWith("admin:alerts-summary:t1");
  });

  it("caja de otro negocio (o inexistente) → null, sin tocar nada", async () => {
    H.tx.$queryRaw.mockResolvedValueOnce([]);
    expect(await cambiar()).toBeNull();
    expect(H.tx.cashMovement.updateMany).not.toHaveBeenCalled();
    expect(H.invalidate).not.toHaveBeenCalled();
  });

  it("movimiento que no es de esa caja → null", async () => {
    H.tx.cashMovement.findFirst.mockResolvedValueOnce(null);
    expect(await cambiar()).toBeNull();
    expect(H.tx.cashMovement.updateMany).not.toHaveBeenCalled();
  });

  it("caja cerrada (releída bajo el lock) → 409 caja_cerrada", async () => {
    H.tx.$queryRaw.mockResolvedValueOnce([{ status: "cerrada" }]);
    const err = await cambiar().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MedioNoCambiadoError);
    expect((err as MedioNoCambiadoError).httpStatus).toBe(409);
    expect((err as MedioNoCambiadoError).motivo).toBe("caja_cerrada");
    expect(H.tx.cashMovement.updateMany).not.toHaveBeenCalled();
  });

  it("una venta no se corrige (su medio viene del POS) → 409 tipo", async () => {
    H.tx.cashMovement.findFirst.mockResolvedValueOnce({ ...MOV, type: "venta" });
    await expect(cambiar()).rejects.toMatchObject({ motivo: "tipo" });
    expect(H.tx.cashMovement.updateMany).not.toHaveBeenCalled();
  });

  it("mismo medio (aunque venga con mayúsculas) → 409 sin_cambio", async () => {
    H.tx.cashMovement.findFirst.mockResolvedValueOnce({ ...MOV, method: "Efectivo " });
    await expect(cambiar("efectivo")).rejects.toMatchObject({ motivo: "sin_cambio" });
  });

  it("otro cambio llegó primero (0 filas) → 409 carrera y no invalida", async () => {
    H.tx.cashMovement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(cambiar()).rejects.toMatchObject({ motivo: "carrera" });
    expect(H.invalidate).not.toHaveBeenCalled();
  });

  it("el pago de una liquidación no se corrige acá (su medio está en el acta firmada) → 409 liquidacion", async () => {
    H.tx.liquidacionCuenta.findFirst.mockResolvedValueOnce({ codigo: "LIQ-2026-0003" });
    const err = await cambiar().catch((e: unknown) => e);
    expect(err).toMatchObject({ motivo: "liquidacion" });
    expect((err as Error).message).toContain("LIQ-2026-0003");
    expect(H.tx.liquidacionCuenta.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "t1", cajaMovimientoId: "m1" });
    expect(H.tx.cashMovement.updateMany).not.toHaveBeenCalled();
  });

  it("sin tenantId no hace nada", async () => {
    await expect(CashRegistersMovementsDB.cambiarMedio("", { cashRegisterId: "c1", movementId: "m1", metodo: "yape" })).rejects.toThrow(
      /tenantId/,
    );
    expect(H.tx.$queryRaw).not.toHaveBeenCalled();
  });
});
