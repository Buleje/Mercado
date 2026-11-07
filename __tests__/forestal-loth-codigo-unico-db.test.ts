/**
 * ADR-477 — la migración al código único (`ForestLothCodigoUnicoDB`) con una
 * base simulada en memoria, armada como Blas el 08-10: la GTF 019-001-0000001
 * emitida con 22 trozas TORNILLO «1»…«22» importadas (Trozado + Despacho), y
 * la anulada de la 1.ª importación deshecha.
 *
 * Lo que tiene que pasar: 44 líneas + 22 items, observaciones y `trozadoId`
 * intactos; huella distinta, choque de los tres niveles, mes cerrado o CTP
 * atado con el código viejo → no se escribe nada; revertir sólo si coincide;
 * otro negocio no ve la guía.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const H = vi.hoisted(() => {
  const estado = { lineas: [] as Fila[], gtfs: [] as Fila[], wood: [] as Fila[], log: [] as Fila[], cierres: [] as unknown[] };
  const coincide = (row: Fila, where: Fila): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Fila[]).some((w) => coincide(row, w));
      if (k === "entry") return true;
      const val = row[k];
      if (v instanceof Date) return val instanceof Date && val.getTime() === v.getTime();
      if (v && typeof v === "object") {
        const o = v as { in?: unknown[]; startsWith?: string; not?: unknown };
        if (o.in && !o.in.includes(val)) return false;
        if (o.startsWith != null && !(typeof val === "string" && val.startsWith(o.startsWith))) return false;
        if ("not" in o && val === o.not) return false;
        return true;
      }
      return (val ?? null) === (v ?? null);
    });
  const modelo = (lista: () => Fila[]) => ({
    findMany: vi.fn(async ({ where }: { where: Fila }) => structuredClone(lista().filter((r) => coincide(r, where)))),
    findFirst: vi.fn(async ({ where }: { where: Fila }) => structuredClone(lista().find((r) => coincide(r, where)) ?? null)),
    updateMany: vi.fn(async ({ where, data }: { where: Fila; data: Fila }) => {
      const filas = lista().filter((r) => coincide(r, where));
      for (const r of filas) Object.assign(r, structuredClone(data), { updatedAt: new Date(Date.now() + Math.random() * 1000) });
      return { count: filas.length };
    }),
  });
  const db = {
    forestLothEntry: modelo(() => estado.lineas),
    forestGtf: modelo(() => estado.gtfs),
    woodEntryTroza: modelo(() => estado.wood),
    activityLog: { create: vi.fn(async ({ data }: { data: Fila }) => estado.log.push(data)) },
    $executeRaw: vi.fn(async () => 0),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      if (!strings.join("").includes("jsonb_array_elements")) return [];
      const [tenantId, gtfId, cand] = vals as [string, string, { values: string[] }];
      return estado.gtfs
        .filter((g) => g.tenantId === tenantId && g.deletedAt == null && g.id !== gtfId)
        .flatMap((g) => (g.items as { code: string }[]).map((i) => i.code))
        .filter((c) => cand.values.includes(c))
        .map((code) => ({ code }));
    }),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      /* Una tx que aborta no deja nada: se trabaja sobre una copia y se publica al final. */
      const copia = structuredClone({ lineas: estado.lineas, gtfs: estado.gtfs, log: estado.log });
      try {
        return await fn(db);
      } catch (e) {
        Object.assign(estado, copia);
        throw e;
      }
    }),
  };
  return { estado, db };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.db }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { list: async () => H.estado.cierres } }));
const turno = vi.hoisted(() => vi.fn(async (_tx: unknown, _tenantId: string, _esperar: boolean) => {}));
vi.mock("@/lib/db/forest-loth-importar.db", () => ({ tomarTurnoDeImportacion: turno }));

import { CodigoUnicoError, ForestLothCodigoUnicoDB } from "@/lib/db/forest-loth-codigo-unico.db";
import type { RespaldoCodigoUnico } from "@/lib/forestal/codigo-unico-migracion";

