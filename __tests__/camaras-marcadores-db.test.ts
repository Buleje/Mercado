/**
 * `CamarasMarcadoresDB` (ADR-480): asignación con candado, ids que se liberan
 * cuando la troza sale del patio, trozas de otro negocio rechazadas y la
 * clave con el `tenantId`. El KV y las trozas son dobles en memoria.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  fila: Promise.resolve() as Promise<unknown>,
  /** tenantId → filas del patio (lo que devolvería `trozasDelPatio`). */
  patio: new Map<string, Record<string, unknown>[]>(),
  pedidos: [] as { tenantId: string; ids?: string[] }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  PlatformSettingsDB: {
    getFresco: async (key: string) => structuredClone(H.kv.get(key) ?? null),
    delete: async (key: string) => void H.kv.delete(key),
    actualizar: (key: string, cambio: (actual: unknown) => { valor?: unknown; resultado: unknown }) => {
      const turno = H.fila.then(async () => {
        await new Promise((ok) => setTimeout(ok, 1));
        const r = cambio(structuredClone(H.kv.get(key) ?? null));
        if (r.valor !== undefined) H.kv.set(key, structuredClone(r.valor));
        return r.resultado;
      });
      H.fila = turno.catch(() => undefined);
      return turno;
    },
  },
}));
vi.mock("@/lib/db/wood-entries.db", () => ({
  vivaLinea: (l: { status: string; deletedAt: Date | null } | null) => Boolean(l && l.status === "registrado" && !l.deletedAt),
  WoodEntriesDB: {
    trozasDelPatio: async (tenantId: string, opts: { ids?: string[] }) => {
      H.pedidos.push({ tenantId, ids: opts.ids });
      return (H.patio.get(tenantId) ?? []).filter((t) => !opts.ids || opts.ids.includes(t.id as string));
    },
  },
}));
vi.mock("@/lib/db/forest-lote-aserrio.db", () => ({
  motivoNoElegible: (t: { noRecepcionada?: boolean }) => (t.noRecepcionada ? "no llegó al patio" : null),
}));

import { CamarasMarcadoresDB, CLAVE_MARCADORES } from "@/lib/db/camaras-marcadores.db";

const T = "tenant-a";
const fila = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  codigoPlanta: id.toUpperCase(),
  codificacion: null,
  especieComun: "Tornillo",
  volumenM3: 0.5,
  consumidaEnId: null,
  consumidaEn: null,
  despachadaEn: null,
  loteMixto: null,
  loteAserrio: null,
  noRecepcionada: false,
  descarte: false,
  _count: { retrozos: 0 },
  entry: { status: "validado", fechaRecepcion: new Date("2026-10-03") },
  ...extra,
});

beforeEach(() => {
  H.kv.clear();
  H.patio.clear();
  H.pedidos.length = 0;
  H.fila = Promise.resolve();
});

describe("CamarasMarcadoresDB", () => {
  it("la clave lleva el tenantId y es interna", () => {
    expect(CLAVE_MARCADORES(T)).toBe("interno:camaras-marcadores:tenant-a");
  });

  it("asignar da los libres más bajos; la troza que ya tenía uno lo conserva", async () => {
    H.patio.set(T, [fila("a"), fila("b"), fila("c")]);
    const r1 = await CamarasMarcadoresDB.asignar(T, ["a", "b"], "ana");
    expect(r1.asignados.map((x) => [x.trozaId, x.marcador])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
    const r2 = await CamarasMarcadoresDB.asignar(T, ["b", "c"], "ana");
    expect(r2.asignados.map((x) => [x.trozaId, x.marcador, x.nuevo])).toEqual([
      ["b", 1, false],
      ["c", 2, true],
    ]);
  });

  it("la troza consumida o despachada libera su id al leer", async () => {
    H.patio.set(T, [fila("a"), fila("b")]);
    await CamarasMarcadoresDB.asignar(T, ["a"], "ana");
    H.patio.set(T, [fila("a", { consumidaEnId: "k1", consumidaEn: { status: "validado", deletedAt: null } }), fila("b")]);
    const r = await CamarasMarcadoresDB.asignar(T, ["b"], "ana");
    expect(r.asignados).toEqual([{ marcador: 0, trozaId: "b", codigo: "B", nuevo: true }]);
    const lista = await CamarasMarcadoresDB.asignaciones(T);
    expect(lista.asignaciones.map((x) => [x.marcador, x.trozaId])).toEqual([[0, "b"]]);
  });

  it("la troza de otro negocio se rechaza (se busca con el tenantId del que pide)", async () => {
    H.patio.set("tenant-b", [fila("ajena")]);
    H.patio.set(T, [fila("a")]);
    const r = await CamarasMarcadoresDB.asignar(T, ["ajena", "a"], "ana");
    expect(r.rechazados).toEqual([{ trozaId: "ajena", motivo: "No está en el patio de este negocio (guía anulada o troza ajena)." }]);
    expect(r.asignados.map((x) => x.trozaId)).toEqual(["a"]);
    expect(H.pedidos.every((p) => p.tenantId === T)).toBe(true);
  });

  it("dos asignar a la vez no reparten el mismo id (candado)", async () => {
    H.patio.set(T, [fila("a"), fila("b")]);
    const [r1, r2] = await Promise.all([
      CamarasMarcadoresDB.asignar(T, ["a"], "ana"),
      CamarasMarcadoresDB.asignar(T, ["b"], "luis"),
    ]);
    const ids = [...r1.asignados, ...r2.asignados].map((x) => x.marcador);
    expect(new Set(ids).size).toBe(2);
  });

  it("vincular no pisa el marcador de una troza que sigue en el patio", async () => {
    H.patio.set(T, [fila("a"), fila("b")]);
    await CamarasMarcadoresDB.asignar(T, ["a"], "ana");
    const r = await CamarasMarcadoresDB.vincular(T, 0, "b", "ana");
    expect(r.asignados).toEqual([]);
    expect(r.rechazados[0]!.motivo).toContain("ya es de A");
    const ok = await CamarasMarcadoresDB.vincular(T, 5, "b", "ana");
    expect(ok.asignados).toEqual([{ marcador: 5, trozaId: "b", codigo: "B", nuevo: true }]);
  });

  it("a la vista: estado y motivo de cada marcador visto", async () => {
    H.patio.set(T, [fila("a"), fila("b", { noRecepcionada: true })]);
    /* Asignados ANTES de la pasada de las 13:00: si no, el id se vio con otra troza. */
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T12:00:00.000Z"));
    await CamarasMarcadoresDB.asignar(T, ["a", "b"], "ana");
    vi.useRealTimers();
    await CamarasMarcadoresDB.anotarPasada(
      T,
      "2026-10-08",
      { en: "2026-10-08T13:00:00.000Z", camaraId: "c1", origen: "pasada", calidad: "hd", ids: [0, 1, 245] },
      "ana",
    );
    const r = await CamarasMarcadoresDB.aLaVista(T, { dia: "2026-10-08" });
    expect(r.trozas.map((t) => [t.marcador, t.estado, t.motivo])).toEqual([
      [0, "libre", null],
      [1, "libre", "no llegó al patio"],
    ]);
    expect(r.resumen).toEqual({ vistas: 2, libres: 1, m3Libres: 0.5 });
  });
});
