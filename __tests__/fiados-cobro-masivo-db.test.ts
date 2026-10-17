/**
 * Cobro masivo de fiados: reparto en céntimos y entrada a la caja.
 *
 * - `repartirCobroMasivo`: más viejo primero, a céntimos (sin el resto de
 *   3,5e-15 que anotaba cuotas de S/ 0,00), sobrante aparte.
 * - `FiadosDB.cobroMasivo`: el servidor reparte con los saldos leídos dentro
 *   de la tx, guard `saldo >= pago` en el WHERE, locks en orden de id, y la
 *   caja como ÚLTIMO paso (un ingreso por cliente, con su medio).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { repartirCobroMasivo } from "@/lib/fiados/reparto-cobro-masivo";

type FilaFiado = { id: string; tenantId: string; customerId: string; saldo: number; status: string; createdAt: Date };

const { estado, txMock, mockMoverCaja } = vi.hoisted(() => {
  const estado = { filas: [] as FilaFiado[], log: [] as string[], conflicto: false };
  const txMock = {
    fiado: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; tenantId: string } }) =>
        estado.filas.filter((f) => where.id.in.includes(f.id) && f.tenantId === where.tenantId).map((f) => ({ ...f }))),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; tenantId: string; saldo: { gte: number } }; data: { saldo: { decrement: number } } }) => {
        estado.log.push(`fiado:${where.id}`);
        const f = estado.filas.find((x) => x.id === where.id && x.tenantId === where.tenantId);
        if (estado.conflicto || !f || f.saldo < where.saldo.gte) return { count: 0 };
        f.saldo = Math.round((f.saldo - data.saldo.decrement) * 100) / 100;
        return { count: 1 };
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const f = estado.filas.find((x) => x.id === where.id);
        return f ? { saldo: f.saldo } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const f = estado.filas.find((x) => x.id === where.id);
        if (f) f.status = data.status;
        return {};
      }),
    },
    fiadoCuota: {
      create: vi.fn(async ({ data }: { data: { fiadoId: string; monto: number } }) => {
        estado.log.push(`cuota:${data.fiadoId}:${data.monto}`);
        return { id: `c-${data.fiadoId}` };
      }),
    },
    customer: {
      findMany: vi.fn(async () => [
        { phone: "900000001", name: "Rosa Pérez " },
        { phone: "900000002", name: "Juan Soto" },
      ]),
    },
  };
  const mockMoverCaja = vi.fn(async (_tx: unknown, _tenantId: string, op: { monto: number; metodo: string; etiqueta: string }): Promise<{ sinCaja: boolean; movimientoId?: string }> => {
    estado.log.push(`caja:${op.monto}:${op.metodo}`);
    return { sinCaja: false, movimientoId: `m-${estado.log.length}` };
  });
  return { estado, txMock, mockMoverCaja };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock) },
}));
vi.mock("@/lib/adelantos/movimiento-caja", () => ({ moverCajaEnTx: mockMoverCaja }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const T = "tenant-a";
const fila = (id: string, customerId: string, saldo: number, dia: number, extra: Partial<FilaFiado> = {}): FilaFiado => ({
  id, tenantId: T, customerId, saldo, status: "ACTIVO", createdAt: new Date(Date.UTC(2026, 9, dia)), ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  estado.log = [];
  estado.conflicto = false;
});

describe("repartirCobroMasivo (vista previa y servidor)", () => {
  it("más viejo primero y a céntimos: 50 sobre 33.30 + 40 = 33.30 y 16.70, sin restos de float", () => {
    const r = repartirCobroMasivo(
      [{ id: "b", saldo: 40, createdAt: "2026-10-05" }, { id: "a", saldo: 33.3, createdAt: "2026-10-01" }],
      50,
    );
    expect(r.pagos).toEqual([
      { fiadoId: "a", pago: 33.3, saldo: 33.3, completo: true },
      { fiadoId: "b", pago: 16.7, saldo: 40, completo: false },
    ]);
    expect(r.cobrado).toBe(50);
    expect(r.sobrante).toBe(0);
  });

  it("10.10 + 20.20 + 0.10 cobrados con 30.40 suman exacto (sin 30.399999…)", () => {
    const r = repartirCobroMasivo(
      [{ id: "a", saldo: 10.1, createdAt: "2026-01-01" }, { id: "b", saldo: 20.2, createdAt: "2026-01-02" }, { id: "c", saldo: 0.1, createdAt: "2026-01-03" }],
      30.4,
    );
    expect(r.pagos.map((p) => p.pago)).toEqual([10.1, 20.2, 0.1]);
    expect(r.cobrado).toBe(30.4);
  });

  it("lo que sobra no se cobra y los fiados sin saldo se saltan", () => {
    const r = repartirCobroMasivo([{ id: "a", saldo: 0, createdAt: "2026-01-01" }, { id: "b", saldo: 12.5, createdAt: "2026-01-02" }], 20);
    expect(r.pagos).toEqual([{ fiadoId: "b", pago: 12.5, saldo: 12.5, completo: true }]);
    expect(r.cobrado).toBe(12.5);
    expect(r.sobrante).toBe(7.5);
  });

  it("a igual fecha manda el id, para que la ventana y el servidor elijan igual", () => {
    const r = repartirCobroMasivo([{ id: "z", saldo: 5, createdAt: "2026-01-01" }, { id: "m", saldo: 5, createdAt: "2026-01-01" }], 5);
    expect(r.pagos.map((p) => p.fiadoId)).toEqual(["m"]);
  });
});

describe("FiadosDB.cobroMasivo — reparto en el servidor y caja", () => {
  it("reparte con los saldos de la tx, bloquea en orden de id y la caja va AL FINAL, una por cliente", async () => {
    estado.filas = [
      fila("f-z", "900000001", 30, 1), // el más viejo, pero id mayor
      fila("f-a", "900000002", 20, 2),
      fila("f-m", "900000001", 15, 3),
    ];
    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const r = await FiadosDB.cobroMasivo(T, { fiadoIds: ["f-z", "f-a", "f-m"], monto: 57.5 }, "Yape · Cobro masivo", { metodo: "yape" });

    // Reparto: f-z 30 (pagado), f-a 20 (pagado), f-m 7.50 (abono).
    expect(r.cobrado).toBe(57.5);
    expect(r.sobrante).toBe(0);
    expect(Object.fromEntries(r.resultados.map((x) => [x.fiadoId, [x.montoPagado, x.status, x.nuevoSaldo]]))).toEqual({
      "f-z": [30, "PAGADO", 0], "f-a": [20, "PAGADO", 0], "f-m": [7.5, "ACTIVO", 7.5],
    });
    // Locks de fiados en orden de id (f-a, f-m, f-z) y la caja sólo después.
    expect(estado.log.filter((l) => l.startsWith("fiado:"))).toEqual(["fiado:f-a", "fiado:f-m", "fiado:f-z"]);
    const primeraCaja = estado.log.findIndex((l) => l.startsWith("caja:"));
    expect(primeraCaja).toBe(estado.log.length - 2);
    // Un ingreso por cliente: Rosa 30 + 7.50 = 37.50, Juan 20, con el medio elegido.
    expect(mockMoverCaja).toHaveBeenCalledTimes(2);
    const ingresos = mockMoverCaja.mock.calls.map((c) => ({ tenant: c[1], ...c[2] }));
    expect(ingresos).toEqual(expect.arrayContaining([
      { tenant: T, tipo: "ingreso", monto: 37.5, metodo: "yape", etiqueta: "Cobro de fiado · Rosa Pérez" },
      { tenant: T, tipo: "ingreso", monto: 20, metodo: "yape", etiqueta: "Cobro de fiado · Juan Soto" },
    ]));
    expect(r.caja).toEqual({ sinCaja: false, movimientos: 2 });
    // El guard anti-sobrecobro va en el WHERE, con el tenant.
    expect(txMock.fiado.updateMany.mock.calls[0][0].where).toMatchObject({ tenantId: T, status: { in: ["ACTIVO", "VENCIDO"] }, saldo: { gte: 20 } });
  });

  it("sin caja abierta el cobro igual se guarda y avisa sinCaja (un solo intento de caja)", async () => {
    estado.filas = [fila("f-1", "900000001", 10, 1), fila("f-2", "900000002", 10, 2)];
    mockMoverCaja.mockResolvedValueOnce({ sinCaja: true });
    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const r = await FiadosDB.cobroMasivo(T, { fiadoIds: ["f-1", "f-2"], monto: 20 }, "Cobro masivo", { metodo: "efectivo" });
    expect(r.cobrado).toBe(20);
    expect(txMock.fiadoCuota.create).toHaveBeenCalledTimes(2);
    expect(mockMoverCaja).toHaveBeenCalledTimes(1);
    expect(r.caja).toEqual({ sinCaja: true, movimientos: 0 });
  });

  it("sin «a la caja» no toca la caja", async () => {
    estado.filas = [fila("f-1", "900000001", 10, 1)];
    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const r = await FiadosDB.cobroMasivo(T, { fiadoIds: ["f-1"], monto: 4 });
    expect(mockMoverCaja).not.toHaveBeenCalled();
    expect(r.caja).toBeUndefined();
    expect(estado.log).toContain("cuota:f-1:4");
  });

  it("si otro cobro movió el saldo: 409 (FiadoConflictError) y la caja ni se toca", async () => {
    estado.filas = [fila("f-1", "900000001", 10, 1)];
    estado.conflicto = true;
    const { FiadosDB, FiadoConflictError } = await import("@/lib/db/fiados.db");
    await expect(FiadosDB.cobroMasivo(T, { fiadoIds: ["f-1"], monto: 10 }, undefined, { metodo: "efectivo" })).rejects.toBeInstanceOf(FiadoConflictError);
    expect(mockMoverCaja).not.toHaveBeenCalled();
  });

  it("un fiado de OTRO negocio o ya pagado no se cobra (FiadoNoCobrableError)", async () => {
    estado.filas = [fila("f-ajeno", "900000001", 10, 1, { tenantId: "tenant-b" }), fila("f-pag", "900000001", 0, 1, { status: "PAGADO" })];
    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const { FiadoNoCobrableError } = await import("@/lib/fiados/reparto-cobro-masivo");
    await expect(FiadosDB.cobroMasivo(T, { fiadoIds: ["f-ajeno"], monto: 5 })).rejects.toBeInstanceOf(FiadoNoCobrableError);
    await expect(FiadosDB.cobroMasivo(T, { fiadoIds: ["f-pag"], monto: 5 })).rejects.toBeInstanceOf(FiadoNoCobrableError);
    expect(txMock.fiado.updateMany).not.toHaveBeenCalled();
  });

  it("contrato viejo (payments): un resto de 3.5e-15 no anota una cuota de S/ 0,00 y el monto se topa al saldo", async () => {
    estado.filas = [fila("f-1", "900000001", 33.3, 1), fila("f-2", "900000001", 40, 2)];
    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const r = await FiadosDB.cobroMasivo(T, [{ fiadoId: "f-1", monto: 99 }, { fiadoId: "f-2", monto: 3.5e-15 }]);
    expect(r.resultados).toHaveLength(1);
    expect(r.cobrado).toBe(33.3);
    expect(estado.log).toEqual(["fiado:f-1", "cuota:f-1:33.3"]);
  });
});
