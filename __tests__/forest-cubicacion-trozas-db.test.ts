/**
 * ADR-478 · ForestCubicacionTrozasDB sobre una base en memoria: guardar →
 * aplicar (entregas con `cubicacionId`, saldos) → anular, con la idempotencia,
 * el guard de la guía, la liquidación posterior y el aislamiento por negocio.
 *
 * Corre el `AdelantosDB.registrarEntregaEnTx` REAL: los saldos que se afirman
 * son los que recalcula la única clase que escribe `AdelantoEntrega`.
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
    /* Las líneas de despacho de una guía de venta (ADR-484: el texto de la guía y el freno de una venta ya cobrada). */
    forestCtpEntry: [] as Fila[],
  };
  const pasos: string[] = [];
  let seq = 0;

  /* Decimal de Prisma → número, así el estado se puede copiar con structuredClone. */
  const norm = (v: unknown): unknown =>
    v && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function" ? (v as { toNumber: () => number }).toNumber() : v;

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
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        const op = v as Fila;
        if ("in" in op && !(op.in as unknown[]).includes(actual)) return false;
        if ("notIn" in op && (op.notIn as unknown[]).includes(actual)) return false;
        if ("not" in op && (op.not === null ? actual === null : actual === op.not)) return false;
        if ("gt" in op && !(actual instanceof Date && actual > (op.gt as Date))) return false;
        if ("startsWith" in op && !String(actual).startsWith(String(op.startsWith))) return false;
        /* `mode: "insensitive"` de Prisma: la cola del N° de guía (`filtroMismaGuia`). */
        if ("endsWith" in op && !String(actual ?? "").toUpperCase().endsWith(String(op.endsWith).toUpperCase())) return false;
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
  return { db, pasos, prisma };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ getOrSet: async (_k: string, _t: number, fn: () => unknown) => fn(), invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn(async () => {}) }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: {} }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null } }));
/* La cuenta forestal (ADR-484): las primitivas escriben en la tabla en memoria, así anular se puede afirmar. */
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
    liquidacionPosteriorEnTx: async (_tx: unknown, t: string, parteId: string, desde: Date) =>
      H.db.forestCuentaMov.some((m) => m.tenantId === t && m.parteId === parteId && m.deletedAt == null && m.liquidacionId != null && (m.createdAt as Date) > desde)
        ? "LIQ-2026-0009"
        : null,
    saldoDeParteEnTx: async () => 0,
    invalidar: () => {},
  },
}));

import { CubicacionTrozasError, ForestCubicacionTrozasDB } from "@/lib/db/forest-cubicacion-trozas.db";
import { AdelantoConLiquidacionError, AdelantosDB } from "@/lib/db/adelantos.db";
import { agruparPorEspecie, cubicarEnServidor, valorizar, type GuardarCubicacionInput } from "@/lib/forestal/cubicacion-cuenta";
import type { Prisma } from "@/lib/generated/prisma/client";

const T = "t1";
const actor = { usuario: "brandon", ip: "127.0.0.1" };
const adelanto = (id: string, fecha: string, monto: number, extra: Record<string, unknown> = {}) => ({
  id, tenantId: T, beneficiarioId: "b1", codigoOperacion: `ADL-${id}`, direccion: "DADO", status: "ABIERTO",
  fechaAdelanto: new Date(`${fecha}T15:00:00.000Z`), montoAdelantado: monto, saldoPendiente: monto, moneda: "PEN", modalidad: "CUENTA_CORRIENTE", ...extra,
});
const entrada: GuardarCubicacionInput = {
  fecha: "2026-10-08",
  formula: "oxapampina",
  diametros: 1,
  beneficiarioId: "b1",
  sentido: "compra",
  trozas: [
    { especie: "Tornillo", d1: 20, largo: 12 },
    { especie: "Tornillo", d1: 18, largo: 10 },
    { especie: "Cumala", d1: 22, largo: 14 },
  ],
};
const precios = [{ clave: "tornillo", precio: 8 }, { clave: "cumala", precio: 5 }];
const montoDe = (p = precios) => {
  const { trozas } = cubicarEnServidor("oxapampina", entrada.trozas, 1);
  return valorizar(agruparPorEspecie(trozas, "oxapampina"), p).monto;
};
const aplicarCon = (id: string, extra: Record<string, unknown> = {}) =>
  ForestCubicacionTrozasDB.aplicar(T, id, { precios, montoVisto: montoDe(), idempotencyKey: "clave-aplicar-1", version: 1, ...extra }, actor);
