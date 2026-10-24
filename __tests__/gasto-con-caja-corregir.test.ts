/**
 * `GastoConCajaDB.corregirGasto` (revisión 24-10 del pago de la semana):
 * - el retiro de la caja se corrige POR LA DIFERENCIA, no se iguala al monto
 *   nuevo (un gasto de 300 con retiro de 200 corregido a 310 → retiro 210);
 * - el gasto del pago de RRHH (comprobante `RRHH-<lunes>-<id>`) no cambia de
 *   monto desde Mi Plata: 409 con el camino («Deshacer» en RRHH).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  gasto: null as null | { amount: number; documentNumber: string | null; recurring: boolean; description: string; category: string },
  retiro: null as null | { amount: number; cashRegisterId: string; cashRegister: { status: string; openedAt: Date } },
  movUpdate: vi.fn(),
  /** Lo que se relee bajo lock dentro de la tx: [gasto], después [retiro]. */
  bajoLock: vi.fn(),
  gastoUpdateMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    expense: { findFirst: vi.fn(async () => h.gasto) },
    cashMovement: { findFirst: vi.fn(async () => h.retiro) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ $queryRaw: h.bajoLock, expense: { updateMany: h.gastoUpdateMany }, cashMovement: { updateMany: h.movUpdate } }),
    ),
  },
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({ invalidarVentasOverview: vi.fn() }));
vi.mock("@/lib/db/igv-del-mes.db", () => ({ invalidarIgvDelMes: vi.fn() }));
vi.mock("@/lib/db/contrato-propio.db", () => ({ contratoPropio: vi.fn() }));
vi.mock("@/lib/db/cash-registers-movements.db", () => ({
  CashRegistersMovementsDB: { bloquearCajaParaAnotarEnTx: vi.fn(async () => ({ status: "abierta" })) },
}));
vi.mock("@/lib/db/finance.db", () => ({
  ExpensesDB: { update: h.update, getById: vi.fn(async (_t: string, id: string) => ({ id })) },
  PayablesDB: {},
  revalidarGastosAlInstante: vi.fn(),
}));

import { GastoConCajaDB, GastoDePagoRrhhError } from "@/lib/db/gasto-con-caja.db";
import { MENSAJE_GASTO_DE_PAGO_RRHH } from "@/lib/rrhh/pago-semana";

const cajaAbierta = (monto: number) => ({ amount: monto, cashRegisterId: "caja1", cashRegister: { status: "abierta", openedAt: new Date() } });
const gasto = (monto: number, documentNumber: string | null = null) => ({
  amount: monto, documentNumber, recurring: false, description: "Pago", category: "personal",
});

beforeEach(() => {
  vi.clearAllMocks();
  h.update.mockImplementation(async (_t: string, id: string) => ({ id }));
  // Por defecto, bajo lock se lee lo mismo que antes de la tx.
  h.bajoLock.mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join("?").includes('FROM "Expense"')
      ? (h.gasto ? [{ amount: h.gasto.amount, documentNumber: h.gasto.documentNumber }] : [])
      : (h.retiro ? [{ amount: h.retiro.amount }] : []),
  );
});

