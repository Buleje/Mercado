/**
 * Backend del croquis de planta (ADR-465).
 *
 *  · `setMany`: diez ubicaciones en UNA llamada quedan las diez (antes: diez PUT
 *    en paralelo que leían la misma lista → sobrevivía la última).
 *  · Huérfanas: se borran sólo las confirmadas por id; la «zona muerta» se
 *    re-verifica contra las zonas frescas (el caché de otra instancia miente).
 *  · Historia de la troza: tenant-safe (otro negocio → null → 404) y ordenada.
 *  · Área de una zona del croquis: fórmula PLANA en metros, nunca la que mande
 *    el cliente ni la geodésica.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const kv = new Map<string, unknown>();
  const audit: { action: string; detail: string }[] = [];
  /* `actualizar` de verdad serializa por clave (advisory lock): acá, una cola. */
  let cola: Promise<unknown> = Promise.resolve();
  const tx = {
    platformSetting: {
      findUnique: async (a: { where: { key: string } }) => (kv.has(a.where.key) ? { value: kv.get(a.where.key) } : null),
    },
  };
  const actualizar = vi.fn(
    (key: string, cambio: (actual: unknown, t: typeof tx) => Promise<{ valor?: unknown; resultado: unknown }> | { valor?: unknown; resultado: unknown }) => {
      const run = cola.then(async () => {
        const r = await cambio(kv.has(key) ? structuredClone(kv.get(key)) : null, tx);
        if (r.valor !== undefined) kv.set(key, structuredClone(r.valor));
        return r.resultado;
      });
      cola = run.catch(() => undefined);
      return run;
    },
  );
  const trozas: { id: string; tenantId: string; [k: string]: unknown }[] = [];
  return {
    kv,
    audit,
    actualizar,
    trozas,
    availableSource: vi.fn(async (_t: string, _s: string, _o?: { ids?: string[] }) => [] as { id: string; kind: string }[]),
    trozasComoConsumibles: vi.fn(async (_t: string, _o?: { ids?: string[] }) => [] as Record<string, unknown>[]),
    despachosVivos: vi.fn(async () => [] as { id: string }[]),
  };
});

vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (k: string) => (H.kv.has(k) ? structuredClone(H.kv.get(k)) : null),
    set: async (k: string, v: unknown) => void H.kv.set(k, structuredClone(v)),
    actualizar: H.actualizar,
  },
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: (p: { action: string; detail: string }) => void H.audit.push({ action: p.action, detail: p.detail }),
}));
vi.mock("@/lib/db/forest-ctp.db", () => ({ ForestCtpDB: { availableSource: H.availableSource } }));
vi.mock("@/lib/db/wood-entries.db", () => ({ WoodEntriesDB: { trozasComoConsumibles: H.trozasComoConsumibles } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestCtpEntry: { findMany: H.despachosVivos },
    woodEntryTroza: {
      /* Filtra como la base: id Y tenant en el WHERE. */
      findFirst: async (a: { where: { id: string; tenantId: string } }) =>
        H.trozas.find((t) => t.id === a.where.id && t.tenantId === a.where.tenantId) ?? null,
    },
  },
}));

import { ForestPlantaAsignacionDB, ZonaInexistenteError } from "@/lib/db/forest-planta-asignacion.db";
import { ForestPlantaZonaDB, ZonaCroquisInvalidaError } from "@/lib/db/forest-planta-zona.db";
import { ForestTrozaHistoriaDB } from "@/lib/db/forest-troza-historia.db";
import { geometriaZonaCroquis, separarHuerfanas, esPathImagenCroquis } from "@/lib/forestal/planta-croquis-guardado";
import { armarHistoriaTroza, type FilaHistoriaTroza } from "@/lib/forestal/troza-historia";
import { claveTroza } from "@/lib/forestal/planta-zona-types";

const T = "t-main";
const KEY_UBI = `ctp-planta-asignacion:${T}`;
const KEY_ZONAS = `ctp-planta-zonas:${T}`;
const KEY_CROQUIS = `ctp-planta-croquis:${T}`;
const zona = (id: string) => ({ id, codigo: id.toUpperCase(), nombre: null, tipo: "patio_trozas", poligono: null, lat: null, lng: null, areaM2: null, notas: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });

