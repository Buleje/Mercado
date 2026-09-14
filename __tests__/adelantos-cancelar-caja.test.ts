/**
 * __tests__/adelantos-cancelar-caja.test.ts
 *
 * Anular un adelanto devuelve a la caja UNA vez, y lo que de verdad debía.
 *
 * Encontrado en la revisión de ADR-413: `cancel` leía el saldo sin lock y
 * mandaba ese número a la caja. Con una liquidación de cuenta bloqueando el
 * adelanto y bajándole el saldo, la anulación devolvía el saldo de antes; y
 * anular dos veces volvía a meter la plata en el cajón.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const moverCaja = vi.fn();
let estado = "ABIERTO";
let saldo = 300;
const ahora = new Date("2026-09-14T15:00:00.000Z");
const fila = () => ({
  id: "a1",
  tenantId: "t1",
  codigoOperacion: "ADL-2026-0001",
  reciboManual: null,
  beneficiarioId: "b1",
  modalidad: "CUENTA_CORRIENTE",
  montoAdelantado: 500,
  moneda: "PEN",
  fechaAdelanto: ahora,
  fechaVencimiento: null,
  status: estado,
  saldoPendiente: saldo,
  notas: null,
  comprobanteUrl: null,
  piesTablares: null,
  piesTablaresTipo: null,
  createdAt: ahora,
  updatedAt: ahora,
  beneficiario: { id: "b1", nombre: "Juana", documento: null, telefono: null, notas: null, createdAt: ahora },
  entregas: [],
  entregasPactadas: [],
});
const tx = {
  $queryRaw: vi.fn(),
  adelanto: {
    findFirst: vi.fn(async () => fila()),
    updateMany: vi.fn(async ({ where }: { where: { status?: { notIn?: string[] } } }) => {
      if (where.status?.notIn?.includes(estado)) return { count: 0 };
      estado = "CANCELADO";
      return { count: 1 };
    }),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/adelantos/movimiento-caja", () => ({
  moverCaja: (...a: unknown[]) => moverCaja(...a),
  etiquetaEgreso: () => "egreso",
  etiquetaIngreso: () => "ingreso",
  etiquetaReversion: () => "reversion",
}));

import { AdelantosDB, AdelantoNoCancelableError } from "@/lib/db/adelantos.db";

beforeEach(() => {
  vi.clearAllMocks();
  estado = "ABIERTO";
  saldo = 300;
  tx.$queryRaw.mockResolvedValue([{ id: "a1" }]);
  moverCaja.mockResolvedValue({ sinCaja: false, movimientoId: "m1" });
});

describe("cancel — la caja", () => {
  it("cancelar dos veces mueve la caja una sola vez", async () => {
    await AdelantosDB.cancel("t1", "a1", "efectivo");
    await expect(AdelantosDB.cancel("t1", "a1", "efectivo")).rejects.toBeInstanceOf(AdelantoNoCancelableError);
    expect(moverCaja).toHaveBeenCalledTimes(1);
    expect(moverCaja.mock.calls[0][1]).toMatchObject({ tipo: "ingreso", monto: 300, metodo: "efectivo" });
  });

  it("devuelve el saldo releído DESPUÉS del lock, no uno leído antes", async () => {
    /* Una liquidación bajó el saldo mientras la anulación esperaba el lock. */
    tx.$queryRaw.mockImplementation(async () => {
      saldo = 120;
      return [{ id: "a1" }];
    });
    await AdelantosDB.cancel("t1", "a1", "efectivo");
    expect(moverCaja.mock.calls[0][1]).toMatchObject({ monto: 120 });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.adelanto.findFirst.mock.invocationCallOrder[0]);
  });

  it("un adelanto ya liquidado no se anula ni mueve la caja", async () => {
    estado = "LIQUIDADO";
    saldo = 0;
    await expect(AdelantosDB.cancel("t1", "a1", "efectivo")).rejects.toThrow("ya se liquidó entero");
    expect(tx.adelanto.updateMany).not.toHaveBeenCalled();
    expect(moverCaja).not.toHaveBeenCalled();
  });

  it("sin devolución pedida no toca la caja, y uno que no existe devuelve null", async () => {
    await AdelantosDB.cancel("t1", "a1");
    expect(moverCaja).not.toHaveBeenCalled();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(AdelantosDB.cancel("t1", "otro", "efectivo")).resolves.toBeNull();
  });
});
