/**
 * El arreglo «el trato empieza después» contra una base simulada (revisión
 * 23-09): lo que ESCRIBEN `adelantar`, `arreglar` y `cobrarTanda`, no sólo lo
 * que propone la función pura.
 *
 *  · #5  una cobrada con la PLANTA dentro del trato vuelve a salir (y pasa a él).
 *  · #6  un POST sin `desde` no cobra corridas anteriores al trato.
 *  · #7  una actualización al mismo importe no es «1 cobrada(s)» en la auditoría.
 *  · #8  la auditoría del adelanto se ESPERA.
 *  · #10 a una parte dada de baja no se le adelanta ni se le cobra.
 *
 * Números de WASACO (Blas 23-09): trato global S/ 0,50 desde el 14/09. El
 * paquete es el de ADR-429 (273 PT medidos): con el trato 273 × 0,50 = 136,50;
 * con la planta (0,40 + 0,05 tipo + 0,03 largo) 273 × 0,48 = 131,04.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const T = "tenant-qa";
  const OTRO = "tenant-otro";
  const tablas: Record<string, Fila[]> = {};
  let seq = 0;

  /** Igualdad, `null`, `{ in }`, `{ not: null }`, `{ lte }`, `OR` — lo que usan estas clases. */
  const cumple = (fila: Fila, where: Fila = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Fila[]).some((w) => cumple(fila, w));
      const x = fila[k];
      if (v === null) return x == null;
      if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
      if (v && typeof v === "object") {
        const o = v as { in?: unknown[]; not?: unknown; lte?: Date };
        if ("in" in o) return (o.in ?? []).includes(x);
        if ("not" in o) return o.not === null ? x != null : x !== o.not;
        if ("lte" in o) return x instanceof Date && o.lte instanceof Date && x.getTime() <= o.lte.getTime();
        return true;
      }
      return x === v;
    });

  const ordenar = (filas: Fila[], orderBy?: Fila | Fila[]) => {
    const claves = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o) => Object.entries(o));
    return [...filas].sort((a, b) => {
      for (const [k, dir] of claves) {
        const va = a[k] instanceof Date ? (a[k] as Date).getTime() : (a[k] as number | string);
        const vb = b[k] instanceof Date ? (b[k] as Date).getTime() : (b[k] as number | string);
        if (va === vb) continue;
        return (va < vb ? -1 : 1) * (dir === "desc" ? -1 : 1);
      }
      return 0;
    });
  };

  /** Único parcial de la base: una versión VIVA por cliente, servicio y día. */
  const choca = (modelo: string, d: Fila) =>
    modelo === "forestParteTarifa" &&
    (tablas[modelo] ?? []).some(
      (r) =>
        r.deletedAt == null &&
        r.tenantId === d.tenantId &&
        r.parteId === d.parteId &&
        r.servicio === d.servicio &&
        (r.vigenteDesde as Date).getTime() === (d.vigenteDesde as Date).getTime(),
    );

  const escrituras: { modelo: string; op: string; data: Fila; where?: Fila }[] = [];
  const estado = { choqueForzado: false };

  const modelo = (nombre: string) => ({
    findFirst: vi.fn(async (a: { where?: Fila } = {}) => (tablas[nombre] ?? []).find((f) => cumple(f, a.where)) ?? null),
    findMany: vi.fn(async (a: { where?: Fila; orderBy?: Fila | Fila[]; take?: number } = {}) =>
      ordenar((tablas[nombre] ?? []).filter((f) => cumple(f, a.where)), a.orderBy).slice(0, a.take ?? 10_000),
    ),
    create: vi.fn(async (a: { data: Fila }) => {
      if (estado.choqueForzado || choca(nombre, a.data)) {
        estado.choqueForzado = false;
        const { Prisma } = await import("@/lib/generated/prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" });
      }
      seq += 1;
      const fila = { id: `${nombre}-${seq}`, createdAt: new Date(1_000_000 + seq), deletedAt: null, ...a.data };
      (tablas[nombre] ??= []).push(fila);
      escrituras.push({ modelo: nombre, op: "create", data: a.data });
      return fila;
    }),
    update: vi.fn(async (a: { where: Fila; data: Fila }) => {
      const fila = (tablas[nombre] ?? []).find((f) => cumple(f, a.where));
      if (!fila) throw new Error(`${nombre}.update: no existe`);
      Object.assign(fila, a.data);
      escrituras.push({ modelo: nombre, op: "update", data: a.data, where: a.where });
      return fila;
    }),
    updateMany: vi.fn(async (a: { where: Fila; data: Fila }) => {
      const filas = (tablas[nombre] ?? []).filter((f) => cumple(f, a.where));
      filas.forEach((f) => Object.assign(f, a.data));
      escrituras.push({ modelo: nombre, op: "updateMany", data: a.data, where: a.where });
      return { count: filas.length };
    }),
    groupBy: vi.fn(async (a: { by: string[]; where?: Fila }) => {
      const grupos = new Map<string, { fila: Fila; suma: number }>();
      for (const f of (tablas[nombre] ?? []).filter((x) => cumple(x, a.where))) {
        const k = a.by.map((b) => String(f[b])).join("|");
        const g = grupos.get(k) ?? { fila: Object.fromEntries(a.by.map((b) => [b, f[b]])), suma: 0 };
        g.suma += Number(f.monto ?? 0);
        grupos.set(k, g);
      }
      return [...grupos.values()].map((g) => ({ ...g.fila, _sum: { monto: g.suma } }));
    }),
  });

  const prisma: Record<string, unknown> = {
    forestParty: modelo("forestParty"),
    forestContrato: modelo("forestContrato"),
    forestParteTarifa: modelo("forestParteTarifa"),
    forestParteVinculo: modelo("forestParteVinculo"),
    forestCuentaMov: modelo("forestCuentaMov"),
    forestCtpEntry: modelo("forestCtpEntry"),
    forestCtpPaquete: modelo("forestCtpPaquete"),
    $queryRaw: vi.fn(async () => [{ id: "corrida-1" }]),
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  return {
    T,
    OTRO,
    tablas,
    escrituras,
    estado,
    prisma,
    audit: vi.fn(),
    auditEsperando: vi.fn(async (_p: { action: string; detail: string }) => {}),
    catalogo: { agregadas: [], ocultas: [], grupos: [] },
    planta: vi.fn(),
    reset() {
      for (const k of Object.keys(tablas)) delete tablas[k];
      escrituras.length = 0;
      seq = 0;
      estado.choqueForzado = false;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({
  getOrSet: async (_k: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit, auditCtpEsperando: H.auditEsperando }));
vi.mock("@/lib/db/forest-especies.db", () => ({ ForestEspeciesDB: { get: async () => H.catalogo } }));
vi.mock("@/lib/db/forest-tarifa-aserrio.db", () => ({
  ForestTarifaAserrioDB: { vigente: H.planta, leer: async () => ({ versiones: H.planta() ? [H.planta()] : [] }) },
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null } }));

import { ForestParteTarifaDB, ParteNoEncontradaError } from "@/lib/db/forest-parte-tarifa.db";
import { ForestTratoSinCobrarDB } from "@/lib/db/forest-trato-sin-cobrar.db";
import { ForestAserrioDB } from "@/lib/db/forest-aserrio.db";
import type { VersionTarifa } from "@/lib/forestal/tarifa-aserrio";

const T = H.T;

const PLANTA: VersionTarifa = {
  id: "v-planta",
  vigenteDesde: "2026-01-01",
  basePt: 0.4,
  especies: [],
  tipos: [
    { tipo: "Comercial", ajustePt: 0.05 },
    { tipo: "Paquetería larga", ajustePt: 0.05 },
    { tipo: "Paquetería corta", ajustePt: 0.05 },
    { tipo: "Tabla", ajustePt: 0.05 },
    { tipo: "Larga angosta", ajustePt: 0.05 },
    { tipo: "Corta", ajustePt: 0.05 },
    { tipo: "Otro", ajustePt: 0.05 },
  ],
  largos: [{ desdePies: 12, hastaPies: null, ajustePt: 0.03 }],
  nota: null,
  creadoPor: null,
  creadoEn: null,
};

const PAQUETE = {
  codigo: "PQ-2609-001",
  productType: "MADERA ASERRADA",
  volumenM3: 0.6439,
  espesorCm: 7.62,
  anchoCm: 30.48,
  largoM: 3.96,
  pieTablar: 273,
  deletedAt: null,
};

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Una corrida de producción de WASACO, declarada, con su paquete. */
function corrida(id: string, lineNo: number, fecha: string, extra: Record<string, unknown> = {}) {
  H.tablas.forestCtpPaquete.push({ ...PAQUETE, id: `pq-${id}`, tenantId: T, ctpEntryId: id });
  return {
    id,
    tenantId: T,
    lineNo,
    section: "produccion",
    status: "registrado",
    entryDate: dia(fecha),
    duenoParteId: "wasaco",
    aserrioImporte: null,
    aserrioDetalle: null,
    speciesCommon: "Tornillo",
    productType: "MADERA ASERRADA",
    quantity: 0.6439,
    unit: "m3",
    titularNombre: "WASACO",
    contratoId: null,
    deletedAt: null,
    paquetes: [PAQUETE],
    ...extra,
  };
}

function sembrar({ plantaVigente = false, parteDeBaja = false } = {}) {
  H.reset();
  H.audit.mockClear();
  H.auditEsperando.mockReset();
  H.auditEsperando.mockImplementation(async () => {});
  H.planta.mockReset();
  H.planta.mockImplementation(() => (plantaVigente ? PLANTA : null));
  H.tablas.forestParty = [
    { id: "wasaco", tenantId: T, nombre: "WASACO", activo: true, deletedAt: parteDeBaja ? new Date() : null },
    { id: "ajena", tenantId: H.OTRO, nombre: "Ajena SAC", activo: true, deletedAt: null },
  ];
  H.tablas.forestParteTarifa = [
    {
      id: "tc-14",
      tenantId: T,
      parteId: "wasaco",
      servicio: "aserrio",
      vigenteDesde: dia("2026-09-14"),
      basePt: 0.5,
      detalle: { grupos: [], especies: [], tipos: [] },
      nota: null,
      createdAt: new Date(1),
      deletedAt: null,
    },
  ];
  H.tablas.forestCtpPaquete = [];
  H.tablas.forestCuentaMov = [];
  H.tablas.forestCtpEntry = [];
}

const cargos = () => (H.tablas.forestCuentaMov ?? []).filter((m) => m.deletedAt == null);
const auditoriaTanda = () =>
  H.auditEsperando.mock.calls.map(([p]) => p).filter((p) => p.action === "ctp_aserrio_cobrar_tanda");

beforeEach(() => sembrar());

describe("#6 — POST sin `desde`: sólo lo que el trato YA cubre", () => {
  it("la corrida de antes del trato no se manda a cobrar (la planta la habría cobrado)", async () => {
    sembrar({ plantaVigente: true });
    H.tablas.forestCtpEntry.push(corrida("antes", 30, "2026-09-07"), corrida("dentro", 45, "2026-09-16"));
    const r = await ForestTratoSinCobrarDB.arreglar(T, { parteId: "wasaco", tarifaId: null, desde: null }, "qa");
    expect(r.movio).toBeNull();
    expect(r.cobro?.resultados.map((x) => x.id)).toEqual(["dentro"]);
    expect(cargos().map((m) => [m.ctpEntryId, Number(m.monto)])).toEqual([["dentro", 136.5]]);
    expect(r.arreglo?.quedanAntes).toBe(1);
  });
});

describe("#5 — una cobrada con la planta dentro del trato vuelve a salir y pasa a él", () => {
  it("la propuesta la trae en `cambian`; la cobrada CON el trato no", async () => {
    H.tablas.forestCtpEntry.push(
      corrida("planta", 46, "2026-09-16", { aserrioImporte: 131.04, aserrioDetalle: { clienteTarifaId: null, importe: 131.04 } }),
      corrida("trato", 47, "2026-09-17", { aserrioImporte: 120, aserrioDetalle: { clienteTarifaId: "tc-14", importe: 120 } }),
    );
    const p = await ForestTratoSinCobrarDB.propuesta(T, "wasaco");
    expect(p.arreglo?.mover).toBeNull();
    expect(p.arreglo?.cambian.map((c) => [c.id, c.importeActual, c.importeConTrato])).toEqual([["planta", 131.04, 136.5]]);
  });
});

describe("GET con `desde`: la propuesta de la línea es la de ESA fecha", () => {
  it("devuelve la fecha pedida y propone adelantar a ella", async () => {
    H.tablas.forestCtpEntry.push(corrida("vieja", 29, "2026-09-03"), corrida("c30", 30, "2026-09-07"));
    const p = await ForestTratoSinCobrarDB.propuesta(T, "wasaco", { desde: "2026-09-05" });
    expect(p.desde).toBe("2026-09-05");
    expect(p.arreglo?.mover?.desde).toBe("2026-09-05");
    expect(p.arreglo?.sinCobrar.map((c) => c.id)).toEqual(["c30"]);
    expect(p.arreglo?.quedanAntes).toBe(1);
  });

  it("una parte de OTRO tenant es 404, no una propuesta vacía", async () => {
    await expect(ForestTratoSinCobrarDB.propuesta(T, "ajena", { desde: "2026-09-05" })).rejects.toBeInstanceOf(
      ParteNoEncontradaError,
    );
  });
});

describe("#7 — dos POST del mismo arreglo: el segundo no es «1 cobrada(s)»", () => {
  it("un cargo, y la segunda tanda dice «0 cobrada(s) · 1 ya cobrada(s) sin cambio»", async () => {
    H.tablas.forestCtpEntry.push(corrida("c30", 30, "2026-09-16"));
    const uno = await ForestAserrioDB.cobrarTanda(T, ["c30"], {}, "qa");
    const dos = await ForestAserrioDB.cobrarTanda(T, ["c30"], {}, "qa");
    expect(cargos()).toHaveLength(1);
    expect(uno.resumen).toMatchObject({ cobradas: 1, sinCambio: 0, importeTotal: 136.5 });
    expect(dos.resumen).toMatchObject({ cobradas: 0, sinCambio: 1, importeTotal: 0, sinCobrar: 0 });
    expect(dos.resultados[0]).toMatchObject({ cobrado: true, accion: "actualizar", importeAnterior: 136.5, sinCambio: true });
    const [a1, a2] = auditoriaTanda();
    expect(a1.detail).toContain("1 cobrada(s) por S/ 136.50");
    expect(a2.detail).toContain("0 cobrada(s) por S/ 0.00");
    expect(a2.detail).toContain("1 ya cobrada(s) sin cambio (N° 30)");
  });
});

describe("#7b — mismo importe pero OTRO permiso sí es un cambio (security 23-09)", () => {
  it("la corrida pasó a otro permiso: el cargo lo sigue y la tanda lo cuenta como cobrado", async () => {
    H.tablas.forestCtpEntry.push(corrida("c31", 31, "2026-09-16", { contratoId: "permiso-A" }));
    await ForestAserrioDB.cobrarTanda(T, ["c31"], {}, "qa");
    const fila = H.tablas.forestCtpEntry.find((f) => f.id === "c31");
    if (fila) fila.contratoId = "permiso-B";
    const dos = await ForestAserrioDB.cobrarTanda(T, ["c31"], {}, "qa");
    expect(cargos()).toHaveLength(1);
    expect(cargos()[0].contratoId).toBe("permiso-B");
    expect(dos.resultados[0]).toMatchObject({ accion: "actualizar", sinCambio: false });
    expect(dos.resumen).toMatchObject({ cobradas: 1, sinCambio: 0 });
  });
});

describe("#8 — la auditoría del adelanto se espera", () => {
  it("`adelantar` no responde hasta que el renglón quedó escrito", async () => {
    let escrito = false;
    H.auditEsperando.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      escrito = true;
    });
    const r = await ForestParteTarifaDB.adelantar(T, { parteId: "wasaco", tarifaId: "tc-14", desde: "2026-09-07" }, "qa");
    expect(r.movio).toBe(true);
    expect(escrito).toBe(true);
    expect(H.auditEsperando).toHaveBeenCalledWith(expect.objectContaining({ action: "ctp_tarifa_cliente_adelantar" }));
    expect(H.audit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "ctp_tarifa_cliente_adelantar" }));
  });
});

