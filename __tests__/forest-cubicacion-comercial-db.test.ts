/**
 * ADR-483 · la cubicación comercial sobre la misma base en memoria que ADR-478:
 * trozas de una GTF del Libro TH (sin exigirla en el Libro CTP), madera
 * aserrada (uno por uno desde el Cubicador de madera o rápida), los frenos
 * (una guía, una plata; un despacho, una cubicación aplicada), el material que
 * no se cambia y la fórmula `tablar` que nunca se lee como Smalian.
 *
 * Corre el `AdelantosDB.registrarEntregaEnTx` REAL (la única que escribe entregas).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  type Fila = Record<string, unknown>;
  const db = {
    forestCubicacionTrozas: [] as Fila[],
    adelanto: [] as Fila[],
    adelantoEntrega: [] as Fila[],
    adelantoBeneficiario: [] as Fila[],
    forestParty: [] as Fila[],
    forestContrato: [] as Fila[],
    forestCuentaMov: [] as Fila[],
    woodEntry: [] as Fila[],
    liquidacionCuenta: [] as Fila[],
    forestGtf: [] as Fila[],
    forestCtpEntry: [] as Fila[],
    forestCtpDespachoOrigen: [] as Fila[],
  };
  /* El Cubicador de madera (KV): lo que devuelve `ForestCubicacionesDB.list`. */
  const kv: Fila[] = [];
  const pasos: string[] = [];
  let seq = 0;

  /* Decimal de Prisma → número, así el estado se puede copiar con structuredClone. */
  const norm = (v: unknown): unknown =>
    v && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function" ? (v as { toNumber: () => number }).toNumber() : v;

  /* La contención de jsonb (`@>`): cada elemento del patrón está en ALGÚN elemento del arreglo; un objeto, clave por clave; lo demás, igual. */
  function contieneJsonb(actual: unknown, patron: unknown): boolean {
    if (Array.isArray(patron)) return Array.isArray(actual) && patron.every((p) => actual.some((a) => contieneJsonb(a, p)));
    if (patron !== null && typeof patron === "object") {
      if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
      return Object.entries(patron).every(([k, v]) => k in actual && contieneJsonb((actual as Fila)[k], v));
    }
    return actual === patron;
  }

  function cumple(tabla: keyof typeof db, row: Fila, where: Fila | undefined): boolean {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "NOT") {
        if (cumple(tabla, row, v as Fila)) return false;
        continue;
      }
      if (k === "OR") {
        if (!(v as Fila[]).some((w) => cumple(tabla, row, w))) return false;
        continue;
      }
      if (k === "adelanto" && tabla === "adelantoEntrega") {
        const a = db.adelanto.find((x) => x.id === row.adelantoId);
        if (!a || !cumple("adelanto", a, v as Fila)) return false;
        continue;
      }
      const actual = row[k] ?? null;
      /* Un Decimal en el WHERE es igualdad por valor (vaciar el valor de venta sólo si sigue siendo el puesto). */
      if (v !== null && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function") {
        if (actual === null || Number(actual) !== (v as { toNumber: () => number }).toNumber()) return false;
        continue;
      }
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        const op = v as Fila;
        if ("in" in op && !(op.in as unknown[]).includes(actual)) return false;
        if ("notIn" in op && (op.notIn as unknown[]).includes(actual)) return false;
        if ("not" in op && (op.not === null ? actual === null : actual === op.not)) return false;
        if ("gt" in op && !(actual instanceof Date && actual > (op.gt as Date))) return false;
        if ("startsWith" in op && !String(actual).startsWith(String(op.startsWith))) return false;
        /* `mode: "insensitive"` de Prisma: la cola del N° de guía (`filtroMismaGuia`). */
        if ("endsWith" in op && !String(actual ?? "").toUpperCase().endsWith(String(op.endsWith).toUpperCase())) return false;
        /* `array_contains` de Prisma sobre Json en Postgres = `@>` de jsonb (`assertNoEsDeCubicacion`). */
        if ("array_contains" in op && !contieneJsonb(actual, op.array_contains)) return false;
        continue;
      }
      if (actual !== v) return false;
    }
    return true;
  }

  function aplicarData(row: Fila, data: Fila) {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && "increment" in (v as Fila)) row[k] = Number(row[k]) + Number((v as Fila).increment);
      else row[k] = norm(v);
    }
    row.updatedAt = new Date();
  }

  const DEFAULTS: Partial<Record<keyof typeof db, Fila>> = {
    forestCubicacionTrozas: { estado: "borrador", version: 1, moneda: "PEN", deletedAt: null, monto: null, aplicadaAt: null, idempotencyKey: null, idempotencyHuella: null },
    adelantoEntrega: { anuladaAt: null, liquidacionId: null, cubicacionId: null },
  };

  function delegado(tabla: keyof typeof db) {
    const filas = () => db[tabla];
    return {
      findFirst: async (a: { where?: Fila } = {}) => {
        const r = filas().find((x) => cumple(tabla, x, a.where));
        return r ? { ...r } : null;
      },
      findMany: async (a: { where?: Fila } = {}) => filas().filter((x) => cumple(tabla, x, a.where)).map((x) => ({ ...x })),
      create: async (a: { data: Fila }) => {
        const data = Object.fromEntries(Object.entries(a.data).map(([k, v]) => [k, norm(v)]));
        if (tabla === "adelantoEntrega" && data.idempotencyKey) {
          if (filas().some((x) => x.adelantoId === data.adelantoId && x.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const row: Fila = { id: `${tabla}-${++seq}`, createdAt: new Date(Date.now() + seq), updatedAt: new Date(), ...DEFAULTS[tabla], ...data };
        filas().push(row);
        return { ...row };
      },
      update: async (a: { where: { id: string }; data: Fila }) => {
        const row = filas().find((x) => x.id === a.where.id);
        if (!row) throw new Error(`no existe ${a.where.id}`);
        aplicarData(row, a.data);
        return { ...row };
      },
      updateMany: async (a: { where: Fila; data: Fila }) => {
        const rows = filas().filter((x) => cumple(tabla, x, a.where));
        rows.forEach((r) => aplicarData(r, a.data));
        return { count: rows.length };
      },
      aggregate: async (a: { where: Fila }) => ({
        _sum: { valor: filas().filter((x) => cumple(tabla, x, a.where)).reduce((t, x) => t + Number(x.valor), 0) },
      }),
    };
  }

  const prisma: Record<string, unknown> = {
    $executeRaw: async (s: TemplateStringsArray, ...vals: unknown[]) => {
      if (s.join("?").includes("pg_advisory_xact_lock")) pasos.push(`lock:${String(vals[0])}`);
      return 1;
    },
    $queryRaw: async (s: TemplateStringsArray, ...vals: unknown[]) => {
      const sql = s.join("?");
      if (sql.includes('"ForestCubicacionTrozas"')) {
        pasos.push("for-update:cubicacion");
        return [];
      }
      if (sql.includes("ANY(")) {
        pasos.push(`for-update:adelantos:${(vals[1] as string[]).join(",")}`);
        return [];
      }
      if (sql.includes('FROM "Adelanto"')) {
        const a = db.adelanto.find((x) => x.id === vals[0] && x.tenantId === vals[1]);
        return a ? [{ id: a.id }] : [];
      }
      return [];
    },
  };
  for (const t of Object.keys(db) as (keyof typeof db)[]) prisma[t] = delegado(t);
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const copia = structuredClone(db);
    try {
      return await fn(prisma);
    } catch (e) {
      Object.assign(db, copia);
      throw e;
    }
  };
  return { db, kv, pasos, prisma, mesCerrado: false };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ getOrSet: async (_k: string, _t: number, fn: () => unknown) => fn(), invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn(async () => {}) }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: {} }));
