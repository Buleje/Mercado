/**
 * Cubicaciones ligadas al libro (ADR-445): lo que el guardado NO puede perder.
 *
 *  · el tope de 300 descarta las SUELTAS más viejas, nunca una ligada;
 *  · re-guardar desde el cubicador (que no manda corridas) conservaba nada: el
 *    registro quedaba sin su hilo al libro;
 *  · una corrida de OTRO negocio, anulada o que no es de producción no se liga:
 *    el `tenantId` va en el WHERE (ownership), no en un `if` después;
 *  · el guardado es leer-modificar-escribir bajo lock (`PlatformSettingsDB.actualizar`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  /** Corridas «de la base»: con su tenant, sección y estado. */
  corridas: [] as { id: string; tenantId: string; section: string; status: string; deletedAt: Date | null }[],
  wheres: [] as unknown[],
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));
vi.mock("@/lib/db/platform-settings.db", () => {
  type W = { tenantId: string; id: { in: string[] }; section: string; status: string; deletedAt: null };
  const tx = {
    forestCtpEntry: {
      findMany: async ({ where }: { where: W }) => {
        H.wheres.push(where);
        return H.corridas
          .filter(
            (c) =>
              c.tenantId === where.tenantId &&
              where.id.in.includes(c.id) &&
              c.section === where.section &&
              c.status === where.status &&
              c.deletedAt === null,
          )
          .map((c) => ({ id: c.id }));
      },
    },
  };
  return {
    PlatformSettingsDB: {
      get: async (k: string) => H.kv.get(k) ?? null,
      getFresco: async (k: string) => JSON.parse(JSON.stringify(H.kv.get(k) ?? null)),
      set: async (k: string, v: unknown) => void H.kv.set(k, v),
      actualizar: async (
        k: string,
        cambio: (actual: unknown, t: typeof tx) => Promise<{ valor?: unknown; resultado: unknown }>,
      ) => {
        const r = await cambio(JSON.parse(JSON.stringify(H.kv.get(k) ?? null)), tx);
        if (r.valor !== undefined) H.kv.set(k, JSON.parse(JSON.stringify(r.valor)));
        return r.resultado;
      },
    },
  };
});

import {
  CubicacionDesactualizadaError,
  CubicacionVinculoError,
  corridasAlGuardar,
  ForestCubicacionesDB,
  MAX_GUARDADAS,
  recortarAlTope,
} from "@/lib/db/forest-cubicaciones.db";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