const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return "sin error";
  } catch (e) {
    return e instanceof CubicacionTrozasError ? `${e.status} ${e.code}` : String(e);
  }
};
const saldo = (id: string) => Number(H.db.adelanto.find((a) => a.id === id)?.saldoPendiente);
/* ADR-484: la ficha de Juan en el directorio, vinculada a su cuenta de adelantos. */
const conFicha = () => {
  H.db.forestParty.push({ id: "p1", tenantId: T, nombre: "Juan Perez", deletedAt: null });
  const b = H.db.adelantoBeneficiario.find((x) => x.id === "b1");
  if (b) b.forestPartyId = "p1";
};
const movs = () => H.db.forestCuentaMov.filter((m) => m.deletedAt == null && m.liquidacionId == null);
const saldoCuenta = () => movs().reduce((t, m) => t + (m.tipo === "cargo" ? Number(m.monto) : -Number(m.monto)), 0);
const estado = (id: string) => H.db.adelanto.find((a) => a.id === id)?.status;

beforeEach(() => {
  for (const k of Object.keys(H.db) as (keyof typeof H.db)[]) H.db[k].length = 0;
  H.pasos.length = 0;
  H.db.adelantoBeneficiario.push({ id: "b1", tenantId: T, nombre: "PRUEBA TEST - Juan Perez" }, { id: "bx", tenantId: "t2", nombre: "De otro negocio" });
  H.db.adelanto.push(adelanto("a1", "2026-08-01", 2000), adelanto("a2", "2026-09-01", 3000), adelanto("a3", "2026-09-20", 1248));
});

