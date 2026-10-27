/**
 * Adopción del Recorrido del permiso, lado DB (2.ª revisión de ADR-519).
 *
 *  · `loteVivoDeTrozas`: un lote se adopta sólo si TODAS las trozas del bloque
 *    están en él y no trae ninguna ajena. Uno armado a mano con una parte del
 *    bloque no ampara el bloque entero.
 *  · `ForestDistribucionesDB.save`: una pestaña vieja del cubicador no borra
 *    lo que el servidor anotó (`loteId`, `jornadasLibro`, `corridaIds`), y
 *    espera la clave con tope (`esperaMaxMs`) en vez de morir por el timeout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  trozas: [] as { id: string; loteAserrioId: string | null }[],
  lotes: [] as { id: string; code: string; vivo: boolean }[],
  kv: [] as unknown[],
  opciones: undefined as Record<string, unknown> | undefined,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn(), getOrSet: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    woodEntryTroza: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        H.trozas.filter((t) => where.id.in.includes(t.id)).map((t) => ({ loteAserrioId: t.loteAserrioId })),
      count: async ({ where }: { where: { loteAserrioId: string; id: { notIn: string[] } } }) =>
        H.trozas.filter((t) => t.loteAserrioId === where.loteAserrioId && !where.id.notIn.includes(t.id)).length,
    },
    forestLoteAserrio: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        const l = H.lotes.find((x) => x.id === where.id && x.vivo);
        return l ? { id: l.id, code: l.code } : null;
      },
    },
  },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async () => H.kv,
    actualizar: async (
      _key: string,
      cambio: (actual: unknown) => { valor?: unknown; resultado: unknown },
      _user: string,
      opciones?: Record<string, unknown>,
    ) => {
      H.opciones = opciones;
      const r = cambio(structuredClone(H.kv));
      if (r.valor !== undefined) H.kv = r.valor as unknown[];
      return r.resultado;
    },
  },
  ClaveOcupadaError: class extends Error {},
}));

import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ESPERA_GUARDAR_MS, ForestDistribucionesDB } from "@/lib/db/forest-distribuciones.db";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";

const T = "t-qa";

describe("loteVivoDeTrozas: todo el bloque en UN lote, y nada más", () => {
  beforeEach(() => {
    H.lotes = [{ id: "L1", code: "LA-1", vivo: true }];
  });

  it("las 4 trozas del bloque en el lote L1, sin ajenas → lo adopta", async () => {
    H.trozas = ["a", "b", "c", "d"].map((id) => ({ id, loteAserrioId: "L1" }));
    expect(await ForestLoteAserrioDB.loteVivoDeTrozas(T, ["a", "b", "c", "d"])).toEqual({ id: "L1", code: "LA-1" });
  });

  it("un lote armado a mano con 2 de las 4 → NO (antes se adoptaba: las sin lote no contaban)", async () => {
    H.trozas = [
      { id: "a", loteAserrioId: "L1" },
      { id: "b", loteAserrioId: "L1" },
      { id: "c", loteAserrioId: null },
      { id: "d", loteAserrioId: null },
    ];
    expect(await ForestLoteAserrioDB.loteVivoDeTrozas(T, ["a", "b", "c", "d"])).toBeNull();
  });

  it("una troza pedida que no existe, una pieza ajena en el lote o el lote anulado → NO", async () => {
    H.trozas = ["a", "b"].map((id) => ({ id, loteAserrioId: "L1" }));
    expect(await ForestLoteAserrioDB.loteVivoDeTrozas(T, ["a", "b", "zz"])).toBeNull();
    H.trozas.push({ id: "x", loteAserrioId: "L1" });
    expect(await ForestLoteAserrioDB.loteVivoDeTrozas(T, ["a", "b"])).toBeNull();
    H.trozas = ["a", "b"].map((id) => ({ id, loteAserrioId: "L1" }));
    H.lotes[0].vivo = false;
    expect(await ForestLoteAserrioDB.loteVivoDeTrozas(T, ["a", "b"])).toBeNull();
  });
});

describe("save: un guardado viejo no borra lo que anotó el servidor", () => {
  const bloque = (x: Partial<BloqueRolliza> = {}): BloqueRolliza =>
    ({ id: "b1", etiqueta: "B1", especie: "Cachimbo", m3: 2, origen: "trozas", trozaIds: ["t1", "t2"], ...x }) as BloqueRolliza;
  const jornada = (dia: number, corridaId: string, lineNo: number) => ({ dia, corridaId, lineNo, estado: "declarada" as const, fecha: "2026-10-20" });
  const guardar = (b: BloqueRolliza) =>
    ForestDistribucionesDB.save(T, { id: "d1", nombre: "Octubre", bloques: [b] } as Parameters<typeof ForestDistribucionesDB.save>[1]);

  beforeEach(async () => {
    H.kv = [];
    await guardar(bloque());
    const d = H.kv[0] as { bloques: BloqueRolliza[] };
    d.bloques[0] = { ...d.bloques[0], loteId: "L1", corridaIds: ["c31"], jornadasLibro: [jornada(1, "c31", 31)] };
  });

  it("la pestaña vieja manda el bloque sin lote ni jornadas → se conservan", async () => {
    const r = await guardar(bloque({ m3: 2.5 }));
    expect(r.bloques[0]).toMatchObject({ m3: 2.5, loteId: "L1", corridaIds: ["c31"], jornadasLibro: [jornada(1, "c31", 31)] });
  });

  it("las jornadas se unen por día; en el mismo día gana la de N° más alto", async () => {
    const r = await guardar(bloque({ jornadasLibro: [jornada(1, "c20", 20), jornada(2, "c32", 32)] }));
    expect(r.bloques[0].jornadasLibro).toEqual([jornada(1, "c31", 31), jornada(2, "c32", 32)]);
    const r2 = await guardar(bloque({ jornadasLibro: [jornada(1, "c40", 40)] }));
    expect(r2.bloques[0].jornadasLibro?.[0]).toEqual(jornada(1, "c40", 40));
  });

  it("otro lote a propósito manda el entrante; y el guardado espera la clave con tope", async () => {
    const r = await guardar(bloque({ loteId: "L2" }));
    expect(r.bloques[0].loteId).toBe("L2");
    expect(H.opciones).toMatchObject({ esperaMaxMs: ESPERA_GUARDAR_MS });
    expect(Number(H.opciones?.timeout)).toBeGreaterThan(ESPERA_GUARDAR_MS);
  });
});
