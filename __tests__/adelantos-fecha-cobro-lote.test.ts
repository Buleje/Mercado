import { describe, expect, it, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  adelanto: { findMany: vi.fn(), updateMany: vi.fn() },
  activityLog: { createMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));

import { fechaDeAtajo, finDeMes, repartirLote, sumarDias } from "@/lib/adelantos/fecha-cobro-lote";
import { AdelantosLoteDB } from "@/lib/db/adelantos-lote.db";

describe("atajos en hora de Lima", () => {
  it("a las 20:00 de Lima (01:00 UTC del día siguiente) cuenta desde el día de Lima", () => {
    const ahora = new Date("2026-10-26T01:00:00Z"); // 25-10 20:00 Lima
    expect(fechaDeAtajo("en-15", ahora)).toBe("2026-11-09");
    expect(fechaDeAtajo("en-30", ahora)).toBe("2026-11-24");
    expect(fechaDeAtajo("fin-de-mes", ahora)).toBe("2026-10-31");
  });
  it("fin de mes: febrero, bisiesto y diciembre", () => {
    expect(finDeMes("2026-02-10")).toBe("2026-02-28");
    expect(finDeMes("2028-02-10")).toBe("2028-02-29");
    expect(finDeMes("2026-12-31")).toBe("2026-12-31");
    expect(sumarDias("2026-12-20", 15)).toBe("2027-01-04");
  });
});

describe("repartirLote", () => {
  const base = { status: "ABIERTO", direccion: "DADO", modalidad: "CUENTA_CORRIENTE", fechaAdelanto: "2026-08-03T17:00:00Z" };
  it("solo ABIERTO y DADO; las cuotas pactadas y la fecha anterior al adelanto se omiten", () => {
    const r = repartirLote(
      [
        { id: "ok", ...base },
        { id: "liq", ...base, status: "LIQUIDADO" },
        { id: "rec", ...base, direccion: "RECIBIDO" },
        { id: "pac", ...base, modalidad: "ENTREGAS_PACTADAS" },
        { id: "antes", ...base, fechaAdelanto: "2026-12-01T17:00:00Z" },
      ],
      "2026-11-09",
    );
    expect(r.aplicar).toEqual(["ok"]);
    expect(r.omitidos.map((o) => o.motivo)).toEqual(["no_abierto", "no_dado", "entregas_pactadas", "antes_del_adelanto"]);
  });
});

describe("AdelantosLoteDB.ponerFechaDeCobro", () => {
  beforeEach(() => vi.clearAllMocks());
  const fila = (id: string, extra: Record<string, unknown> = {}) => ({
    id, status: "ABIERTO", direccion: "DADO", modalidad: "CUENTA_CORRIENTE", fechaAdelanto: new Date("2026-08-03"), fechaVencimiento: null, codigoOperacion: `ADL-${id}`, ...extra,
  });
  it("filtra por tenantId al leer y al escribir; un id ajeno no se toca", async () => {
    tx.adelanto.findMany.mockResolvedValueOnce([fila("a1")]).mockResolvedValueOnce([{ id: "a1" }]);
    tx.adelanto.updateMany.mockResolvedValue({ count: 1 });
    const r = await AdelantosLoteDB.ponerFechaDeCobro("t1", ["a1", "ajeno"], "2026-11-09", "qa");
    expect(tx.adelanto.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", direccion: "DADO" });
    expect(tx.adelanto.updateMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", status: "ABIERTO", id: { in: ["a1"] } });
    expect(r).toEqual({ actualizados: 1, omitidos: [{ id: "ajeno", motivo: "no_existe" }] });
  });
  it("la auditoría guarda antes → después por adelanto y solo de los que cambiaron", async () => {
    tx.adelanto.findMany
      .mockResolvedValueOnce([
        fila("a1", { fechaVencimiento: new Date("2026-08-15T17:00:00Z") }),
        fila("a2"),
        fila("a3", { fechaVencimiento: new Date("2026-11-09T17:00:00Z") }), // ya tenía ese día: no cambia
      ])
      .mockResolvedValueOnce([{ id: "a1" }]); // a2 se cerró entre la lectura y la escritura
    tx.adelanto.updateMany.mockResolvedValue({ count: 1 });
    const r = await AdelantosLoteDB.ponerFechaDeCobro("t1", ["a1", "a2", "a3"], "2026-11-09", "qa");
    expect(tx.adelanto.updateMany.mock.calls[0][0].where.id).toEqual({ in: ["a1", "a2"] });
    expect(r.actualizados).toBe(1);
    const filas = tx.activityLog.createMany.mock.calls[0][0].data;
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ tenantId: "t1", entityId: "a1", detail: "ADL-a1: vence 15/08/2026 → 09/11/2026." });
  });
  it("sin tenantId falla", async () => {
    await expect(AdelantosLoteDB.ponerFechaDeCobro("", ["a"], "2026-11-09", "qa")).rejects.toThrow();
  });
});
