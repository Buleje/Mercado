/**
 * __tests__/adelantos-entrega-caja.test.ts
 *
 * La caja anota el importe de LA entrega que se acaba de registrar.
 *
 * Encontrado al leer para ADR-413: `registrarEntrega` mandaba a la caja
 * `resultado.entregas[0].valor`, e `INCLUDE_FULL` ordena las entregas por
 * `fecha desc`. Una entrega registrada con fecha PASADA no es la primera de la
 * lista: la caja recibía el importe de OTRA entrega — S/ 999 en el arqueo por
 * una entrega de S/ 50.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const moverCaja = vi.fn();
const tx = {
  $queryRaw: vi.fn(),
  adelanto: { findFirst: vi.fn(), update: vi.fn() },
  adelantoEntrega: { create: vi.fn(), aggregate: vi.fn() },
  product: { findFirst: vi.fn(), updateMany: vi.fn() },
  adelantoEntregaPactada: { updateMany: vi.fn() },
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

import { AdelantosDB } from "@/lib/db/adelantos.db";

const ahora = new Date("2026-09-14T15:00:00.000Z");
const entregaFila = (id: string, valor: number, fecha: string) => ({
  id,
  adelantoId: "a1",
  fecha: new Date(fecha),
  tipo: "LIBRE",
  descripcion: null,
  productId: null,
  cantidad: null,
  valor,
  sumadoAStock: false,
  notas: null,
  comprobanteUrl: null,
  liquidacionId: null,
  anuladaAt: null,
  createdAt: ahora,
});

beforeEach(() => {
  vi.clearAllMocks();
  tx.$queryRaw.mockResolvedValue([{ id: "a1" }]);
  const adelanto = {
    id: "a1",
    tenantId: "t1",
    codigoOperacion: "ADL-2026-0001",
    reciboManual: null,
    beneficiarioId: "b1",
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 2000,
    moneda: "PEN",
    fechaAdelanto: ahora,
    fechaVencimiento: null,
    status: "ABIERTO",
    saldoPendiente: 1001,
    notas: null,
    comprobanteUrl: null,
    piesTablares: null,
    piesTablaresTipo: null,
    createdAt: ahora,
    updatedAt: ahora,
  };
  tx.adelanto.findFirst
    // 1ª lectura: el adelanto a bloquear.
    .mockResolvedValueOnce(adelanto)
    // 2ª lectura: con INCLUDE_FULL, entregas por fecha DESC — la de hoy (S/ 999)
    // queda primera y la recién registrada con fecha pasada (S/ 50), segunda.
    .mockResolvedValueOnce({
      ...adelanto,
      saldoPendiente: 951,
      beneficiario: { id: "b1", nombre: "Juana", documento: null, telefono: null, notas: null, createdAt: ahora },
      entregas: [entregaFila("otra", 999, "2026-09-14T14:00:00.000Z"), entregaFila("nueva", 50, "2026-08-01T17:00:00.000Z")],
      entregasPactadas: [],
    });
  tx.adelantoEntrega.create.mockResolvedValue(entregaFila("nueva", 50, "2026-08-01T17:00:00.000Z"));
  tx.adelantoEntrega.aggregate.mockResolvedValue({ _sum: { valor: 1049 } });
  moverCaja.mockResolvedValue({ sinCaja: false, movimientoId: "m1" });
});

describe("registrarEntrega — la caja", () => {
  it("anota el valor de la entrega registrada, aunque tenga fecha pasada", async () => {
    await AdelantosDB.registrarEntrega("t1", "a1", {
      tipo: "LIBRE",
      valorManual: 50,
      fecha: "2026-08-01T12:00:00-05:00",
      metodoCaja: "efectivo",
    });
    expect(moverCaja).toHaveBeenCalledTimes(1);
    expect(moverCaja.mock.calls[0][1]).toMatchObject({ tipo: "ingreso", monto: 50, metodo: "efectivo" });
  });

  it("bloquea el adelanto y recalcula el saldo sólo con las entregas vivas", async () => {
    await AdelantosDB.registrarEntrega("t1", "a1", { tipo: "LIBRE", valorManual: 50 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.adelantoEntrega.aggregate.mock.calls[0][0]).toMatchObject({ where: { adelantoId: "a1", anuladaAt: null } });
    expect(tx.adelanto.update.mock.calls[0][0]).toMatchObject({ data: { saldoPendiente: 951, status: "ABIERTO" } });
    expect(moverCaja).not.toHaveBeenCalled();
  });
});
