/**
 * `AdelantosControlDB.controlar`, sin base: poner vencimiento o atar a un
 * permiso un adelanto ya dado. Con HEAD falla: la clase no existía.
 *
 * Lo que se prueba es lo que decide qué se le reclama a quién: el lock de la
 * fila antes de leer, sólo ABIERTO, el permiso con `tenantId` en el WHERE (uno
 * de otro negocio → 422, sin escribir), el día guardado como mediodía de Lima,
 * el rastro dentro de la transacción y la caché del balance de permisos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    adelanto: { findFirst: vi.fn(), updateMany: vi.fn() },
    forestContrato: { findFirst: vi.fn() },
    activityLog: { create: vi.fn() },
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { tx, prisma, invalidar: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: (...a: unknown[]) => H.invalidar(...a) }));
vi.mock("@/lib/finance/resultado-del-negocio", () => ({ claveCacheResultado: (t: string) => `resultado:${t}` }));

import { AdelantoNoControlableError, AdelantosControlDB } from "@/lib/db/adelantos-control.db";

/* Quispe Galindo Victor: S/ 17 000 del 03/08, sin fecha y sin permiso. */
const actual = (p: Record<string, unknown> = {}) => ({
  status: "ABIERTO",
  codigoOperacion: null,
  fechaAdelanto: new Date("2026-08-03T17:00:00.000Z"),
  fechaVencimiento: null,
  contratoId: null,
  contrato: null,
  ...p,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of [H.tx.$queryRaw, H.tx.adelanto.findFirst, H.tx.adelanto.updateMany, H.tx.forestContrato.findFirst]) m.mockReset();
  H.tx.$queryRaw.mockResolvedValue([{ id: "a17" }]);
  H.tx.adelanto.findFirst.mockResolvedValue(actual());
  H.tx.adelanto.updateMany.mockResolvedValue({ count: 1 });
});