const T = "blas";
const N = "019-001-0000001";
const PLAN = "plan-blas";
const OBS = `Importada de la GTF ${N} (registro SERFOR 110-19-0395908).`;
const dia = new Date("2025-10-09T12:00:00.000Z");

function sembrar() {
  const lineas: Fila[] = [];
  const items: Fila[] = [];
  for (let i = 1; i <= 22; i++) {
    const code = String(i);
    const tz = { id: `tz-${String(i).padStart(2, "0")}`, tenantId: T, section: "trozado", lineNo: 26 + i, trozaCode: code, treeCode: code, planId: PLAN, gtfNumber: null, observations: OBS, entryDate: dia, updatedAt: dia, status: "registrado", deletedAt: null, medicionCruda: null };
    const de = { ...tz, id: `de-${String(i).padStart(2, "0")}`, section: "despacho_troza", lineNo: 25 + i, treeCode: null, gtfNumber: N, observations: null };
    lineas.push(tz, de);
    items.push({ code, cites: false, pieces: 1, species: "TORNILLO", treeCode: code, volumeM3: 0.7, trozadoId: tz.id });
  }
  H.estado.lineas = lineas;
  H.estado.gtfs = [
    { id: "gtf-emitida", tenantId: T, gtfNumber: N, planId: PLAN, status: "emitida", tipo: "trozas", items, updatedAt: dia, deletedAt: null },
    { id: "gtf-anulada", tenantId: T, gtfNumber: N, planId: PLAN, status: "anulada", tipo: "trozas", items: structuredClone(items), updatedAt: dia, deletedAt: null },
  ];
  H.estado.wood = [];
  H.estado.log = [];
  H.estado.cierres = [];
}

beforeEach(sembrar);

describe("el plan de Blas", () => {
  it("1 guía · 22 trozado + 22 despacho + 22 items, 0 bloqueos", async () => {
    expect(await ForestLothCodigoUnicoDB.guiasAMigrar(T)).toEqual([{ gtfId: "gtf-emitida", gtfNumber: N, trozas: 22 }]);
    const p = await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida");
    expect(p.cambios.filter((c) => c.section === "trozado")).toHaveLength(22);
    expect(p.cambios.filter((c) => c.section === "despacho_troza")).toHaveLength(22);
    expect(p.items).toHaveLength(22);
    expect(p.bloqueos).toEqual([]);
    expect(p.items[0]).toEqual({ trozadoId: "tz-01", de: "1", a: "1-0001", codigoGuia: "1" });
    expect(p.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(p.items.map((i) => i.trozadoId))).toEqual(new Set(p.cambios.filter((c) => c.section === "trozado").map((c) => c.lineaId)));
  });

  it("otro negocio no ve la guía", async () => {
    await expect(ForestLothCodigoUnicoDB.plan("otro-tenant", "gtf-emitida")).rejects.toMatchObject({ codigo: "no_existe" });
    expect(await ForestLothCodigoUnicoDB.guiasAMigrar("otro-tenant")).toEqual([]);
  });
});