vi.mock("@/lib/db/forest-cubicaciones.db", () => ({ ForestCubicacionesDB: { list: async () => H.kv.map((x) => ({ ...x })) } }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => (H.mesCerrado ? { label: "octubre 2026" } : null) } }));
vi.mock("@/lib/db/forest-cuenta.db", () => ({
  ForestCuentaDB: {
    bloquearGuiasEnTx: async (_tx: unknown, _t: string, gtfs: string[]) => {
      H.pasos.push(`lock:guia:${gtfs.join(",")}`);
      return gtfs;
    },
    bloquearPartesEnTx: async (_tx: unknown, t: string, ids: string[]) => {
      H.pasos.push(`lock:liq:${t}:parte:${ids.join(",")}`);
    },
    crearDeCubicacionEnTx: async (_tx: unknown, t: string, base: Record<string, unknown>, patas: Record<string, unknown>[]) =>
      patas.map((p) => {
        const id = `mov-${H.db.forestCuentaMov.length + 1}`;
        H.db.forestCuentaMov.push({ id, tenantId: t, ...base, ...p, deletedAt: null, liquidacionId: null, createdAt: new Date() });
        return id;
      }),
    bajaDeCubicacionEnTx: async (_tx: unknown, t: string, ids: string[]) => {
      const vivas = H.db.forestCuentaMov.filter((m) => ids.includes(String(m.id)) && m.tenantId === t && m.deletedAt == null);
      for (const m of vivas) m.deletedAt = new Date();
      return vivas.length;
    },
    liquidacionPosteriorEnTx: async () => null,
    saldoDeParteEnTx: async () => 0,
    invalidar: () => {},
  },
}));

import { CubicacionTrozasError, ForestCubicacionTrozasDB } from "@/lib/db/forest-cubicacion-trozas.db";
import { CubicacionComercialDB } from "@/lib/db/forest-cubicacion-comercial.db";
import type { GuardarCubicacionInput } from "@/lib/forestal/cubicacion-cuenta";
import type { GuardarAserradaInput } from "@/lib/forestal/cubicacion-comercial-tipos";
import { ventasDeMadera, type DespachoEntrada } from "@/lib/finance/resultado-del-negocio";
import { claveCandadoGtf, puedeSerLaMismaGtf } from "@/lib/forestal/gtf-talonario";

const T = "t1";
const actor = { usuario: "brandon", ip: "127.0.0.1" };
const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return "sin error";
  } catch (e) {
    return e instanceof CubicacionTrozasError ? `${e.status} ${e.code}` : String(e);
  }
};
const saldo = (id: string) => Number(H.db.adelanto.find((a) => a.id === id)?.saldoPendiente);
const valorVenta = (id: string) => {
  const v = H.db.forestCtpEntry.find((d) => d.id === id)?.valorVenta;
  return v == null ? null : Number(v);
};
const adelanto = (id: string, fecha: string, monto: number, direccion: "DADO" | "RECIBIDO") => ({
  id, tenantId: T, beneficiarioId: "b1", codigoOperacion: `ADL-${id}`, direccion, status: "ABIERTO",
  fechaAdelanto: new Date(`${fecha}T15:00:00.000Z`), montoAdelantado: monto, saldoPendiente: monto, moneda: "PEN", modalidad: "CUENTA_CORRIENTE",
});
const gtf = (id: string, extra: Record<string, unknown> = {}) => ({
  id, tenantId: T, gtfNumber: "019-001-0000001", gtfDate: new Date("2025-10-09T00:00:00.000Z"), tipo: "trozas", status: "emitida",
  titularName: "Blas", tituloHabilitante: "TH-0001", volumenTotalM3: 1.347, deletedAt: null,
  items: [
    { code: "2-0001", species: "TORNILLO", diamMayorM: 0.58, diamMenorM: 0.5, lengthM: 2.78, volumeM3: 0.637 },
    { code: "1-0001", species: "TORNILLO", diamMayorM: 0.56, diamMenorM: 0.52, lengthM: 3.1, volumeM3: 0.71 },
    { code: "3-0001", species: "TORNILLO", volumeM3: 0.5 },
  ],
  ...extra,
});
const despacho = (id: string, extra: Record<string, unknown> = {}) => ({
  id, tenantId: T, section: "despacho", lineNo: 1, status: "registrado", deletedAt: null, gtfNumber: null,
  entryDate: new Date("2026-10-07T00:00:00.000Z"), speciesCommon: "Tornillo", quantity: 0.5, unit: "m3", pieces: 12,
  valorVenta: null, destino: "Lima", gtfDatos: null, ...extra,
});
const kv = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nombre: `Lote ${id}`, fecha: "2026-10-07", precioPt: 0, valor: 0, especie: "Tornillo",
  totales: { piezas: 12, pieTablar: 160, m3: 0.3774 },
  piezas: [
    { id: "p1", cantidad: 10, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: "Cumala" },
    { id: "p2", cantidad: 2, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" },
  ],
  createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z", ...extra,
});
/* Las 2 trozas de la guía con la cinta (Oxapampina, 2 Ø) y un hueco en la segunda. */
const deLaGuia: GuardarCubicacionInput = {
  fecha: "2026-10-08", formula: "oxapampina", diametros: 2, beneficiarioId: "b1", sentido: "compra",
  origen: "loth", origenId: "g1", gtfNumber: "lo que tipeó", descuentos: { pct: 5 },
  trozas: [
    { codigo: "1-0001", especie: "Tornillo", d1: 22, d2: 20.5, largo: 10.2 },
    { codigo: "2-0001", especie: "Tornillo", d1: 22.8, d2: 19.7, largo: 9.1, descuento: { hueco: 6 } },
  ],
};
const rapida = (pt: number, extra: Partial<GuardarAserradaInput> = {}): GuardarAserradaInput => ({
  material: "aserrada", modo: "total", fecha: "2026-10-08", beneficiarioId: "b1", sentido: "venta", origen: "libre",
  lineas: [{ especie: "Tornillo", pt }], ...extra,
});
const aplicar = (id: string, monto: number, extra: Record<string, unknown> = {}) =>
  ForestCubicacionTrozasDB.aplicar(T, id, { precios: [], precioGeneral: 5, montoVisto: monto, idempotencyKey: `clave-${id}-1`, version: 1, ...extra }, actor);

