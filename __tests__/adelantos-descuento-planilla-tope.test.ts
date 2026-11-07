/**
 * `AdelantosDB.registrarEntregaEnTx` con un descuento de planilla (revisión
 * 24-10 del pago de la semana): el modal viejo de «Descuentos de planilla»,
 * abierto antes de pagar el sábado, volvía a descontar lo que el pago ya
 * descontó. Bajo el lock del adelanto: nunca más que el saldo, y nunca otro
 * descuento para una semana que el pago ya cerró.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conceptoDelPeriodo } from "@/lib/adelantos/planilla-lote";
import { periodoDelDescuento } from "@/lib/rrhh/descuentos-planilla";

const H = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    adelanto: { findFirst: vi.fn(), update: vi.fn() },
    adelantoEntrega: { findFirst: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/contrato-propio.db", () => ({ contratoPropio: async () => null, contratoVigente: async () => null }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: { getParte: vi.fn() } }));

import { AdelantosDB, DescuentoDePlanillaError } from "@/lib/db/adelantos.db";
import type { Prisma } from "@/lib/generated/prisma/client";

const tx = H.tx as unknown as Prisma.TransactionClient;
const CONCEPTO = conceptoDelPeriodo(periodoDelDescuento("2026-10-19", "2026-10-25"));

/** Un adelanto de planilla DADO de 50 con `saldo` por descontar. */
const adelanto = (saldo: number) => ({
  id: "a1", tenantId: "t1", beneficiarioId: "b1", direccion: "DADO", modalidad: "DESCUENTO_PLANILLA",
  montoAdelantado: 50, saldoPendiente: saldo, status: saldo > 0 ? "ABIERTO" : "LIQUIDADO", codigoOperacion: "ADL-1",
});

beforeEach(() => {
  vi.clearAllMocks();
  H.tx.$queryRaw.mockResolvedValue([{ id: "a1" }]);
  H.tx.adelantoEntrega.findFirst.mockResolvedValue(null);
  H.tx.adelantoEntrega.create.mockResolvedValue({ id: "e1" });
  H.tx.adelantoEntrega.aggregate.mockResolvedValue({ _sum: { valor: 50 } });
  H.tx.adelanto.update.mockResolvedValue({});
});

describe("descuento de planilla: nunca dos veces", () => {
  it("con el pago del sábado ya hecho (saldo 0), el modal viejo no vuelve a descontar", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(adelanto(0));
    const err = await AdelantosDB.registrarEntregaEnTx(tx, "t1", "a1", { tipo: "LIBRE", valorManual: 50, descripcion: CONCEPTO }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DescuentoDePlanillaError);
    expect(err).toMatchObject({ status: 400, code: "descuento_excede_saldo" });
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
  });

  it("más que el saldo no; hasta el saldo sí", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(adelanto(30));
    await expect(
      AdelantosDB.registrarEntregaEnTx(tx, "t1", "a1", { tipo: "LIBRE", valorManual: 50, descripcion: CONCEPTO }),
    ).rejects.toThrow(/Debe S\/ 30\.00/);
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
    const r = await AdelantosDB.registrarEntregaEnTx(tx, "t1", "a1", { tipo: "LIBRE", valorManual: 30, descripcion: CONCEPTO });
    expect(r?.entregaId).toBe("e1");
  });

  it("la semana que el pago ya descontó: 409 aunque quede saldo, buscado con el negocio y la persona", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(adelanto(50));
    H.tx.adelantoEntrega.findFirst.mockResolvedValue({ id: "e-del-pago" });
    const err = await AdelantosDB.registrarEntregaEnTx(tx, "t1", "a1", { tipo: "LIBRE", valorManual: 20, descripcion: CONCEPTO }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: "semana_ya_pagada" });
    expect(H.tx.adelantoEntrega.findFirst.mock.calls[0][0].where).toMatchObject({
      anuladaAt: null,
      descripcion: { equals: CONCEPTO, mode: "insensitive" },
      idempotencyKey: { startsWith: "rrhh-pago:" },
      adelanto: { tenantId: "t1", beneficiarioId: "b1", direccion: "DADO" },
    });
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
  });

  it("el concepto escrito en minúsculas es el mismo descuento: también se frena", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(adelanto(30));
    await expect(
      AdelantosDB.registrarEntregaEnTx(tx, "t1", "a1", { tipo: "LIBRE", valorManual: 50, descripcion: CONCEPTO.toLowerCase() }),
    ).rejects.toMatchObject({ status: 400, code: "descuento_excede_saldo" });
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
  });

  it("el descuento del propio pago (clave rrhh-pago:) pasa: no se frena a sí mismo", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(adelanto(50));
    const r = await AdelantosDB.registrarEntregaEnTx(tx, "t1", "a1", {
      tipo: "LIBRE", valorManual: 50, descripcion: CONCEPTO, idempotencyKey: "rrhh-pago:g1:a1",
    });
    expect(r?.entregaId).toBe("e1");
    // Una sola búsqueda: la de la idempotencia (no la de «semana ya pagada»).
    expect(H.tx.adelantoEntrega.findFirst).toHaveBeenCalledTimes(1);
    expect(H.tx.adelantoEntrega.findFirst.mock.calls[0][0].where).toEqual({ adelantoId: "a1", idempotencyKey: "rrhh-pago:g1:a1" });
  });

  it("una entrega que no es de planilla sigue como antes (la regla es sólo del descuento)", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(adelanto(30));
    const r = await AdelantosDB.registrarEntregaEnTx(tx, "t1", "a1", { tipo: "LIBRE", valorManual: 50, descripcion: "Devolvió en efectivo" });
    expect(r?.entregaId).toBe("e1");
  });
});