beforeEach(() => {
  H.kv.clear();
  H.audit.length = 0;
  H.trozas.length = 0;
  H.availableSource.mockReset().mockResolvedValue([]);
  H.trozasComoConsumibles.mockReset().mockResolvedValue([]);
  H.despachosVivos.mockReset().mockResolvedValue([]);
  H.kv.set(KEY_ZONAS, [zona("z1"), zona("z2")]);
});

describe("setMany — varias ubicaciones en una escritura", () => {
  it("diez asignaciones en UNA llamada quedan las diez (el bug: sobrevivía la última)", async () => {
    const asig = Array.from({ length: 10 }, (_, i) => ({ clave: `g${i}`, zonaId: i % 2 ? "z1" : "z2" }));
    const r = await ForestPlantaAsignacionDB.setMany(T, asig, "qa");
    expect(Object.keys(r)).toHaveLength(10);
    expect(Object.keys(H.kv.get(KEY_UBI) as object)).toHaveLength(10);
    expect(H.actualizar).toHaveBeenCalled();
    expect(H.audit.at(-1)?.action).toBe("ctp_planta_asignar_lote");
  });

  it("la troza separada se guarda con su clave propia y convive con su pila", async () => {
    await ForestPlantaAsignacionDB.setMany(T, [
      { clave: "g1", zonaId: "z1" },
      { clave: claveTroza("tr9"), zonaId: "z2", lat: 12.5, lng: 30.25 },
    ]);
    const m = H.kv.get(KEY_UBI) as Record<string, { zonaId: string; lat?: number; lng?: number }>;
    expect(m.g1).toEqual({ zonaId: "z1" });
    expect(m["troza:tr9"]).toEqual({ zonaId: "z2", lat: 12.5, lng: 30.25 });
  });

  it("dos lotes simultáneos no se pisan (lock por clave)", async () => {
    await Promise.all([
      ForestPlantaAsignacionDB.setMany(T, [{ clave: "a", zonaId: "z1" }, { clave: "b", zonaId: "z1" }]),
      ForestPlantaAsignacionDB.setMany(T, [{ clave: "c", zonaId: "z2" }]),
      ForestPlantaAsignacionDB.set(T, "d", "z2"),
    ]);
    expect(Object.keys(H.kv.get(KEY_UBI) as object).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("zonaId null desubica; una zona inexistente rechaza el lote ENTERO", async () => {
    await ForestPlantaAsignacionDB.setMany(T, [{ clave: "a", zonaId: "z1" }, { clave: "b", zonaId: "z1" }]);
    await expect(
      ForestPlantaAsignacionDB.setMany(T, [{ clave: "a", zonaId: null }, { clave: "c", zonaId: "zona-fantasma" }]),
    ).rejects.toBeInstanceOf(ZonaInexistenteError);
    expect(Object.keys(H.kv.get(KEY_UBI) as object).sort()).toEqual(["a", "b"]); // nada a medias
    const r = await ForestPlantaAsignacionDB.setMany(T, [{ clave: "a", zonaId: null }]);
    expect(r).toEqual({ a: null });
    expect(Object.keys(H.kv.get(KEY_UBI) as object)).toEqual(["b"]);
  });
});

describe("huérfanas", () => {
  it("separa vigentes, zona muerta y candidatas a confirmar", () => {
    const r = separarHuerfanas(
      { a: { zonaId: "z1" }, b: { zonaId: "z-borrada" }, c: { zonaId: "z2" }, "troza:t1": { zonaId: "z1" } },
      new Set(["a", "troza:t1"]),
      new Set(["z1", "z2"]),
    );
    expect(Object.keys(r.vigentes).sort()).toEqual(["a", "troza:t1"]);
    expect(r.zonaMuerta).toEqual(["b"]);
    expect(r.candidatas).toEqual(["c"]);
  });

  it("confirma por id: sólo muere lo que la base no da por vivo (la pila fuera de la ventana NO)", async () => {
    H.availableSource.mockImplementation(async (_t, s) => (s === "produccion" ? [{ id: "pila-vieja", kind: "ingreso" }] : []));
    H.despachosVivos.mockResolvedValue([{ id: "desp-1" }]);
    H.trozasComoConsumibles.mockResolvedValue([
      { id: "t-patio", woodEntryId: "g", volumenM3: 1, guiaRecepcionada: true },
      { id: "t-aserrada", woodEntryId: "g", volumenM3: 1, guiaRecepcionada: true, consumidaEnId: "corrida-1" },
    ]);
    const muertas = await ForestPlantaAsignacionDB.confirmarMuertas(T, [
      "pila-vieja", "desp-1", "ingreso-anulado", "troza:t-patio", "troza:t-aserrada", "troza:t-inexistente",
    ]);
    expect(muertas.sort()).toEqual(["ingreso-anulado", "troza:t-aserrada", "troza:t-inexistente"]);
    // Pidió por id, no la lista con tope.
    expect(H.availableSource.mock.calls[0][2]).toEqual({ ids: ["pila-vieja", "desp-1", "ingreso-anulado"] });
    expect(H.trozasComoConsumibles.mock.calls[0][1]).toEqual({ ids: ["t-patio", "t-aserrada", "t-inexistente"] });
  });

  it("borra las confirmadas y re-verifica la zona muerta contra las zonas frescas", async () => {
    H.kv.set(KEY_UBI, { a: { zonaId: "z1" }, muerta: { zonaId: "z1" }, enZonaNueva: { zonaId: "z3" }, enBorrada: { zonaId: "z9" } });
    // z3 se creó en OTRA instancia: el GET (caché viejo) la creyó muerta, la base la tiene.
    H.kv.set(KEY_ZONAS, [zona("z1"), zona("z2"), zona("z3")]);
    const n = await ForestPlantaAsignacionDB.limpiarHuerfanas(T, { muertas: ["muerta"], zonaMuerta: ["enZonaNueva", "enBorrada"] });
    expect(n).toBe(2);
    expect(Object.keys(H.kv.get(KEY_UBI) as object).sort()).toEqual(["a", "enZonaNueva"]);
    expect(H.audit.at(-1)?.action).toBe("ctp_planta_limpiar");
  });
});

describe("historia de la troza", () => {
  const fila = (over: Partial<FilaHistoriaTroza> = {}): FilaHistoriaTroza => ({
    id: "t1",
    codigo: "3037752",
    fechaRecepcion: new Date("2026-09-23T15:00:00Z"),
    noRecepcionada: false,
    reservadaMixtoEn: null,
    fechaConsumo: null,
    fechaDespacho: null,
    fechaRetrozo: null,
    descarte: false,
    guia: { numero: "010-001-0000005", entryDate: new Date("2026-09-20T00:00:00Z"), fechaRecepcion: null, status: "validado" },
    madre: null,
    pedazos: [],
    loteAserrio: null,
    loteMixto: null,
    corrida: null,
    despacho: null,
    ...over,
  });

  it("ordena recepción → mixto → lote → consumo → despacho del producto, con sus refs", () => {
    const ev = armarHistoriaTroza(
      fila({
        reservadaMixtoEn: new Date("2026-09-24T10:00:00Z"),
        loteMixto: null,
        loteAserrio: { code: "LA-07", fechaApertura: new Date("2026-09-25T00:00:00Z"), status: "consumido", deletedAt: null, mixto: { code: "LM-2026-001", repartidoEn: new Date("2026-09-25T09:00:00Z") } },
        fechaConsumo: new Date("2026-09-27T08:00:00Z"),
        corrida: {
          lineNo: 32,
          entryDate: new Date("2026-09-27T00:00:00Z"),
          productType: "Tablas",
          vigente: true,
          apartados: [{ creadoAt: new Date("2026-09-28T00:00:00Z"), para: "WASACO", paquete: "P-3", liberadoAt: null }],
          despachos: [{ lineNo: 4, entryDate: new Date("2026-09-30T00:00:00Z"), gtfNumber: "GTF-777", vigente: true }],
        },
      }),
    );
    expect(ev.map((e) => e.tipo)).toEqual(["recepcion", "lote_mixto", "lote", "consumo", "apartado", "despacho"]);
    expect(ev.find((e) => e.tipo === "consumo")?.ref).toBe("Corrida N° 32");
    expect(ev.find((e) => e.tipo === "despacho")?.ref).toBe("GTF-777");
    expect(ev.find((e) => e.tipo === "lote")?.detalle).toContain("LM-2026-001");
  });

  it("una corrida ANULADA no es consumo (la madera volvió al patio)", () => {
    const ev = armarHistoriaTroza(
      fila({ corrida: { lineNo: 9, entryDate: new Date("2026-09-27T00:00:00Z"), productType: null, vigente: false, apartados: [], despachos: [] } }),
    );
    expect(ev.map((e) => e.tipo)).toEqual(["recepcion"]);
  });

  it("tenant-safe: la troza de otro negocio no existe (null → 404)", async () => {
    H.trozas.push({ id: "t-blas", tenantId: "t-blas" });
    expect(await ForestTrozaHistoriaDB.de(T, "t-blas")).toBeNull();
    expect(await ForestTrozaHistoriaDB.de(T, "")).toBeNull();
  });
});

describe("área de la zona del croquis: plana, en metros", () => {
  const terreno = { anchoM: 54, altoM: 48 };

  it("rectángulo 10 × 5 m = 50 m² y centroide en el medio", () => {
    const g = geometriaZonaCroquis("[[0,0],[0,10],[5,10],[5,0]]", terreno);
    expect(g).toEqual({ ok: true, areaM2: 50, lat: 2.5, lng: 5 });
  });

  it("fuera del terreno, polígono roto o sin croquis → error con mensaje", () => {
    expect(geometriaZonaCroquis("[[0,0],[0,60],[5,60]]", terreno).ok).toBe(false);
    expect(geometriaZonaCroquis("[[0,0],[1,1]]", terreno).ok).toBe(false);
    expect(geometriaZonaCroquis("[[0,0],[0,10],[5,10]]", null).ok).toBe(false);
  });

  it("al guardar ignora el areaM2 del cliente y calcula la plana", async () => {
    H.kv.set(KEY_CROQUIS, { version: 8, anchoM: 54, altoM: 48, imagenPath: null, maquinas: [], actualizadoEn: "x" });
    const z = await ForestPlantaZonaDB.save(T, { codigo: "PT-08", tipo: "patio_trozas", plano: "croquis", poligono: "[[31.5,0.2],[31.5,8.6],[41.6,8.6],[41.6,0.2]]", areaM2: 999_999 });
    expect(z.areaM2).toBeCloseTo(84.84, 2); // 8.4 × 10.1
    expect(z.plano).toBe("croquis");
    expect([z.lat, z.lng]).toEqual([36.55, 4.4]);
  });

  it("zona del croquis sin croquis cargado → ZonaCroquisInvalidaError", async () => {
    await expect(
      ForestPlantaZonaDB.save(T, { codigo: "X", tipo: "otro", plano: "croquis", poligono: "[[0,0],[0,10],[5,10]]" }),
    ).rejects.toBeInstanceOf(ZonaCroquisInvalidaError);
  });

  it("la imagen sólo vale si es de la carpeta de croquis de ESTE negocio", () => {
    const ok = `${T}/forestal-croquis/0f8fad5b-d9cb-469f-a165-70867728950e.webp`;
    expect(esPathImagenCroquis(ok, T)).toBe(true);
    expect(esPathImagenCroquis(ok.replace(T, "t-blas"), T)).toBe(false);
    expect(esPathImagenCroquis(`${T}/forestal-carga/0f8fad5b-d9cb-469f-a165-70867728950e.webp`, T)).toBe(false);
    expect(esPathImagenCroquis(`${T}/forestal-croquis/../x.webp`, T)).toBe(false);
  });
});