describe("ForestCubicacionTrozasDB", () => {
  it("guardar re-cubica y numera CUB-AAAA-NNNN; persona de otro negocio → 404", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    expect(c.codigo).toBe("CUB-2026-0001");
    expect(c.unidad).toBe("PT");
    expect(c.nTrozas).toBe(3);
    expect(c.volumen).toBeCloseTo(604.73, 2);
    expect((await ForestCubicacionTrozasDB.guardar(T, entrada, actor)).codigo).toBe("CUB-2026-0002");
    expect(await codigoDe(ForestCubicacionTrozasDB.guardar(T, { ...entrada, beneficiarioId: "bx" }, actor))).toBe("404 PERSONA_NO_ENCONTRADA");
    expect(await codigoDe(ForestCubicacionTrozasDB.aplicar("t2", c.id, { precios, montoVisto: 1, idempotencyKey: "clave-otra-1", version: 1 }, actor))).toBe(
      "404 NO_ENCONTRADA",
    );
  });

  it("aplicar crea una entrega por adelanto con cubicacionId y sin liquidacionId; el saldo baja exactamente el monto", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    const monto = montoDe();
    expect(monto).toBe(4008.13);
    const r = await aplicarCon(c.id);
    expect(r.repetido).toBe(false);
    expect(r.imputacion.map((i) => [i.adelantoId, i.monto])).toEqual([["a1", 2000], ["a2", 2008.13]]);
    expect(H.db.adelantoEntrega).toHaveLength(2);
    expect(H.db.adelantoEntrega.every((e) => e.cubicacionId === c.id && e.liquidacionId === null && e.tipo === "LIBRE")).toBe(true);
    expect(String(H.db.adelantoEntrega[0].descripcion)).toMatch(/^Madera · CUB-2026-0001 · 3 trozas · 604,73 PT · parte 1 de 2$/);
    expect([saldo("a1"), estado("a1"), saldo("a2"), saldo("a3")]).toEqual([0, "LIQUIDADO", 991.87, 1248]);
    expect(2000 + 3000 + 1248 - (saldo("a1") + saldo("a2") + saldo("a3"))).toBeCloseTo(monto, 6);
    expect(r.cubicacion).toMatchObject({ estado: "aplicada", monto, aplicadaPor: "brandon" });
    /* Locks: persona → cubicación → adelantos destino en orden de id. */
    expect(H.pasos.filter((p) => !p.startsWith("lock:cub:"))).toEqual(["lock:liq:t1:benef:b1", "for-update:cubicacion", "for-update:adelantos:a1,a2,a3"]);
  });

  it("doble clic (misma clave, mismo cuerpo) → una sola aplicación; otro cuerpo → 422", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    await aplicarCon(c.id);
    const otra = await aplicarCon(c.id);
    expect(otra.repetido).toBe(true);
    expect(H.db.adelantoEntrega).toHaveLength(2);
    expect(await codigoDe(aplicarCon(c.id, { precios: [{ clave: "tornillo", precio: 9 }, { clave: "cumala", precio: 5 }] }))).toBe("422 IDEMPOTENCIA_DISTINTA");
    expect(await codigoDe(aplicarCon(c.id, { idempotencyKey: "clave-aplicar-2" }))).toBe("409 YA_APLICADA");
  });

  it("montoVisto distinto → 409 MONTO_CAMBIO con el monto del servidor, sin escribir nada", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    try {
      await aplicarCon(c.id, { montoVisto: 4000 });
      throw new Error("no rebotó");
    } catch (e) {
      expect(e).toBeInstanceOf(CubicacionTrozasError);
      expect((e as CubicacionTrozasError).code).toBe("MONTO_CAMBIO");
      expect((e as CubicacionTrozasError).extra.monto).toBe(4008.13);
    }
    expect(H.db.adelantoEntrega).toHaveLength(0);
    expect(H.db.forestCubicacionTrozas[0].estado).toBe("borrador");
  });

  it("guía con abono `madera` vivo → 409 GUIA_YA_VALORIZADA (la guía se bloquea primero)", async () => {
    H.db.woodEntry.push({ id: "w1", tenantId: T, gtfNumber: "019-001-0000001", deletedAt: null, status: "validado", costoTotal: null });
    const c = await ForestCubicacionTrozasDB.guardar(T, { ...entrada, gtfNumber: "019-001-0000001" }, actor);
    H.db.forestCuentaMov.push({ id: "m1", tenantId: T, gtfNumber: "019-001-0000001", concepto: "madera", tipo: "abono", deletedAt: null });
    H.pasos.length = 0;
    expect(await codigoDe(aplicarCon(c.id))).toBe("409 GUIA_YA_VALORIZADA");
    expect(H.pasos[0]).toBe("lock:guia:019-001-0000001");
    expect(H.db.adelantoEntrega).toHaveLength(0);
  });

  it("B1 cerrado (ADR-484): más madera que lo adelantado → cada adelanto hasta su saldo, ninguno excedido, el resto a su cuenta", async () => {
    conFicha();
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    const caros = [{ clave: "tornillo", precio: 15 }, { clave: "cumala", precio: 6 }];
    const monto = montoDe(caros);
    H.pasos.length = 0;
    const r = await aplicarCon(c.id, { precios: caros, montoVisto: monto });
    expect(r.imputacion.map((i) => [i.adelantoId, i.monto, i.excedido])).toEqual([["a1", 2000, false], ["a2", 3000, false], ["a3", 1248, false]]);
    expect([estado("a1"), estado("a2"), estado("a3")]).toEqual(["LIQUIDADO", "LIQUIDADO", "LIQUIDADO"]);
    const resto = Math.round((monto - 6248) * 100) / 100;
    expect(r.cubicacion.aCuenta).toMatchObject({ parteId: "p1", monto: resto, sentido: "compra" });
    /* La madera entera de abono y el cruce con lo adelantado de cargo: el saldo baja sólo el resto (le debes). */
    expect(movs().map((m) => [m.tipo, m.concepto, m.monto, m.gtfNumber])).toEqual([["abono", "madera", monto, null], ["cargo", "compensacion", 6248, null]]);
    expect(saldoCuenta()).toBeCloseTo(-resto, 6);
    /* Persona de adelantos → su cuenta forestal → la fila (el orden de la liquidación, ADR-413). */
    expect(H.pasos.filter((p) => !p.startsWith("lock:cub:")).slice(0, 3)).toEqual(["lock:liq:t1:benef:b1", "lock:liq:t1:parte:p1", "for-update:cubicacion"]);

    /* Anular devuelve todo en la misma transacción. */
    await ForestCubicacionTrozasDB.anular(T, c.id, "precio mal", actor);
    expect([saldo("a1"), saldo("a2"), saldo("a3")]).toEqual([2000, 3000, 1248]);
    expect(movs()).toHaveLength(0);
  });

  it("ningún adelanto elegido (`adelantoIds: []`) → todo a su cuenta, los adelantos quedan como estaban", async () => {
    conFicha();
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    const r = await aplicarCon(c.id, { adelantoIds: [] });
    expect(r.imputacion).toEqual([]);
    expect(movs().map((m) => [m.tipo, m.concepto, m.monto])).toEqual([["abono", "madera", 4008.13]]);
    expect([saldo("a1"), saldo("a2"), saldo("a3")]).toEqual([2000, 3000, 1248]);
  });

  it("sin ficha en el directorio, lo que el adelanto no cubre → 422 SIN_CUENTA sin escribir nada", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    const caros = [{ clave: "tornillo", precio: 15 }, { clave: "cumala", precio: 6 }];
    expect(await codigoDe(aplicarCon(c.id, { precios: caros, montoVisto: montoDe(caros) }))).toBe("422 SIN_CUENTA");
    expect(H.db.adelantoEntrega).toHaveLength(0);
    expect(H.db.forestCubicacionTrozas[0].estado).toBe("borrador");
  });

  it("compra sin adelantos (sólo directorio) → todo a su cuenta (le debes); anular lo da de baja; otra en USD → 422", async () => {
    conFicha();
    H.db.adelanto.length = 0;
    const c = await ForestCubicacionTrozasDB.guardar(T, { ...entrada, beneficiarioId: undefined, parteId: "p1" }, actor);
    const r = await aplicarCon(c.id);
    expect(r.imputacion).toEqual([]);
    expect(movs().map((m) => [m.tipo, m.concepto, m.monto, m.parteNombre])).toEqual([["abono", "madera", 4008.13, "Juan Perez"]]);
    expect(String(movs()[0].notas)).toMatch(/CUB-2026-0001/);
    expect(await codigoDe(ForestCubicacionTrozasDB.anular(T, c.id, "no era suya", actor))).toBe("sin error");
    expect(movs()).toHaveLength(0);

    const usd = await ForestCubicacionTrozasDB.guardar(T, { ...entrada, beneficiarioId: undefined, parteId: "p1" }, actor);
    const fila = H.db.forestCubicacionTrozas.find((x) => x.id === usd.id);
    if (fila) fila.moneda = "USD";
    expect(await codigoDe(aplicarCon(usd.id, { idempotencyKey: "clave-usd-9" }))).toBe("422 MONEDA_NO_SOPORTADA");
  });

  it("venta sin adelanto → te debe; anular tras una liquidación posterior de su cuenta → 409; la venta ya anotada de la guía → 409", async () => {
    conFicha();
    const v = await ForestCubicacionTrozasDB.guardar(T, { ...entrada, sentido: "venta", gtfNumber: "019-002-0000009" }, actor);
    const r = await aplicarCon(v.id);
    expect(r.cubicacion.aCuenta).toMatchObject({ monto: 4008.13, sentido: "venta" });
    /* La venta lleva la guía: el resultado del negocio la cuenta una vez (ADR-451). */
    expect(movs().map((m) => [m.tipo, m.concepto, m.monto, m.referencia, m.gtfNumber])).toEqual([["cargo", "venta", 4008.13, "019-002-0000009", "019-002-0000009"]]);
    H.db.forestCuentaMov.push({ id: "liq-pata", tenantId: T, parteId: "p1", tipo: "abono", concepto: "pago", monto: 100, deletedAt: null, liquidacionId: "liq9", createdAt: new Date(Date.now() + 60_000) });
    expect(await codigoDe(ForestCubicacionTrozasDB.anular(T, v.id, "mal", actor))).toBe("409 LIQUIDADA_DESPUES");

    /* La venta de otra guía ya anotada a mano en una cuenta («Anotar en la cuenta», escrita de otra forma): no se cobra dos veces. */
    H.db.forestCuentaMov.push({ id: "mv", tenantId: T, parteId: "p9", parteNombre: "Maderas del Sur", tipo: "cargo", concepto: "venta", referencia: "019-002-0000033", gtfNumber: null, deletedAt: null });
    const otra = await ForestCubicacionTrozasDB.guardar(T, { ...entrada, sentido: "venta", gtfNumber: "19-2-33" }, actor);
    expect(await codigoDe(aplicarCon(otra.id, { idempotencyKey: "clave-otra-venta" }))).toBe("409 GUIA_YA_ANOTADA");
  });

  it("anular deja los saldos como antes; tras una liquidación posterior → 409 LIQUIDADA_DESPUES", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    await aplicarCon(c.id);
    H.db.liquidacionCuenta.push({ id: "liq1", tenantId: T, codigo: "LIQ-2026-0001" });
    H.db.adelantoEntrega.push({ id: "eliq", adelantoId: "a2", valor: 10, anuladaAt: null, liquidacionId: "liq1", createdAt: new Date(Date.now() + 60_000) });
    expect(await codigoDe(ForestCubicacionTrozasDB.anular(T, c.id, "medí mal", actor))).toBe("409 LIQUIDADA_DESPUES");

    H.db.adelantoEntrega.splice(H.db.adelantoEntrega.findIndex((e) => e.id === "eliq"), 1);
    const r = await ForestCubicacionTrozasDB.anular(T, c.id, "medí mal", actor);
    expect(r.cubicacion.estado).toBe("anulada");
    expect([saldo("a1"), estado("a1"), saldo("a2"), estado("a2"), saldo("a3")]).toEqual([2000, "ABIERTO", 3000, "ABIERTO", 1248]);
    expect((await ForestCubicacionTrozasDB.anular(T, c.id, "otra vez", actor)).repetido).toBe(true);
    expect(await codigoDe(aplicarCon(c.id, { idempotencyKey: "clave-aplicar-9" }))).toBe("409 ANULADA");
  });

  it("editar: versión vieja → DESACTUALIZADA; aplicada → YA_APLICADA (editar y borrar)", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    const v2 = await ForestCubicacionTrozasDB.editar(T, c.id, { ...entrada, notas: "corregida", version: 1 }, actor);
    expect(v2.version).toBe(2);
    expect(await codigoDe(ForestCubicacionTrozasDB.editar(T, c.id, { ...entrada, version: 1 }, actor))).toBe("409 DESACTUALIZADA");
    await aplicarCon(c.id, { version: 2 });
    expect(await codigoDe(ForestCubicacionTrozasDB.editar(T, c.id, { ...entrada, version: 2 }, actor))).toBe("409 YA_APLICADA");
    expect(await codigoDe(ForestCubicacionTrozasDB.borrar(T, c.id, actor))).toBe("409 YA_APLICADA");
  });
});