describe("#10 — a una parte dada de baja no se le adelanta ni se le cobra (como `guardar`)", () => {
  it("adelantar: 404 y el trato queda donde estaba", async () => {
    sembrar({ parteDeBaja: true });
    await expect(
      ForestParteTarifaDB.adelantar(T, { parteId: "wasaco", tarifaId: "tc-14", desde: "2026-09-07" }, "qa"),
    ).rejects.toBeInstanceOf(ParteNoEncontradaError);
    expect((H.tablas.forestParteTarifa[0].vigenteDesde as Date).toISOString().slice(0, 10)).toBe("2026-09-14");
  });

  it("arreglar (con o sin fecha): 404 sin cobrar nada; la propuesta no ofrece el arreglo", async () => {
    sembrar({ parteDeBaja: true });
    H.tablas.forestCtpEntry.push(corrida("dentro", 45, "2026-09-16"));
    await expect(
      ForestTratoSinCobrarDB.arreglar(T, { parteId: "wasaco", tarifaId: null, desde: null }, "qa"),
    ).rejects.toBeInstanceOf(ParteNoEncontradaError);
    expect(cargos()).toHaveLength(0);
    expect((await ForestTratoSinCobrarDB.propuesta(T, "wasaco")).arreglo).toBeNull();
  });
});