beforeEach(() => {
  for (const k of Object.keys(H.db) as (keyof typeof H.db)[]) H.db[k].length = 0;
  H.kv.length = 0;
  H.pasos.length = 0;
  H.mesCerrado = false;
  H.db.adelantoBeneficiario.push({ id: "b1", tenantId: T, nombre: "PRUEBA TEST - Cliente" });
  H.db.forestGtf.push(gtf("g1"), gtf("g-ajena", { tenantId: "t2" }), gtf("g-anulada", { status: "anulada" }));
  H.db.forestCtpEntry.push(
    despacho("d1"),
    despacho("d2", { gtfNumber: "019-002-0000009", valorVenta: 200, gtfDatos: { destinatario: { nombre: "Maderas del Sur" } } }),
    despacho("d3", { gtfNumber: "19-2-9", lineNo: 2, speciesCommon: "Cumala", quantity: 300, unit: "pt", valorVenta: 100 }),
    despacho("d-anulado", { status: "anulado" }),
    despacho("d-ajeno", { tenantId: "t2" }),
  );
  H.db.forestCtpDespachoOrigen.push({ id: "o1", tenantId: T, despachoEntryId: "d2", produccionEntryId: "prod-1" });
  H.kv.push(kv("kv-1"), kv("kv-2", { ctpEntryIds: ["prod-1"] }), kv("kv-3", { gtfNumber: "19-2-9" }));
});

describe("(O) trozas de una GTF del Libro TH", () => {
  it("13 · sin ingreso en el Libro CTP se guarda igual: N° de la GTF, la cifra SERFOR y el m³ de cada troza", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, deLaGuia, actor);
    expect([c.material, c.origen, c.origenId, c.gtfNumber, c.referenciaSmalianM3]).toEqual(["troza", "loth", "g1", "019-001-0000001", 1.347]);
    expect(c.trozas.map((t) => t.m3Guia)).toEqual([0.71, 0.637]);
    /* Dp 21,25″: × 10,2′ = 188 PT · × 9,1′ = 167,72 − hueco 6″ × 9,1′ (13,37) = 154,35 → 342,35 × 0,95 = 325,23 (bruto 355,72). */
    expect(c.trozas.map((t) => [t.bruto ?? null, t.volumen])).toEqual([[null, 188], [167.72, 154.35]]);
    expect([c.volumenBruto, c.volumen, c.descuentos]).toEqual([355.72, 325.23, { pct: 5 }]);
    expect(await codigoDe(ForestCubicacionTrozasDB.guardar(T, { ...deLaGuia, trozas: [{ especie: "Tornillo", d1: 20, d2: 18, largo: 10, descuento: { hueco: 18 } }] }, actor))).toBe(
      "422 DESCUENTO_INVALIDO",
    );

    const p = await CubicacionComercialDB.prefillLoth(T, "g1");
    expect(p.trozas).toEqual([
      { codigo: "1-0001", especie: "TORNILLO", d1: 22, d2: 20.5, largo: 10.2, m3Guia: 0.71 },
      { codigo: "2-0001", especie: "TORNILLO", d1: 22.8, d2: 19.7, largo: 9.1, m3Guia: 0.637 },
    ]);
    expect([p.sinMedidas, p.smalianDeclaradoM3, p.fecha, p.existentes.map((e) => e.codigo)]).toEqual([1, 1.347, "2025-10-09", [c.codigo]]);
  });

  it("14 · de otro negocio → 404 ORIGEN_NO_ENCONTRADO; anulada → 422 GUIA_ANULADA (guardar y prellenar)", async () => {
    expect(await codigoDe(ForestCubicacionTrozasDB.guardar(T, { ...deLaGuia, origenId: "g-ajena" }, actor))).toBe("404 ORIGEN_NO_ENCONTRADO");
    expect(await codigoDe(CubicacionComercialDB.prefillLoth(T, "g-ajena"))).toBe("404 ORIGEN_NO_ENCONTRADO");
    expect(await codigoDe(ForestCubicacionTrozasDB.guardar(T, { ...deLaGuia, origenId: "g-anulada" }, actor))).toBe("422 GUIA_ANULADA");
    expect(await codigoDe(CubicacionComercialDB.prefillLoth(T, "g-anulada"))).toBe("422 GUIA_ANULADA");
    expect(H.db.forestCubicacionTrozas).toHaveLength(0);
  });

  it("15 · ya ingresada al Libro CTP → el N° se guarda como el del libro (los frenos la ven igual)", async () => {
    H.db.woodEntry.push({ id: "w1", tenantId: T, gtfNumber: "19-1-1", deletedAt: null, status: "registrado", costoTotal: null, entryDate: new Date() });
    expect((await ForestCubicacionTrozasDB.guardar(T, deLaGuia, actor)).gtfNumber).toBe("19-1-1");
  });

  it("16 · aplicar con la guía con costo en el Libro CTP → 409 GUIA_YA_VALORIZADA, sin tocar los adelantos", async () => {
    H.db.adelanto.push(adelanto("a1", "2026-09-01", 5000, "DADO"));
    const c = await ForestCubicacionTrozasDB.guardar(T, deLaGuia, actor);
    H.db.woodEntry.push({ id: "w1", tenantId: T, gtfNumber: "019-001-0000001", deletedAt: null, status: "registrado", costoTotal: 900, entryDate: new Date() });
    expect(await codigoDe(aplicar(c.id, 1626.15))).toBe("409 GUIA_YA_VALORIZADA");
    expect([saldo("a1"), H.db.adelantoEntrega.length]).toEqual([5000, 0]);
    /* Sin el costo, la guía se paga UNA vez: precio general S/ 5 por PT × 325,23 PT. */
    H.db.woodEntry.length = 0;
    expect((await aplicar(c.id, 1626.15)).cubicacion.monto).toBe(1626.15);
    expect(saldo("a1")).toBe(3373.85);
  });
});