describe("AdelantosDB.anularEntregasDeCubicacionEnTx", () => {
  it("sólo da de baja las entregas de ESA cubicación y de ESTE negocio", async () => {
    H.db.adelanto.push({ ...adelanto("ax", "2026-09-01", 500), tenantId: "t2", beneficiarioId: "bx" });
    H.db.adelantoEntrega.push(
      { id: "e1", adelantoId: "a1", valor: 100, cubicacionId: "c1", anuladaAt: null },
      { id: "e2", adelantoId: "a1", valor: 50, cubicacionId: "c2", anuladaAt: null },
      { id: "e3", adelantoId: "ax", valor: 70, cubicacionId: "c1", anuladaAt: null },
    );
    const r = await AdelantosDB.anularEntregasDeCubicacionEnTx(H.prisma as unknown as Prisma.TransactionClient, T, "c1");
    expect(r.adelantoIds).toEqual(["a1"]);
    expect(H.db.adelantoEntrega.map((e) => [e.id, e.anuladaAt === null])).toEqual([["e1", false], ["e2", true], ["e3", true]]);
    expect(saldo("a1")).toBe(1950);
  });
});

describe("revisión M (08-10)", () => {
  it("la madera va sólo a adelantos en soles y sin cuotas pactadas; uno en USD elegido a mano → 422", async () => {
    H.db.adelanto.length = 0;
    H.db.adelanto.push(
      adelanto("u1", "2026-07-01", 5000, { moneda: "USD" }),
      adelanto("p1", "2026-07-15", 5000, { modalidad: "ENTREGAS_PACTADAS" }),
      adelanto("a9", "2026-09-01", 6000),
    );
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    expect((await ForestCubicacionTrozasDB.detalle(T, c.id))?.adelantosAbiertos.map((a) => a.id)).toEqual(["a9"]);
    expect(await codigoDe(aplicarCon(c.id, { adelantoIds: ["u1"] }))).toBe("422 ADELANTO_NO_VALIDO");
    const r = await aplicarCon(c.id, { idempotencyKey: "clave-aplicar-usd" });
    expect(r.imputacion.map((i) => [i.adelantoId, i.monto])).toEqual([["a9", 4008.13]]);
    expect([saldo("u1"), saldo("p1"), saldo("a9")]).toEqual([5000, 5000, 1991.87]);

    /* Sólo le queda el de USD: no se descuentan soles de dólares, y sin ficha en el directorio no hay cuenta donde dejarlo. */
    H.db.adelanto.splice(H.db.adelanto.findIndex((a) => a.id === "a9"), 1);
    const otra = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    expect(await codigoDe(aplicarCon(otra.id, { idempotencyKey: "clave-aplicar-usd-2" }))).toBe("422 SIN_CUENTA");
  });

  it("la guía tipeada «10-1-5» se guarda como la del libro y su abono madera la frena; sin ingreso → 422 en compra, tal cual en venta", async () => {
    H.db.woodEntry.push(
      { id: "w5", tenantId: T, gtfNumber: "010-001-0000005", deletedAt: null, status: "validado", costoTotal: null },
      { id: "w6", tenantId: "t2", gtfNumber: "010-001-0000006", deletedAt: null, status: "validado", costoTotal: null },
    );
    const c = await ForestCubicacionTrozasDB.guardar(T, { ...entrada, gtfNumber: "10-1-5" }, actor);
    expect(c.gtfNumber).toBe("010-001-0000005");
    /* El abono escrito con OTRO texto de la misma guía también cuenta (`mismoNumeroGtf`). */
    H.db.forestCuentaMov.push({ id: "m5", tenantId: T, gtfNumber: "10-1-5", concepto: "madera", tipo: "abono", deletedAt: null });
    H.pasos.length = 0;
    expect(await codigoDe(aplicarCon(c.id))).toBe("409 GUIA_YA_VALORIZADA");
    expect(H.pasos[0]).toBe("lock:guia:010-001-0000005");
    expect(H.db.adelantoEntrega).toHaveLength(0);

    /* La guía de OTRO negocio no existe para este. */
    expect(await codigoDe(ForestCubicacionTrozasDB.guardar(T, { ...entrada, gtfNumber: "10-1-6" }, actor))).toBe("422 GUIA_NO_ENCONTRADA");
    const v = await ForestCubicacionTrozasDB.guardar(T, { ...entrada, sentido: "venta", gtfNumber: "10-1-6" }, actor);
    expect(v.gtfNumber).toBe("10-1-6");
  });

  it("no se anula un adelanto con madera de una cubicación viva; ni la cubicación si un adelanto tocado ya está anulado", async () => {
    const c = await ForestCubicacionTrozasDB.guardar(T, entrada, actor);
    await aplicarCon(c.id);
    const err = await AdelantosDB.cancel(T, "a2").catch((e) => e);
    expect(err).toBeInstanceOf(AdelantoConLiquidacionError);
    expect(err).toMatchObject({ code: "con_cubicacion", liquidacion: "CUB-2026-0001" });
    expect(String(err.message)).toMatch(/cubicación CUB-2026-0001/);
    expect(estado("a2")).toBe("ABIERTO");

    /* Lo que ya quedó así antes del freno: la cubicación no le devuelve saldo a un adelanto anulado. */
    const a2 = H.db.adelanto.find((a) => a.id === "a2");
    if (a2) a2.status = "CANCELADO";
    expect(await codigoDe(ForestCubicacionTrozasDB.anular(T, c.id, "medí mal", actor))).toBe("409 ADELANTO_ANULADO");
    expect(H.db.adelantoEntrega.every((e) => e.anuladaAt === null)).toBe(true);
    expect(H.db.forestCubicacionTrozas[0].estado).toBe("aplicada");
  });
});