const T = "tenant-a";
const OTRO = "tenant-b";
const pieza = { cantidad: 10, espesor: 1, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" };

const registro = (id: string, updatedAt: string, ctpEntryIds?: string[]): CubicacionRegistro => ({
  id,
  nombre: id,
  fecha: "2026-09-27",
  precioPt: 0,
  valor: 0,
  totales: { piezas: 1, pieTablar: 1, m3: 0.0024 },
  piezas: [],
  ...(ctpEntryIds ? { ctpEntryId: ctpEntryIds[0], ctpEntryIds } : {}),
  createdAt: updatedAt,
  updatedAt,
});

beforeEach(() => {
  H.kv.clear();
  H.wheres.length = 0;
  H.audit.mockClear();
  H.corridas = [
    { id: "c-a1", tenantId: T, section: "produccion", status: "registrado", deletedAt: null },
    { id: "c-a2", tenantId: T, section: "produccion", status: "registrado", deletedAt: null },
    { id: "c-anulada", tenantId: T, section: "produccion", status: "anulado", deletedAt: null },
    { id: "c-despacho", tenantId: T, section: "despacho", status: "registrado", deletedAt: null },
    { id: "c-b1", tenantId: OTRO, section: "produccion", status: "registrado", deletedAt: null },
  ];
});

describe("recortarAlTope — el tope nunca descarta una ligada", () => {
  it("saca las sueltas más viejas y deja las ligadas aunque sean las más viejas", () => {
    const lista = [
      registro("nueva", "2026-09-27T10:00:00Z"),
      registro("suelta-vieja", "2026-01-01T00:00:00Z"),
      registro("ligada-vieja", "2025-01-01T00:00:00Z", ["c-a1"]),
    ];
    expect(recortarAlTope(lista, 2).map((c) => c.id)).toEqual(["nueva", "ligada-vieja"]);
  });

  it("si todas las que sobran están ligadas, la lista queda por encima del tope", () => {
    const lista = [registro("a", "2026-09-03", ["x"]), registro("b", "2026-09-02", ["y"]), registro("c", "2026-09-01", ["z"])];
    expect(recortarAlTope(lista, 2)).toHaveLength(3);
  });

  it("el tope de la planta sigue siendo 300", () => {
    expect(MAX_GUARDADAS).toBe(300);
  });
});

describe("corridasAlGuardar — las corridas se suman, no se pierden", () => {
  it("sin corridas en el pedido se conservan las que tenía", () => {
    expect(corridasAlGuardar({ ctpEntryId: "a", ctpEntryIds: ["a", "b"] }, {})).toEqual({ todas: ["a", "b"], nuevas: [] });
  });
  it("con corridas se agregan (y sólo las nuevas se validan)", () => {
    expect(corridasAlGuardar({ ctpEntryId: "a" }, { ctpEntryIds: ["a", "c"] })).toEqual({ todas: ["a", "c"], nuevas: ["c"] });
  });
});

describe("ForestCubicacionesDB.save — validación del hilo al libro", () => {
  it("liga una corrida viva del tenant", async () => {
    const r = await ForestCubicacionesDB.save(T, { nombre: "Día 27/09", piezas: [pieza], ctpEntryIds: ["c-a1"] }, "qa");
    expect(r.ctpEntryIds).toEqual(["c-a1"]);
    expect(r.ctpEntryId).toBe("c-a1");
  });

  it("una corrida de OTRO negocio se rechaza, y el tenant iba en el WHERE", async () => {
    await expect(
      ForestCubicacionesDB.save(T, { nombre: "x", piezas: [pieza], ctpEntryIds: ["c-a1", "c-b1"] }, "qa"),
    ).rejects.toBeInstanceOf(CubicacionVinculoError);
    expect(H.wheres[0]).toMatchObject({ tenantId: T, section: "produccion", status: "registrado", deletedAt: null });
    expect(H.kv.size).toBe(0);
  });

  it("una anulada o una línea de despacho tampoco", async () => {
    for (const id of ["c-anulada", "c-despacho", "no-existe"]) {
      const e = await ForestCubicacionesDB.save(T, { nombre: "x", piezas: [pieza], ctpEntryIds: [id] }, "qa").catch((x) => x);
      expect(e).toBeInstanceOf(CubicacionVinculoError);
      expect((e as CubicacionVinculoError).ids).toEqual([id]);
    }
  });

  it("re-guardar desde el cubicador (sin corridas) conserva el hilo", async () => {
    const r = await ForestCubicacionesDB.save(T, { nombre: "Camión", piezas: [pieza], ctpEntryIds: ["c-a1", "c-a2"] }, "qa");
    const otra = await ForestCubicacionesDB.save(T, { id: r.id, nombre: "Camión (editada)", piezas: [pieza, pieza] }, "qa");
    expect(otra.ctpEntryIds).toEqual(["c-a1", "c-a2"]);
    const [guardada] = await ForestCubicacionesDB.list(T);
    expect(guardada?.ctpEntryIds).toEqual(["c-a1", "c-a2"]);
    expect(guardada?.nombre).toBe("Camión (editada)");
  });

  it("un vínculo viejo que hoy está anulado no traba el re-guardado", async () => {
    H.kv.set(`ctp-cubicaciones:${T}`, [registro("vieja", "2026-08-01", ["c-anulada"])]);
    const r = await ForestCubicacionesDB.save(T, { id: "vieja", nombre: "vieja", piezas: [pieza] }, "qa");
    expect(r.ctpEntryIds).toEqual(["c-anulada"]);
    expect(H.wheres).toHaveLength(0);
  });

  it("con el updatedAt que leyó la pantalla: si la guardada cambió, 409 y no se pisa", async () => {
    const r = await ForestCubicacionesDB.save(T, { nombre: "Día", piezas: [pieza] }, "qa");
    const leida = r.updatedAt;
    await new Promise((ok) => setTimeout(ok, 5));
    const editada = await ForestCubicacionesDB.save(T, { id: r.id, nombre: "Día", piezas: [pieza, pieza] }, "qa", {
      updatedAtLeido: leida,
    });
    const e = await ForestCubicacionesDB.save(
      T,
      { id: r.id, nombre: "Día", piezas: [pieza], ctpEntryIds: ["c-a1"] },
      "qa",
      { updatedAtLeido: leida },
    ).catch((x) => x);
    expect(e).toBeInstanceOf(CubicacionDesactualizadaError);
    const [guardada] = await ForestCubicacionesDB.list(T);
    expect(guardada?.updatedAt).toBe(editada.updatedAt);
    expect(guardada?.totales.piezas).toBe(20);
    expect(guardada?.ctpEntryIds).toBeUndefined();
  });

  it("paraVincular devuelve sólo las ligadas, con todas sus corridas", async () => {
    H.kv.set(`ctp-cubicaciones:${T}`, [
      registro("suelta", "2026-09-01"),
      { ...registro("vieja", "2026-08-01"), ctpEntryId: "c-a1" },
      registro("camion", "2026-09-02", ["c-a1", "c-a2"]),
    ]);
    const v = await ForestCubicacionesDB.paraVincular(T);
    expect(v.map((c) => [c.id, c.corridas])).toEqual([
      ["camion", ["c-a1", "c-a2"]],
      ["vieja", ["c-a1"]],
    ]);
  });
});