describe("corregirGasto: el retiro de la caja va por la diferencia", () => {
  it("gasto 300 con retiro 200 corregido a 310 → retiro 210 (no 310)", async () => {
    h.gasto = gasto(300);
    h.retiro = cajaAbierta(200);
    const r = await GastoConCajaDB.corregirGasto("t1", "g1", { amount: 310 });
    expect(h.movUpdate).toHaveBeenCalledTimes(1);
    expect(h.movUpdate.mock.calls[0][0]).toMatchObject({ where: { cashRegisterId: "caja1" }, data: { amount: 210 } });
    expect(r.caja).toMatchObject({ retiro: "ajustado" });
    expect(r.caja?.aviso).toContain("S/ 210.00");
  });

  it("el caso de siempre (retiro = gasto) queda igual: 45 → 50 deja el retiro en 50", async () => {
    h.gasto = gasto(45);
    h.retiro = cajaAbierta(45);
    await GastoConCajaDB.corregirGasto("t1", "g1", { amount: 50 });
    expect(h.movUpdate.mock.calls[0][0].data.amount).toBe(50);
  });

  it("mandar el mismo monto (aunque el retiro sea otro) no toca la caja", async () => {
    h.gasto = gasto(300);
    h.retiro = cajaAbierta(200);
    const r = await GastoConCajaDB.corregirGasto("t1", "g1", { amount: 300, description: "otro nombre" });
    expect(h.movUpdate).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith("t1", "g1", { amount: 300, description: "otro nombre" });
    expect(r.caja).toBeNull();
  });

  it("si el retiro quedaría en cero o menos, no lo ajusta: pide borrarlo", async () => {
    h.gasto = gasto(300);
    h.retiro = cajaAbierta(100);
    await expect(GastoConCajaDB.corregirGasto("t1", "g1", { amount: 150 })).rejects.toThrow(/Bórralo/);
    expect(h.movUpdate).not.toHaveBeenCalled();
  });

  it("la cuenta se hace con lo releído bajo lock, no con lo leído antes (segunda revisión 24-10)", async () => {
    h.gasto = gasto(300);
    h.retiro = cajaAbierta(200);
    // Entre la lectura y la tx otro cambio dejó el retiro en 180: 180 + (310 − 300) = 190, no 210.
    h.bajoLock.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes('FROM "Expense"') ? [{ amount: 300, documentNumber: null }] : [{ amount: 180 }],
    );
    const r = await GastoConCajaDB.corregirGasto("t1", "g1", { amount: 310 });
    expect(h.movUpdate.mock.calls[0][0].data.amount).toBe(190);
    expect(r.caja?.aviso).toContain("de S/ 180.00 a S/ 190.00");
    const sqls = h.bajoLock.mock.calls.map((c) => (c[0] as TemplateStringsArray).join("?"));
    expect(sqls.every((q) => q.includes("FOR UPDATE"))).toBe(true);
    // Con el negocio de quien corrige.
    expect(h.bajoLock.mock.calls[0].slice(1)).toEqual(["g1", "t1"]);
  });

  it("si bajo lock el gasto ya es del pago de RRHH, tampoco cambia el monto", async () => {
    h.gasto = gasto(300);
    h.retiro = cajaAbierta(200);
    h.bajoLock.mockImplementation(async () => [{ amount: 300, documentNumber: "RRHH-2026-10-19-cmcolab1" }]);
    await expect(GastoConCajaDB.corregirGasto("t1", "g1", { amount: 310 })).rejects.toBeInstanceOf(GastoDePagoRrhhError);
    expect(h.gastoUpdateMany).not.toHaveBeenCalled();
    expect(h.movUpdate).not.toHaveBeenCalled();
  });

  it("gasto de otro negocio: nada (null), sin escribir", async () => {
    h.gasto = null;
    h.retiro = cajaAbierta(200);
    expect(await GastoConCajaDB.corregirGasto("t2", "g1", { amount: 310 })).toEqual({ gasto: null, caja: null });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.movUpdate).not.toHaveBeenCalled();
  });
});

describe("corregirGasto: el gasto del pago de la semana de RRHH", () => {
  const MARCA = "RRHH-2026-10-19-cmcolab1";

  it("gasto 300 con retiro 200 (el neto) corregido a 310 → 409 con el camino, sin escribir", async () => {
    h.gasto = gasto(300, MARCA);
    h.retiro = cajaAbierta(200);
    const p = GastoConCajaDB.corregirGasto("t1", "g1", { amount: 310 });
    await expect(p).rejects.toBeInstanceOf(GastoDePagoRrhhError);
    await expect(p).rejects.toThrow(MENSAJE_GASTO_DE_PAGO_RRHH);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.movUpdate).not.toHaveBeenCalled();
  });

  it("pagado por Yape (sin retiro): cambiar el monto también es 409", async () => {
    h.gasto = gasto(300, MARCA);
    h.retiro = null;
    await expect(GastoConCajaDB.corregirGasto("t1", "g1", { amount: 250 })).rejects.toBeInstanceOf(GastoDePagoRrhhError);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("cambiar sólo la nota sí se puede", async () => {
    h.gasto = gasto(300, MARCA);
    h.retiro = cajaAbierta(200);
    await GastoConCajaDB.corregirGasto("t1", "g1", { notes: "le pagué en la mañana" });
    expect(h.update).toHaveBeenCalledWith("t1", "g1", { notes: "le pagué en la mañana" });
    expect(h.movUpdate).not.toHaveBeenCalled();
  });

  it("un comprobante que sólo se parece (RRHH sin fecha) es un gasto común", async () => {
    h.gasto = gasto(300, "RRHH-ABC");
    h.retiro = cajaAbierta(300);
    await GastoConCajaDB.corregirGasto("t1", "g1", { amount: 310 });
    expect(h.movUpdate.mock.calls[0][0].data.amount).toBe(310);
  });
});