describe("migrar", () => {
  it("escribe 44 códigos + los items; observaciones y trozadoId intactos; audita; la 2.ª vez no hay nada", async () => {
    const p = await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida");
    expect(await ForestLothCodigoUnicoDB.migrarGuia(T, { gtfId: "gtf-emitida", huella: p.huella })).toEqual({ cambiadas: 44, items: 22, talas: 0 });
    expect(H.estado.lineas.filter((l) => /-0001$/.test(String(l.trozaCode)))).toHaveLength(44);
    expect(H.estado.lineas.filter((l) => l.section === "trozado").every((l) => l.observations === OBS)).toBe(true);
    const [it0] = H.estado.gtfs[0].items as Fila[];
    expect(it0).toMatchObject({ code: "1-0001", codigoGuia: "1", trozadoId: "tz-01", volumeM3: 0.7 });
    expect((H.estado.gtfs[1].items as Fila[])[0].code).toBe("1");
    expect(H.estado.log).toHaveLength(1);
    expect(H.estado.log[0]).toMatchObject({ action: "loth_codigo_unico_migrado", entityId: "gtf-emitida", tenantId: T });
    expect(await ForestLothCodigoUnicoDB.guiasAMigrar(T)).toEqual([]);
  });

  it("huella distinta → aborta sin escribir", async () => {
    await expect(ForestLothCodigoUnicoDB.migrarGuia(T, { gtfId: "gtf-emitida", huella: "0".repeat(64) })).rejects.toMatchObject({ codigo: "huella_distinta" });
    expect(H.estado.lineas.some((l) => String(l.trozaCode).includes("-"))).toBe(false);
    await expect(ForestLothCodigoUnicoDB.migrarGuia(T, { gtfId: "gtf-emitida", huella: "nada" })).rejects.toBeInstanceOf(CodigoUnicoError);
  });

  it("si el nivel 1 está tomado usa el 2; si los tres, bloquea y no escribe", async () => {
    H.estado.lineas.push({ id: "zz-1", tenantId: T, section: "trozado", lineNo: 99, trozaCode: "5-0001", status: "anulado", deletedAt: null, planId: "otro", entryDate: dia, updatedAt: dia });
    const p = await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida");
    expect(p.items.find((i) => i.de === "5")?.a).toBe("5-019/0001");
    H.estado.gtfs.push({ id: "gtf-otra", tenantId: T, gtfNumber: "020-001-0000001", status: "emitida", items: [{ code: "5-019/0001" }, { code: "5-019-001/0001" }], updatedAt: dia, deletedAt: null });
    const b = await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida");
    expect(b.bloqueos.join(" ")).toMatch(/«5» no tiene código único libre/);
    await expect(ForestLothCodigoUnicoDB.migrarGuia(T, { gtfId: "gtf-emitida", huella: b.huella })).rejects.toMatchObject({ codigo: "bloqueada" });
    expect(H.estado.lineas.filter((l) => /-0001$/.test(String(l.trozaCode)))).toHaveLength(1);
  });

  it("mes cerrado o la troza ya en el CTP con el código viejo → bloquea", async () => {
    H.estado.cierres = [{ periodKey: "2025-10", label: "octubre 2025", from: "2025-10-01T00:00:00.000Z", to: "2025-10-31T23:59:59.999Z", reabierto: false }];
    expect((await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida")).bloqueos.join(" ")).toMatch(/octubre 2025, que está cerrado/);
    H.estado.cierres = [];
    H.estado.wood = [{ tenantId: T, lothTrozadoId: "tz-03", codificacion: "3" }];
    expect((await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida")).bloqueos).toEqual([
      "La troza «3» ya está en el Libro CTP con ese código: renombrarla la separaría de su ingreso.",
    ]);
  });

  it("una troza que también salió con otra línea no se renombra", async () => {
    H.estado.lineas.push({ id: "co-1", tenantId: T, section: "consumo_troza", lineNo: 4, trozaCode: "7", status: "registrado", deletedAt: null, planId: PLAN, gtfNumber: null, entryDate: dia, updatedAt: dia });
    expect((await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida")).bloqueos.join(" ")).toMatch(/«7» también está en consumo #4/);
  });

  it("la troza registrada a mano no se renombra (P1)", async () => {
    H.estado.lineas.find((l) => l.id === "tz-09")!.observations = "Medida en patio";
    const p = await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida");
    expect(p.items).toHaveLength(21);
    expect(p.saltadas.join(" ")).toMatch(/9: registrada a mano/);
  });
});

describe("revertir", () => {
  async function migrado(): Promise<RespaldoCodigoUnico> {
    const p = await ForestLothCodigoUnicoDB.plan(T, "gtf-emitida");
    await ForestLothCodigoUnicoDB.migrarGuia(T, { gtfId: "gtf-emitida", huella: p.huella });
    return { tenantId: T, fecha: "2026-10-08", ...p.respaldo };
  }

  it("restaura los códigos y los items; la 2.ª vez no coincide y no toca nada", async () => {
    const respaldo = await migrado();
    expect(await ForestLothCodigoUnicoDB.revertirGuia(T, { respaldo })).toEqual({ restauradas: 44 });
    expect(H.estado.lineas.every((l) => !String(l.trozaCode).includes("-"))).toBe(true);
    expect((H.estado.gtfs[0].items as Fila[])[0]).toEqual(expect.objectContaining({ code: "1", trozadoId: "tz-01" }));
    expect((H.estado.gtfs[0].items as Fila[])[0]).not.toHaveProperty("codigoGuia");
    await expect(ForestLothCodigoUnicoDB.revertirGuia(T, { respaldo })).rejects.toMatchObject({ codigo: "no_coincide" });
  });

  it("si alguien cambió una línea después, no revierte nada", async () => {
    const respaldo = await migrado();
    H.estado.lineas.find((l) => l.id === "de-04")!.trozaCode = "4-OTRO";
    await expect(ForestLothCodigoUnicoDB.revertirGuia(T, { respaldo })).rejects.toMatchObject({ codigo: "no_coincide" });
    expect(H.estado.lineas.filter((l) => /-0001$/.test(String(l.trozaCode)))).toHaveLength(43);
  });

  it("un respaldo de otro negocio se rechaza", async () => {
    const respaldo = await migrado();
    await expect(ForestLothCodigoUnicoDB.revertirGuia("otro-tenant", { respaldo })).rejects.toMatchObject({ codigo: "no_coincide" });
  });

  it("los items vuelven con el mapa al revés: lo que cambió después en otros campos se respeta", async () => {
    const respaldo = await migrado();
    (H.estado.gtfs[0].items as Fila[])[0].volumeM3 = 0.9;
    expect(await ForestLothCodigoUnicoDB.revertirGuia(T, { respaldo })).toEqual({ restauradas: 44 });
    const [it0] = H.estado.gtfs[0].items as Fila[];
    expect(it0).toMatchObject({ code: "1", trozadoId: "tz-01", volumeM3: 0.9 });
    expect(it0).not.toHaveProperty("codigoGuia");
  });

  it("si algo nuevo cuelga del código único (o el viejo ya está tomado), no revierte nada", async () => {
    const respaldo = await migrado();
    H.estado.lineas.push({ id: "co-9", tenantId: T, section: "consumo_troza", lineNo: 80, trozaCode: "2-0001", status: "registrado", deletedAt: null, planId: PLAN, gtfNumber: null, entryDate: dia, updatedAt: dia });
    await expect(ForestLothCodigoUnicoDB.revertirGuia(T, { respaldo })).rejects.toMatchObject({ codigo: "no_coincide", message: expect.stringMatching(/#80 .*«2-0001»/) });
    H.estado.lineas.find((l) => l.id === "co-9")!.trozaCode = "3";
    await expect(ForestLothCodigoUnicoDB.revertirGuia(T, { respaldo })).rejects.toMatchObject({ codigo: "no_coincide" });
    expect(H.estado.lineas.filter((l) => /-0001$/.test(String(l.trozaCode)))).toHaveLength(44);
  });

  it("migrar y revertir toman el turno del importador (esperándolo) dentro de la tx", async () => {
    turno.mockClear();
    const respaldo = await migrado();
    await ForestLothCodigoUnicoDB.revertirGuia(T, { respaldo });
    expect(turno).toHaveBeenCalledTimes(2);
    expect(turno.mock.calls.every((c) => c[1] === T && c[2] === true)).toBe(true);
  });
});