describe("(A) madera aserrada", () => {
  it("17 · despacho de otro negocio o anulado → 404 ORIGEN_NO_ENCONTRADO; la guía es la del despacho, no la del cuerpo", async () => {
    expect(await codigoDe(CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d-ajeno" }), actor))).toBe("404 ORIGEN_NO_ENCONTRADO");
    expect(await codigoDe(CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d-anulado" }), actor))).toBe("404 ORIGEN_NO_ENCONTRADO");
    expect(await codigoDe(CubicacionComercialDB.prefillDespacho(T, "d-ajeno"))).toBe("404 ORIGEN_NO_ENCONTRADO");
    const c = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d2", gtfNumber: "otra" }), actor);
    expect([c.material, c.formula, c.unidad, c.diametros, c.gtfNumber, c.origenId]).toEqual(["aserrada", "tablar", "PT", 2, "019-002-0000009", "d2"]);
  });

  it("prellenado del despacho: líneas de la misma guía, valor del libro, guardadas ligadas primero", async () => {
    const p = await CubicacionComercialDB.prefillDespacho(T, "d2");
    expect(p.lineas.map((l) => [l.id, l.especie, l.m3, l.ptLibro])).toEqual([["d2", "Tornillo", 0.5, null], ["d3", "Cumala", null, 300]]);
    expect([p.destinatario, p.valorVentaLibro]).toEqual(["Maderas del Sur", 300]);
    expect(p.guardadas.map((g) => [g.id, g.ligada])).toEqual([["kv-2", true], ["kv-3", true], ["kv-1", false]]);
    /* Una línea sin valor de venta = valor desconocido, nunca 0. */
    expect((await CubicacionComercialDB.prefillDespacho(T, "d1")).valorVentaLibro).toBeNull();
  });

  it("18 · un despacho sin guía, una sola cubicación aplicada → 409 DESPACHO_YA_VALORIZADO (lock guía → despacho → persona)", async () => {
    H.db.adelanto.push(adelanto("r1", "2026-09-01", 2000, "RECIBIDO"));
    const a = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d1" }), actor);
    const b = await CubicacionComercialDB.guardarAserrada(T, rapida(120, { origen: "despacho", origenId: "d1" }), actor);
    await aplicar(a.id, 500);
    expect(H.pasos.indexOf("lock:cub:t1:despacho:d1")).toBeLessThan(H.pasos.indexOf("lock:liq:t1:benef:b1"));
    expect(await codigoDe(aplicar(b.id, 600))).toBe("409 DESPACHO_YA_VALORIZADO");
    expect(saldo("r1")).toBe(1500);
    /* ADR-484 (2): la venta llenó el valor de venta vacío del despacho, y anularla lo vacía (sigue siendo el suyo). */
    expect(valorVenta("d1")).toBe(500);
    expect((await CubicacionComercialDB.prefillDespacho(T, "d1")).valorVentaDe).toBe(a.codigo);
    await ForestCubicacionTrozasDB.anular(T, a.id, "se midió mal", actor);
    expect(valorVenta("d1")).toBeNull();
    /* El despacho se anuló después de guardar: no se cobra. */
    const d1 = H.db.forestCtpEntry.find((d) => d.id === "d1");
    if (d1) d1.status = "anulado";
    expect(await codigoDe(aplicar(b.id, 600))).toBe("404 ORIGEN_NO_ENCONTRADO");
  });

  it("18b · la GTF de salida llega DESPUÉS y junta líneas: la cubicación de la otra línea → 409 DESPACHO_YA_VALORIZADO", async () => {
    H.db.adelanto.push(adelanto("r1", "2026-09-01", 2000, "RECIBIDO"));
    H.db.forestCtpEntry.push(despacho("d4", { lineNo: 2 }));
    const a = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d1" }), actor);
    const antes = await CubicacionComercialDB.guardarAserrada(T, rapida(120, { origen: "despacho", origenId: "d4" }), actor);
    await aplicar(a.id, 500);
    /* Se emite la guía para d1 y d4 (`mismaGuiaQue`): A quedó con la guía congelada en null. */
    for (const d of H.db.forestCtpEntry) if (d.id === "d1" || d.id === "d4") d.gtfNumber = "019-002-0000050";
    const despues = await CubicacionComercialDB.guardarAserrada(T, rapida(120, { origen: "despacho", origenId: "d4" }), actor);
    expect(despues.gtfNumber).toBe("019-002-0000050");
    H.pasos.length = 0;
    expect(await codigoDe(aplicar(despues.id, 600))).toBe("409 DESPACHO_YA_VALORIZADO");
    /* Guía de hoy → TODAS sus líneas en orden de id → persona. */
    expect(H.pasos.slice(0, 4)).toEqual(["lock:guia:019-002-0000050", "lock:cub:t1:despacho:d1", "lock:cub:t1:despacho:d4", "lock:liq:t1:benef:b1"]);
    /* La guardada antes de la guía (congelada en null) también: manda la guía de HOY. */
    expect(await codigoDe(aplicar(antes.id, 600))).toBe("409 DESPACHO_YA_VALORIZADO");
    expect(saldo("r1")).toBe(1500);
  });

  it("18c · las mismas piezas del Cubicador de madera se cobran una vez por sentido → 409 REF_YA_VALORIZADA", async () => {
    H.db.adelanto.push(adelanto("r1", "2026-09-01", 5000, "RECIBIDO"), adelanto("a1", "2026-09-01", 5000, "DADO"));
    const porPieza = (sentido: "compra" | "venta") =>
      CubicacionComercialDB.guardarAserrada(T, { ...rapida(1), sentido, modo: "pieza", lineas: undefined, cubicacionRefId: "kv-1" }, actor);
    const v1 = await porPieza("venta");
    const v2 = await porPieza("venta");
    const c1 = await porPieza("compra");
    await aplicar(v1.id, 800);
    expect(H.pasos).toContain("lock:cub:t1:ref:kv-1");
    expect(await codigoDe(aplicar(v2.id, 800))).toBe("409 REF_YA_VALORIZADA");
    expect(saldo("r1")).toBe(4200);
    /* Comprar el lote y después venderlo sigue valiendo. */
    await aplicar(c1.id, 800);
    expect(saldo("a1")).toBe(4200);
    /* Anulada la venta, la otra se puede cobrar. */
    await ForestCubicacionTrozasDB.anular(T, v1.id, "se cobró mal", actor);
    expect(await codigoDe(aplicar(v2.id, 800))).toBe("sin error");
  });

  it("19 · uno por uno copia las piezas del Cubicador de madera (no las del cuerpo); otra id → 404", async () => {
    const c = await CubicacionComercialDB.guardarAserrada(
      T,
      { ...rapida(1), modo: "pieza", lineas: undefined, cubicacionRefId: "kv-1", descuentos: { porEspecie: [{ clave: "cumala", menos: 33.33 }] } },
      actor,
    );
    expect(c.piezas?.map((p) => [p.especie, p.cantidad, p.volumen])).toEqual([["Cumala", 10, 133.33], ["Tornillo", 2, 26.67]]);
    expect([c.cubicacionRefId, c.nTrozas, c.volumenBruto, c.volumen, c.trozas]).toEqual(["kv-1", 12, 160, 126.67, []]);
    expect(await codigoDe(CubicacionComercialDB.guardarAserrada(T, { ...rapida(1), modo: "pieza", lineas: undefined, cubicacionRefId: "kv-9" }, actor))).toBe(
      "404 CUBICACION_REF_NO_ENCONTRADA",
    );
  });

  it("20 · aplicar una venta devuelve sus RECIBIDOS en orden; más que lo que se debe → 422; anular devuelve", async () => {
    H.db.adelanto.push(adelanto("r1", "2026-08-01", 300, "RECIBIDO"), adelanto("r2", "2026-09-01", 500, "RECIBIDO"));
    const mucha = await CubicacionComercialDB.guardarAserrada(T, rapida(1000), actor);
    /* ADR-484: más que lo que te adelantó → el resto queda debiéndote en su cuenta; sin ficha en el directorio, no hay dónde. */
    expect(await codigoDe(aplicar(mucha.id, 5000))).toBe("422 SIN_CUENTA");
    const c = await CubicacionComercialDB.guardarAserrada(T, rapida(100), actor);
    const r = await aplicar(c.id, 500);
    expect(r.imputacion.map((i) => [i.adelantoId, i.monto])).toEqual([["r1", 300], ["r2", 200]]);
    expect(String(H.db.adelantoEntrega[0].descripcion)).toBe(`Madera aserrada · ${c.codigo} · 100 PT · parte 1 de 2`);
    expect([saldo("r1"), saldo("r2")]).toEqual([0, 300]);
    await ForestCubicacionTrozasDB.anular(T, c.id, "no era esa madera", actor);
    expect([saldo("r1"), saldo("r2")]).toEqual([300, 500]);
  });

  it("20b · ADR-484: con ficha, lo que el RECIBIDO no cubre queda debiéndote; el valor del libro no se pisa; cambiado a mano o mes cerrado no se toca", async () => {
    H.db.forestParty.push({ id: "p1", tenantId: T, nombre: "Cliente SAC", deletedAt: null });
    const b = H.db.adelantoBeneficiario.find((x) => x.id === "b1");
    if (b) b.forestPartyId = "p1";
    H.db.adelanto.push(adelanto("r1", "2026-08-01", 300, "RECIBIDO"));
    /* d2 + d3 (misma guía, 200 + 100 en el libro). */
    const c = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d2" }), actor);
    const r = await aplicar(c.id, 500);
    expect(r.imputacion.map((i) => [i.adelantoId, i.monto])).toEqual([["r1", 300]]);
    expect(r.cubicacion.aCuenta).toMatchObject({ parteId: "p1", monto: 200, sentido: "venta" });
    const vivos = () => H.db.forestCuentaMov.filter((m) => m.deletedAt == null);
    expect(vivos().map((m) => [m.tipo, m.concepto, m.monto, m.gtfNumber])).toEqual([
      ["cargo", "venta", 500, "019-002-0000009"],
      ["abono", "compensacion", 300, "019-002-0000009"],
    ]);
    expect(r.cubicacion.valorVenta).toMatchObject({ estado: "ya_tenia", previo: 300, diferencia: 200 });
    expect([valorVenta("d2"), valorVenta("d3")]).toEqual([200, 100]);
    await ForestCubicacionTrozasDB.anular(T, c.id, "mal", actor);
    expect(vivos()).toHaveLength(0);
    expect([saldo("r1"), valorVenta("d2"), valorVenta("d3")]).toEqual([300, 200, 100]);

    /* Lo llenó la cubicación y después alguien lo cambió a mano: anular no lo vacía. */
    H.db.forestCtpEntry.push(despacho("d5", { lineNo: 5 }));
    const d = await CubicacionComercialDB.guardarAserrada(T, rapida(10, { origen: "despacho", origenId: "d5" }), actor);
    await aplicar(d.id, 50);
    expect(valorVenta("d5")).toBe(50);
    const d5 = H.db.forestCtpEntry.find((x) => x.id === "d5");
    if (d5) d5.valorVenta = 55;
    await ForestCubicacionTrozasDB.anular(T, d.id, "mal", actor);
    expect(valorVenta("d5")).toBe(55);

    /* Mes cerrado: el despacho vacío se queda vacío. */
    H.mesCerrado = true;
    const m = await CubicacionComercialDB.guardarAserrada(T, rapida(10, { origen: "despacho", origenId: "d1" }), actor);
    const rm = await aplicar(m.id, 50);
    expect(rm.cubicacion.valorVenta?.estado).toBe("mes_cerrado");
    expect(valorVenta("d1")).toBeNull();
  });
});

describe("lo genérico", () => {
  it("21 · la lista sin material trae sólo trozas; `todas` trae las dos; por origen", async () => {
    await ForestCubicacionTrozasDB.guardar(T, deLaGuia, actor);
    await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d1" }), actor);
    expect((await ForestCubicacionTrozasDB.list(T)).map((c) => c.material)).toEqual(["troza"]);
    expect((await ForestCubicacionTrozasDB.list(T, { material: "todas" })).length).toBe(2);
    expect((await ForestCubicacionTrozasDB.list(T, { material: "todas", origen: "despacho", origenId: "d1" })).map((c) => c.material)).toEqual(["aserrada"]);
  });

  it("22 · corregir con otro material → 409 MATERIAL_DISTINTO (en los dos sentidos)", async () => {
    const t = await ForestCubicacionTrozasDB.guardar(T, deLaGuia, actor);
    const a = await CubicacionComercialDB.guardarAserrada(T, rapida(100), actor);
    expect(await codigoDe(CubicacionComercialDB.editarAserrada(T, t.id, { ...rapida(90), version: 1 }, actor))).toBe("409 MATERIAL_DISTINTO");
    expect(await codigoDe(ForestCubicacionTrozasDB.editar(T, a.id, { ...deLaGuia, version: 1 }, actor))).toBe("409 MATERIAL_DISTINTO");
    expect((await CubicacionComercialDB.editarAserrada(T, a.id, { ...rapida(90), version: 1 }, actor)).volumen).toBe(90);
  });

  it("22b · la fila manda el origen: sin origen se hereda la GTF del Libro TH; otro origen → 409 ORIGEN_DISTINTO", async () => {
    const t = await ForestCubicacionTrozasDB.guardar(T, deLaGuia, actor);
    const heredada = await ForestCubicacionTrozasDB.editar(T, t.id, { ...deLaGuia, origen: undefined, origenId: undefined, gtfNumber: "otra", version: 1 }, actor);
    expect([heredada.origen, heredada.origenId, heredada.gtfNumber, heredada.version]).toEqual(["loth", "g1", "019-001-0000001", 2]);
    expect(await codigoDe(ForestCubicacionTrozasDB.editar(T, t.id, { ...deLaGuia, origen: "libre", origenId: undefined, version: 2 }, actor))).toBe("409 ORIGEN_DISTINTO");
    const a = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d2" }), actor);
    expect(await codigoDe(CubicacionComercialDB.editarAserrada(T, a.id, { ...rapida(90), version: 1 }, actor))).toBe("409 ORIGEN_DISTINTO");
    expect(await codigoDe(CubicacionComercialDB.editarAserrada(T, a.id, { ...rapida(90, { origen: "despacho", origenId: "d1" }), version: 1 }, actor))).toBe("409 ORIGEN_DISTINTO");
    expect((await CubicacionComercialDB.editarAserrada(T, a.id, { ...rapida(90, { origen: "despacho", origenId: "d2" }), version: 1 }, actor)).volumen).toBe(90);
  });

  it("23 · `tablar` se lee como tablar (PT), nunca como Smalian", async () => {
    const a = await CubicacionComercialDB.guardarAserrada(T, rapida(33.33), actor);
    const leida = await ForestCubicacionTrozasDB.get(T, a.id);
    expect([leida?.formula, leida?.unidad, leida?.lineas?.[0]?.pt]).toEqual(["tablar", "PT", 33.33]);
    expect((await ForestCubicacionTrozasDB.list(T, { material: "aserrada" }))[0]).toMatchObject({ formula: "tablar", unidad: "PT", modo: "total" });
  });
});

/* Revisión 08-10 de ADR-484: llenar el valor de venta enciende «Anotar la venta de la guía» (`CtpVentaDeLaGuia`), cuyo
   freno sólo veía un cargo con el texto exacto de la guía. La cuenta REAL para anotar: el mock de arriba trae sólo las
   primitivas de «aplicar». */
describe("ADR-484 · una venta, un solo cobro", () => {
  const cuentaReal = () => vi.importActual<typeof import("@/lib/db/forest-cuenta.db")>("@/lib/db/forest-cuenta.db");
  const anotar = async (gtfNumber: string, total = 500) =>
    (await cuentaReal()).ForestCuentaDB.anotarVentaDeGuia(T, { parteId: "p1", parteNombre: "Cliente SAC", fecha: "2026-10-08", gtfNumber, total }, "brandon");
  const errorDe = async (p: Promise<unknown>) => {
    try {
      await p;
      return "sin error";
    } catch (e) {
      return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  };
  const vivos = () => H.db.forestCuentaMov.filter((m) => m.deletedAt == null);
  /* Lo que el resultado del negocio suma como venta de madera (ADR-451) con ese despacho y la cuenta. */
  const ventaEnResultado = (despachoId: string) =>
    ventasDeMadera(
      H.db.forestCtpEntry
        .filter((d) => d.id === despachoId)
        .map((d) => ({ id: d.id, lineNo: d.lineNo, gtfSalida: d.gtfNumber ?? null, valorVenta: d.valorVenta ?? null, cogs: 100, moneda: "PEN", motivo: null, fecha: "2026-10-07" }) as unknown as DespachoEntrada),
      vivos().map((m) => ({
        id: String(m.id), parteId: String(m.parteId), parteNombre: String(m.parteNombre), fecha: "2026-10-08", tipo: String(m.tipo), concepto: String(m.concepto),
        monto: Number(m.monto), moneda: "PEN", referencia: (m.referencia as string | null) ?? null, ctpEntryId: null, liquidacionId: null, gtfNumber: (m.gtfNumber as string | null) ?? null,
      })),
    ).reduce((t, g) => t + (g.venta ?? 0), 0);
  const emitirGuia = (id: string, gtfNumber: string) => {
    const d = H.db.forestCtpEntry.find((x) => x.id === id);
    if (d) d.gtfNumber = gtfNumber;
  };

  beforeEach(() => {
    H.db.forestParty.push({ id: "p1", tenantId: T, nombre: "Cliente SAC", deletedAt: null });
    const b = H.db.adelantoBeneficiario.find((x) => x.id === "b1");
    if (b) b.forestPartyId = "p1";
  });

  it("A · sin guía y con resto a la cuenta: no llena el valor de venta, la venta sale UNA vez; la guía emitida después ya no se anota (409)", async () => {
    H.db.adelanto.push(adelanto("r1", "2026-08-01", 300, "RECIBIDO"));
    const c = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d1" }), actor);
    const r = await aplicar(c.id, 500);
    expect(r.cubicacion.valorVenta?.estado).toBe("sin_guia");
    expect(valorVenta("d1")).toBeNull();
    expect(vivos().map((m) => [m.tipo, m.concepto, m.monto, m.referencia ?? null])).toEqual([
      ["cargo", "venta", 500, null],
      ["abono", "compensacion", 300, null],
    ]);
    expect(ventaEnResultado("d1")).toBe(500);

    emitirGuia("d1", "019-002-0000077");
    expect(ventaEnResultado("d1")).toBe(500);
    H.pasos.length = 0;
    const e = await errorDe(anotar("19-2-77"));
    expect(e).toMatch(/^GuiaCobradaPorCubicacionError: /);
    expect(e).toContain(c.codigo);
    /* Los candados de «aplicar», en su orden: guía → sus líneas de despacho → persona. */
    expect(H.pasos[0]).toMatch(/^lock:guia-plata:t1:/);
    expect(H.pasos.slice(1)).toEqual(["lock:cub:t1:despacho:d1", "lock:liq:t1:parte:p1"]);
    expect(vivos()).toHaveLength(2);

    /* Una venta suelta con esa guía tampoco la cobra otra vez. */
    const suelta = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { gtfNumber: "019-002-0000077" }), actor);
    expect(await codigoDe(aplicar(suelta.id, 500))).toBe("409 DESPACHO_YA_VALORIZADO");
  });

  it("B · el adelanto cubrió todo (sin cargo): el valor de venta se llena y anotar la guía → 409; anulada la cubicación, se anota una vez", async () => {
    H.db.adelanto.push(adelanto("r1", "2026-08-01", 2000, "RECIBIDO"));
    const c = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d1" }), actor);
    const r = await aplicar(c.id, 500);
    expect(r.cubicacion.aCuenta ?? null).toBeNull();
    expect(valorVenta("d1")).toBe(500);
    emitirGuia("d1", "019-002-0000077");
    expect(await errorDe(anotar("019-002-0000077"))).toContain(c.codigo);
    expect(vivos()).toHaveLength(0);
    expect(ventaEnResultado("d1")).toBe(500);

    H.pasos.length = 0;
    await ForestCubicacionTrozasDB.anular(T, c.id, "se cobra por la guía", actor);
    /* Anular toma la guía de HOY del despacho y sus líneas, como «aplicar». */
    expect(H.pasos.slice(0, 2)).toEqual(["lock:guia:019-002-0000077", "lock:cub:t1:despacho:d1"]);
    expect(valorVenta("d1")).toBeNull();
    expect(await errorDe(anotar("019-002-0000077"))).toBe("sin error");
    expect(vivos().map((m) => [m.tipo, m.concepto, m.monto, m.referencia])).toEqual([["cargo", "venta", 500, "019-002-0000077"]]);
    /* La misma guía escrita corta ya está anotada: se compara el N°, no el texto. */
    expect(await errorDe(anotar("19-2-77"))).toMatch(/^GuiaYaAnotadaError: /);
  });

  it("C · el cargo lleva la guía como la escribe HOY el despacho: con su valor de venta, el resultado los junta (no 1000)", async () => {
    emitirGuia("d1", "019-002-0000077");
    H.db.adelanto.push(adelanto("r1", "2026-08-01", 300, "RECIBIDO"));
    const c = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { origen: "despacho", origenId: "d1" }), actor);
    expect(c.gtfNumber).toBe("019-002-0000077");
    /* El libro corrige cómo está escrita la guía: el N° es el mismo. */
    emitirGuia("d1", "19-2-77");
    await aplicar(c.id, 500);
    expect(valorVenta("d1")).toBe(500);
    expect(vivos().map((m) => [m.tipo, m.referencia, m.gtfNumber])).toEqual([
      ["cargo", "19-2-77", "19-2-77"],
      ["abono", "19-2-77", "19-2-77"],
    ]);
    expect(ventaEnResultado("d1")).toBe(500);

    /* Una venta suelta con la guía tipeada como otra línea: el cargo lleva el N° como lo escribe el despacho (su primera línea). */
    const suelta = await CubicacionComercialDB.guardarAserrada(T, rapida(10, { gtfNumber: "19-2-9" }), actor);
    expect(suelta.gtfNumber).toBe("19-2-9");
    await aplicar(suelta.id, 50);
    expect(vivos().filter((m) => String(m.notas).includes(suelta.codigo)).map((m) => [m.tipo, m.referencia])).toEqual([["cargo", "019-002-0000009"]]);
  });

  it("D · la guía escrita corta («065») y completa («019-001-0000065») es la misma para el freno (la regla del candado)", async () => {
    /* Anotada completa → la venta suelta corta no la cobra otra vez. */
    expect(await errorDe(anotar("019-001-0000065"))).toBe("sin error");
    const corta = await CubicacionComercialDB.guardarAserrada(T, rapida(100, { gtfNumber: "065" }), actor);
    expect(corta.gtfNumber).toBe("065");
    expect(await codigoDe(aplicar(corta.id, 500))).toBe("409 GUIA_YA_ANOTADA");

    /* Al revés: la venta suelta corta se cobra primero → anotar la completa es 409 con su código. */
    for (const m of vivos()) m.deletedAt = new Date();
    H.db.adelanto.push(adelanto("r1", "2026-08-01", 2000, "RECIBIDO"));
    await aplicar(corta.id, 500);
    const e = await errorDe(anotar("019-001-0000065"));
    expect(e).toMatch(/^GuiaCobradaPorCubicacionError: /);
    expect(e).toContain(corta.codigo);
    /* «065» también calza con otra serie: el freno no adivina cuál es y frena (mejor revisar que cobrar dos veces). */
    expect(await errorDe(anotar("019-002-0000065"))).toMatch(/^GuiaCobradaPorCubicacionError: /);
    /* Dos números completos de series distintas nunca son la misma guía; el candado es el mismo (la cola). */
    expect([puedeSerLaMismaGtf("065", "019-001-0000065"), puedeSerLaMismaGtf("1-65", "19-001-0000065"), puedeSerLaMismaGtf("19-1-65", "19-2-65")]).toEqual([true, true, false]);
    expect(claveCandadoGtf("065")).toBe(claveCandadoGtf("019-001-0000065"));
  });

  it("E · con la venta en la cuenta, el valor de venta sólo va a las líneas escritas como el cargo; el resultado la cuenta UNA vez (no 1500)", async () => {
    /* d2 «019-002-0000009» y d3 «19-2-9»: la misma guía escrita distinto, las dos vacías y repartibles (Tornillo, m³). */
    for (const id of ["d2", "d3"]) {
      const d = H.db.forestCtpEntry.find((x) => x.id === id);
      if (d) Object.assign(d, { valorVenta: null, speciesCommon: "Tornillo", unit: "m3", quantity: 0.5 });
    }
    H.db.adelanto.push(adelanto("r1", "2026-08-01", 300, "RECIBIDO"));
    const c = await CubicacionComercialDB.guardarAserrada(T, rapida(200, { origen: "despacho", origenId: "d2" }), actor);
    await aplicar(c.id, 1000);
    expect(vivos().find((m) => m.concepto === "venta")?.referencia).toBe("019-002-0000009");
    expect([valorVenta("d2"), valorVenta("d3")]).toEqual([1000, null]);
    const grupos = ventasDeMadera(
      H.db.forestCtpEntry
        .filter((d) => d.id === "d2" || d.id === "d3")
        .map((d) => ({ id: d.id, lineNo: d.lineNo, gtfSalida: d.gtfNumber ?? null, valorVenta: d.valorVenta ?? null, cogs: 100, moneda: "PEN", motivo: null, fecha: "2026-10-07" }) as unknown as DespachoEntrada),
      vivos().map((m) => ({
        id: String(m.id), parteId: String(m.parteId), parteNombre: String(m.parteNombre), fecha: "2026-10-08", tipo: String(m.tipo), concepto: String(m.concepto),
        monto: Number(m.monto), moneda: "PEN", referencia: (m.referencia as string | null) ?? null, ctpEntryId: null, liquidacionId: null, gtfNumber: (m.gtfNumber as string | null) ?? null,
      })),
    );
    expect(grupos.map((g) => [g.venta, g.origenVenta, g.costo])).toEqual([[1000, "cuenta", 200]]);
  });

  it("F · ventasDeMadera junta por el N°: «19-2-9» con «019-002-0000009», «065» con la única completa; dos series no se juntan", () => {
    const d = (id: string, gtfSalida: string, valor: number) =>
      ({ id, lineNo: 1, gtfSalida, valorVenta: valor, cogs: 10, moneda: "PEN", motivo: null, fecha: "2026-10-07" }) as unknown as DespachoEntrada;
    const cargo = (id: string, referencia: string, monto: number) => ({
      id, parteId: "p1", parteNombre: "Cliente SAC", fecha: "2026-10-08", tipo: "cargo", concepto: "venta", monto, moneda: "PEN", referencia, ctpEntryId: null, liquidacionId: null, gtfNumber: referencia,
    });
    const suma = (gs: ReturnType<typeof ventasDeMadera>) => gs.reduce((t, g) => t + (g.venta ?? 0), 0);
    expect(suma(ventasDeMadera([d("a", "19-2-9", 400)], [cargo("c1", "019-002-0000009", 1000)]))).toBe(1000);
    expect(suma(ventasDeMadera([d("a", "065", 400)], [cargo("c1", "019-001-0000065", 1000)]))).toBe(1000);
    /* «065» calza con dos series: no se adivina, y las dos completas siguen siendo dos ventas. */
    const tres = ventasDeMadera([d("a", "019-001-0000065", 100), d("b", "019-002-0000065", 200), d("c", "065", 50)], []);
    expect(tres).toHaveLength(3);
    expect(suma(tres)).toBe(350);
  });

  it("G · una pata de cubicación aplicada no se borra suelta (`array_contains` sobre la imputación); con «CUB-» en la nota pero ajena, sí", async () => {
    H.db.adelanto.push(adelanto("r1", "2026-08-01", 300, "RECIBIDO"));
    const c = await CubicacionComercialDB.guardarAserrada(T, rapida(100), actor);
    await aplicar(c.id, 500);
    const patas = vivos();
    expect(patas.map((m) => m.concepto)).toEqual(["venta", "compensacion"]);
    const { ForestCuentaDB, MovimientoDeCubicacionError } = await cuentaReal();
    for (const m of patas) {
      const e = await ForestCuentaDB.eliminar(T, String(m.id), "brandon").catch((x: unknown) => x);
      expect(e).toBeInstanceOf(MovimientoDeCubicacionError);
      expect(String((e as Error).message)).toContain(c.codigo);
    }
    H.db.forestCuentaMov.push({ id: "mov-suelto", tenantId: T, parteId: "p1", parteNombre: "Cliente SAC", tipo: "abono", concepto: "pago", monto: 50, notas: `Pago a cuenta de ${c.codigo}`, deletedAt: null, liquidacionId: null });
    expect(await ForestCuentaDB.eliminar(T, "mov-suelto", "brandon")).toBe(true);
    expect(vivos()).toHaveLength(2);
  });

  it("H · el cruce de la cuenta se reconoce como de cubicación (no suma otra vez en «nunca fue caja»)", async () => {
    const { esCruceDeCubicacion } = await import("@/lib/finance/resultado-del-negocio");
    const { patasDeCuenta } = await import("@/lib/forestal/cubicacion-a-cuenta");
    for (const sentido of ["venta", "compra"] as const) {
      const patas = patasDeCuenta({ sentido, total: 500, resto: 200, codigo: "CUB-2026-0007", detalle: "Madera · CUB-2026-0007 · 2 trozas", adelantos: ["ADL-1"] });
      expect(patas.map((p) => esCruceDeCubicacion(p))).toEqual([false, true]);
    }
    expect(esCruceDeCubicacion({ concepto: "compensacion", notas: "Cruce a mano con su deuda" })).toBe(false);
  });
});