describe("AdelantosControlDB.controlar", () => {
  it("pone la fecha como mediodía de Lima, con el rastro en la misma transacción", async () => {
    const r = await AdelantosControlDB.controlar("t1", "a17", { fechaVencimiento: "2026-10-15", usuario: "brandon" });
    expect(r).toEqual({ fechaVencimiento: "2026-10-15T17:00:00.000Z", contratoId: null, cambio: true });
    /* Lock ANTES de leer: el primer paso de la transacción es el FOR UPDATE de la fila, con tenant. */
    const sql = (H.tx.$queryRaw.mock.calls[0][0] as string[]).join("?");
    expect(sql).toMatch(/FROM "Adelanto" WHERE "id" = \? AND "tenantId" = \? FOR UPDATE/);
    expect(H.tx.$queryRaw.mock.calls[0].slice(1)).toEqual(["a17", "t1"]);
    expect(H.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(H.tx.adelanto.findFirst.mock.invocationCallOrder[0]);
    expect(H.tx.adelanto.updateMany).toHaveBeenCalledWith({
      where: { id: "a17", tenantId: "t1", status: "ABIERTO" },
      data: { fechaVencimiento: new Date("2026-10-15T17:00:00.000Z") },
    });
    expect(H.tx.activityLog.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "t1",
      action: "Controlar adelanto",
      entity: "adelanto",
      entityId: "a17",
      user: "brandon",
      detail: "a17: vence sin fecha → 15/10/2026.",
    });
    /* Sin cambio de permiso no se toca la caché de contratos. */
    expect(H.invalidar.mock.calls.map((c) => c[0])).toEqual(["resultado:t1:"]);
  });

  it.each(["LIQUIDADO", "CANCELADO", "EXCEDIDO"])("un adelanto %s → 409 no_abierto, sin escribir", async (status) => {
    H.tx.adelanto.findFirst.mockResolvedValue(actual({ status }));
    const e = await AdelantosControlDB.controlar("t1", "a17", { fechaVencimiento: "2026-10-15", usuario: "b" }).catch((x) => x);
    expect(e).toBeInstanceOf(AdelantoNoControlableError);
    expect(e).toMatchObject({ status: 409, code: "no_abierto" });
    expect(H.tx.adelanto.updateMany).not.toHaveBeenCalled();
    expect(H.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("un permiso de OTRO negocio → 422 contrato_ajeno; se buscó con el tenant en el WHERE", async () => {
    H.tx.forestContrato.findFirst.mockResolvedValue(null);
    const e = await AdelantosControlDB.controlar("t1", "a17", { contratoId: "ctr-de-otro", usuario: "b" }).catch((x) => x);
    expect(e).toMatchObject({ status: 422, code: "contrato_ajeno" });
    expect(H.tx.forestContrato.findFirst.mock.calls[0][0].where).toEqual({ id: "ctr-de-otro", tenantId: "t1", deletedAt: null });
    expect(H.tx.adelanto.updateMany).not.toHaveBeenCalled();
  });

  it("un permiso propio: se ata, el rastro lleva el código y se invalida el balance de permisos", async () => {
    H.tx.forestContrato.findFirst.mockResolvedValue({ id: "ctr1", codigo: "19-SEC/REG-PLT-2018-020" });
    const r = await AdelantosControlDB.controlar("t1", "a17", { contratoId: "ctr1", usuario: "b" });
    expect(r).toMatchObject({ contratoId: "ctr1", cambio: true });
    expect(H.tx.adelanto.updateMany.mock.calls[0][0].data).toEqual({ contratoId: "ctr1" });
    expect(H.tx.activityLog.create.mock.calls[0][0].data.detail).toBe("a17: permiso ninguno → 19-SEC/REG-PLT-2018-020.");
    expect(H.invalidar.mock.calls.map((c) => c[0])).toContain("forest-contrato:t1");
  });

  it("`contratoId: null` desata sin consultar contratos", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(actual({ contratoId: "ctr1", contrato: { codigo: "P-1" } }));
    await AdelantosControlDB.controlar("t1", "a17", { contratoId: null, usuario: "b" });
    expect(H.tx.forestContrato.findFirst).not.toHaveBeenCalled();
    expect(H.tx.adelanto.updateMany.mock.calls[0][0].data).toEqual({ contratoId: null });
  });

  it("`fechaVencimiento: null` quita la fecha", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(actual({ fechaVencimiento: new Date("2026-10-15T17:00:00.000Z") }));
    const r = await AdelantosControlDB.controlar("t1", "a17", { fechaVencimiento: null, usuario: "b" });
    expect(r).toMatchObject({ fechaVencimiento: null, cambio: true });
    expect(H.tx.adelanto.updateMany.mock.calls[0][0].data).toEqual({ fechaVencimiento: null });
  });

  it("antes del día en que se dio → 400, sin escribir", async () => {
    const e = await AdelantosControlDB.controlar("t1", "a17", { fechaVencimiento: "2026-08-02", usuario: "b" }).catch((x) => x);
    expect(e).toMatchObject({ status: 400, code: "vencimiento_invalido" });
    expect(H.tx.adelanto.updateMany).not.toHaveBeenCalled();
  });

  it("fecha inexistente → 400 antes de abrir la transacción", async () => {
    const e = await AdelantosControlDB.controlar("t1", "a17", { fechaVencimiento: "2026-02-30", usuario: "b" }).catch((x) => x);
    expect(e).toMatchObject({ status: 400 });
    expect(H.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ya estaba así: 200 sin escribir ni dejar rastro", async () => {
    H.tx.adelanto.findFirst.mockResolvedValue(actual({ fechaVencimiento: new Date("2026-10-15T17:00:00.000Z") }));
    const r = await AdelantosControlDB.controlar("t1", "a17", { fechaVencimiento: "2026-10-15", usuario: "b" });
    expect(r).toMatchObject({ cambio: false });
    expect(H.tx.adelanto.updateMany).not.toHaveBeenCalled();
    expect(H.tx.activityLog.create).not.toHaveBeenCalled();
    expect(H.invalidar).not.toHaveBeenCalled();
  });

  it("el adelanto de otro negocio: el lock no lo encuentra → null (la ruta da 404)", async () => {
    H.tx.$queryRaw.mockResolvedValue([]);
    expect(await AdelantosControlDB.controlar("t1", "de-otro", { fechaVencimiento: "2026-10-15", usuario: "b" })).toBeNull();
    expect(H.tx.adelanto.findFirst).not.toHaveBeenCalled();
  });

  it("se cerró entre el lock y el update (count 0) → 409", async () => {
    H.tx.adelanto.updateMany.mockResolvedValue({ count: 0 });
    const e = await AdelantosControlDB.controlar("t1", "a17", { fechaVencimiento: "2026-10-15", usuario: "b" }).catch((x) => x);
    expect(e).toMatchObject({ status: 409, code: "no_abierto" });
    expect(H.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("sin tenant no corre", async () => {
    await expect(AdelantosControlDB.controlar("", "a17", { fechaVencimiento: "2026-10-15", usuario: "b" })).rejects.toThrow(/tenantId/);
  });
});
