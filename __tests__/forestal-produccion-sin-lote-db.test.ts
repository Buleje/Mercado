/**
 * Lo que `ForestCtpSinLoteDB.producirSinLote` ESCRIBE (ADR-429), contra una
 * base simulada: una corrida por especie en UNA transacción, el PT y el precio
 * guardados en cada paquete, todo o nada, el cobro después y sin tumbar el
 * libro, y los montos leídos de lo guardado.
 *
 * El `$transaction` falso se comporta como Postgres: si el callback tira,
 * deshace lo que se escribió por `tx`. Por eso la afirmación que importa en el
 * rollback es que TODA escritura pasó por `tx` y dentro de una sola transacción.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const estado = {
    tenant: "tenant-qa",
    maxLineNo: 40 as number | null,
    delDia: [] as Fila[],
    choque: null as Fila | null,
    parte: { id: "parte-1", nombre: "Maderera Ucayali SAC", activo: true, deletedAt: null } as Fila | null,
    cerrado: null as Fila | null,
    /** 0 = nunca; n = la n-ésima corrida revienta al crearse. */
    fallarCreateEn: 0,
    fallarCreateManyCon: null as unknown,
    /** Lo que la base «redondea» al guardar: el read-back tiene que usar ESTO. */
    precioGuardado: null as number | null,
    creates: 0,
    entries: [] as { data: Fila }[],
    paquetes: [] as Fila[],
    lecturas: { parte: [] as Fila[], delDia: [] as Fila[], choque: [] as Fila[], readBack: [] as Fila[] },
  };
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    forestCtpEntry: {
      findMany: vi.fn(async (args: Fila) => {
        estado.lecturas.delDia.push(args);
        return estado.delDia;
      }),
      aggregate: vi.fn(async () => ({ _max: { lineNo: estado.maxLineNo } })),
      create: vi.fn(async (args: { data: Fila }) => {
        estado.creates += 1;
        if (estado.fallarCreateEn === estado.creates) throw new Error("se cayó la base");
        estado.entries.push(args);
        return { id: `c${estado.creates}`, lineNo: args.data.lineNo, speciesCommon: args.data.speciesCommon };
      }),
    },
    forestCtpPaquete: {
      findFirst: vi.fn(async (args: Fila) => {
        estado.lecturas.choque.push(args);
        return estado.choque;
      }),
      createMany: vi.fn(async (args: { data: Fila[] }) => {
        if (estado.fallarCreateManyCon) throw estado.fallarCreateManyCon;
        estado.paquetes.push(...args.data);
        return { count: args.data.length };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      const antes = { entries: estado.entries.length, paquetes: estado.paquetes.length };
      try {
        return await fn(tx);
      } catch (e) {
        /* ROLLBACK: lo escrito por `tx` desaparece. */
        estado.entries.length = antes.entries;
        estado.paquetes.length = antes.paquetes;
        throw e;
      }
    }),
    forestParty: {
      findFirst: vi.fn(async (args: Fila) => {
        estado.lecturas.parte.push(args);
        return estado.parte;
      }),
    },
    forestCtpPaquete: {
      findMany: vi.fn(async (args: { where: { tenantId: string; ctpEntryId: { in: string[] } } }) => {
        estado.lecturas.readBack.push(args);
        return estado.paquetes
          .filter((p) => p.tenantId === args.where.tenantId && args.where.ctpEntryId.in.includes(p.ctpEntryId as string))
          .map((p) => ({
            ctpEntryId: p.ctpEntryId,
            volumenM3: p.volumenM3,
            pieTablar: p.pieTablar,
            precioVentaPt: estado.precioGuardado ?? p.precioVentaPt,
          }));
      }),
    },
    /* Si alguien escribiera fuera de la transacción, el rollback no lo cubriría. */
    forestCtpEntry: { create: vi.fn() },
  };
  return {
    estado,
    tx,
    prisma,
    audit: vi.fn(),
    invalidar: vi.fn(),
    cobrar: vi.fn(),
    cerrado: vi.fn(async () => estado.cerrado),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: H.invalidar }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit, auditCtpEsperando: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: H.cerrado } }));
vi.mock("@/lib/db/forest-especies.db", () => ({
  ForestEspeciesDB: {
    /* El catálogo de la planta escribe «Tornillo» aunque se dicte «TORNILLO». */
    resolverEspecie: async (_t: string, n: string) =>
      n.toLowerCase() === "tornillo"
        ? { nombre: "Tornillo", cientifico: "Cedrelinga cateniformis" }
        : { nombre: n, cientifico: null },
  },
}));
vi.mock("@/lib/db/forest-contrato.db", () => ({
  ForestContratoDB: { idPorCodigo: async (_t: string, c: string | null) => (c ? "contrato-1" : null) },
}));
vi.mock("@/lib/db/forest-aserrio.db", () => ({ ForestAserrioDB: { cobrarCorrida: H.cobrar } }));

import { Prisma } from "@/lib/generated/prisma/client";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { ForestCtpSinLoteDB } from "@/lib/db/forest-ctp-sin-lote.db";
import { cubicarPieza } from "@/lib/forestal/cubicacion";
import { armarPedido, paquetesDeLoCubicado, produccionSinLoteSchema } from "@/lib/forestal/declarar-produccion";
import { MATERIA_PRIMA_SIN_LOTE, ProduccionSinLoteError } from "@/lib/forestal/produccion-sin-lote";
import type { ResultadoCobro } from "@/lib/forestal/tarifa-aserrio";

const pieza = (especie: string, cantidad: number, e: number, a: number, l: number, id: string) => {
  const base = { id, cantidad, espesor: e, ancho: a, largo: l, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie } as const;
  return { ...base, ...cubicarPieza(base) };
};

/* Panguana (1×4×8 + 2×6×10) y Tornillo (2×8×10 + 3×12×13), como sale del cubicador. */
const LOTE = paquetesDeLoCubicado(
  [
    pieza("Panguana", 40, 1, 4, 8, "a"),
    pieza("TORNILLO", 100, 2, 8, 10, "b"),
    pieza("Panguana", 12, 2, 6, 10, "c"),
    pieza("TORNILLO", 7, 3, 12, 13, "d"),
  ],
  { codigosEnPlanta: [], hoy: new Date("2026-09-22T15:00:00Z") },
);

function input(servicio: Parameters<typeof armarPedido>[0]["servicio"], extra: { confirmarDuplicado?: boolean } = {}) {
  const r = produccionSinLoteSchema.safeParse(
    armarPedido({ paquetes: LOTE, fecha: "2026-09-22", originCode: "25-UCA/C-OPP-A-001-24", servicio, ...extra }),
  );
  if (!r.success) throw new Error(r.error.message);
  return r.data;
}
const PROPIA = { tipo: "propia" as const, precios: { panguana: 3.5, tornillo: 4.2 } };
const TERCERO = { tipo: "tercero" as const, parteId: "parte-1", precios: { tornillo: 0.35 } };

const producir = (i: ReturnType<typeof input>) => ForestCtpSinLoteDB.producirSinLote(H.estado.tenant, i, "qaadmin");

async function codigoDelError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "sin error";
  } catch (e) {
    if (e instanceof ProduccionSinLoteError || e instanceof CtpInvariantError) return e.code;
    return `otro: ${String(e)}`;
  }
}

const cobro = (importe: number | null): ResultadoCobro => ({
  cobrado: importe != null,
  importe,
  parteNombre: "Maderera Ucayali SAC",
  movimientoId: importe != null ? "mov-1" : null,
  motivo: null,
  cotizacion: null,
  accion: importe != null ? "crear" : "nada",
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(H.estado, {
    maxLineNo: 40,
    delDia: [],
    choque: null,
    parte: { id: "parte-1", nombre: "Maderera Ucayali SAC", activo: true, deletedAt: null },
    cerrado: null,
    fallarCreateEn: 0,
    fallarCreateManyCon: null,
    precioGuardado: null,
    creates: 0,
    entries: [],
    paquetes: [],
    lecturas: { parte: [], delDia: [], choque: [], readBack: [] },
  });
  H.cobrar.mockImplementation(async (_t: string, _id: string, p: { precioManualPt: number | null }) =>
    cobro(p.precioManualPt != null ? 100 : null),
  );
});

describe("madera propia: una corrida por especie, en UNA transacción", () => {
  it("crea dos asientos correlativos con sus paquetes, y el PT y el precio quedan en cada paquete", async () => {
    const r = await producir(input(PROPIA));

    expect(H.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(H.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(H.estado.entries.map((e) => [e.data.lineNo, e.data.speciesCommon])).toEqual([
      [41, "Panguana"],
      [42, "Tornillo"],
    ]);
    expect(H.estado.entries[1].data).toMatchObject({
      tenantId: "tenant-qa",
      section: "produccion",
      materiaPrimaRef: MATERIA_PRIMA_SIN_LOTE,
      originCode: "25-UCA/C-OPP-A-001-24",
      contratoId: "contrato-1",
      duenoMadera: "propia",
      titularNombre: null,
      speciesScientific: "Cedrelinga cateniformis",
      unit: "m3",
      pieces: 107,
      lineaProduccion: "LP",
      status: "registrado",
      createdBy: "qaadmin",
    });
    expect((H.estado.entries[1].data.entryDate as Date).toISOString()).toBe("2026-09-22T00:00:00.000Z");

    const tornillo = H.estado.paquetes.filter((p) => p.ctpEntryId === "c2");
    expect(tornillo.map((p) => Number(p.pieTablar))).toEqual([1333.33, 273]);
    expect(tornillo.every((p) => Number(p.precioVentaPt) === 4.2 && p.tenantId === "tenant-qa")).toBe(true);
    expect(tornillo.every((p) => p.pieTablar instanceof Prisma.Decimal)).toBe(true);

    /* Σ PT × precio: 1 606,33 × 4,2 = 6 746,59. */
    expect(r.corridas.map((c) => [c.lineNo, c.especie, c.pt, c.valorVenta, c.aserrio])).toEqual([
      [41, "Panguana", 226.67, r.corridas[0].valorVenta, null],
      [42, "Tornillo", 1606.33, 6746.59, null],
    ]);
    expect(r.corridas[0].valorVenta).toBeCloseTo(793.345, 2);
    expect(r.total.valorVenta).toBeCloseTo(6746.59 + 793.345, 2);
    expect(H.cobrar).not.toHaveBeenCalled();
    expect(H.invalidar).toHaveBeenCalledWith("forest-ctp:tenant-qa");
    expect(H.audit).toHaveBeenCalledTimes(4);
  });

  it("el valor de venta sale de lo GUARDADO, no del pedido", async () => {
    H.estado.precioGuardado = 4;
    const r = await producir(input(PROPIA));
    expect(r.corridas[1].valorVenta).toBe(6425.32);
    expect(H.estado.lecturas.readBack[0]).toMatchObject({ where: { tenantId: "tenant-qa" } });
  });
});

describe("la respuesta después del commit", () => {
  it("si releer lo guardado falla, responde con lo que se escribió — no un 500 que haga creer que no quedó", async () => {
    const normal = await producir(input(PROPIA));
    H.prisma.forestCtpPaquete.findMany.mockRejectedValueOnce(new Error("se cortó la conexión"));
    H.estado.choque = null;
    const conFalla = await producir(input(PROPIA, { confirmarDuplicado: true }));
    expect(conFalla.corridas.map((c) => c.especie)).toEqual(normal.corridas.map((c) => c.especie));
    expect(conFalla.total.valorVenta).toBeCloseTo(normal.total.valorVenta ?? -1, 2);
  });
});

describe("todo o nada", () => {
  it("si la 2ª especie falla no queda ninguna: sin asientos, sin cobro, sin auditoría", async () => {
    H.estado.fallarCreateEn = 2;
    await expect(producir(input(TERCERO))).rejects.toThrow("se cayó la base");

    expect(H.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(H.tx.forestCtpEntry.create).toHaveBeenCalledTimes(2);
    /* La 1ª se escribió por `tx`: el rollback la deshizo. */
    expect(H.estado.entries).toEqual([]);
    expect(H.estado.paquetes).toEqual([]);
    expect(H.prisma.forestCtpEntry.create).not.toHaveBeenCalled();
    expect(H.cobrar).not.toHaveBeenCalled();
    expect(H.audit).not.toHaveBeenCalled();
    expect(H.invalidar).not.toHaveBeenCalled();
  });

  it("un código que otro tomó entre la revisión y el INSERT (P2002) vuelve como PAQUETE_YA_DECLARADO", async () => {
    H.estado.fallarCreateManyCon = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.8.0",
    });
    expect(await codigoDelError(producir(input(PROPIA)))).toBe("PAQUETE_YA_DECLARADO");
    expect(H.estado.entries).toEqual([]);
  });
});

describe("servicio de aserrío a un tercero", () => {
  it("la madera es del tercero y cada corrida se cobra con SU trato (null = tarifa)", async () => {
    const r = await producir(input(TERCERO));
    expect(H.estado.entries.every((e) => e.data.duenoMadera === "tercero")).toBe(true);
    expect(H.estado.entries.every((e) => e.data.titularNombre === "Maderera Ucayali SAC")).toBe(true);
    /* La cuenta queda escrita en la corrida DENTRO de la transacción: si el
       cobro falla, la corrida igual dice de quién es la deuda pendiente. */
    expect(H.estado.entries.every((e) => e.data.duenoParteId === "parte-1")).toBe(true);
    expect(H.estado.paquetes.every((p) => p.precioVentaPt === null)).toBe(true);
    expect(H.cobrar.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
      ["tenant-qa", "c1", { duenoParteId: "parte-1", precioManualPt: null }],
      ["tenant-qa", "c2", { duenoParteId: "parte-1", precioManualPt: 0.35 }],
    ]);
    expect(r.corridas.map((c) => [c.aserrio?.importe ?? null, c.valorVenta])).toEqual([
      [null, null],
      [100, null],
    ]);
    expect(r.total.valorVenta).toBeNull();
  });

  it("un cobro que revienta no tumba la declaración: el libro queda y la respuesta lo dice", async () => {
    H.cobrar.mockImplementationOnce(async () => cobro(100)).mockImplementationOnce(async () => {
      throw new Error("pool agotado");
    });
    const r = await producir(input(TERCERO));
    expect(r.corridas).toHaveLength(2);
    expect(r.corridas[1].aserrio).toMatchObject({ cobrado: false, importe: null });
    expect(r.corridas[1].aserrio?.motivo).toMatch(/quedó guardada/);
  });

  it("una cuenta de OTRO tenant es «no existe» y no se abre la transacción", async () => {
    H.estado.parte = null;
    const i = input({ ...TERCERO, parteId: "parte-de-otro-tenant" });
    expect(await codigoDelError(producir(i))).toBe("PARTE_NO_EXISTE");
    expect(H.estado.lecturas.parte[0]).toMatchObject({ where: { id: "parte-de-otro-tenant", tenantId: "tenant-qa" } });
    expect(H.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("una cuenta dada de baja tampoco se acepta para una corrida nueva", async () => {
    H.estado.parte = { id: "parte-1", nombre: "X", activo: true, deletedAt: new Date() };
    expect(await codigoDelError(producir(input(TERCERO)))).toBe("PARTE_NO_EXISTE");
  });
});

describe("lo que ya está en el libro", () => {
  it("misma fecha, especie y m³ → POSIBLE_DUPLICADO con la corrida; confirmado, se registra igual", async () => {
    const tornilloM3 = input(PROPIA).corridas[1].paquetes.reduce((a, p) => a + p.volumenM3, 0);
    H.estado.delDia = [
      {
        id: "vieja",
        lineNo: 7,
        speciesCommon: "TORNILLO",
        quantity: new Prisma.Decimal(tornilloM3.toFixed(4)),
        volumeInputM3: null,
        _count: { consumos: 0 },
      },
    ];
    let error: unknown;
    await producir(input(PROPIA)).catch((e) => (error = e));
    expect(error).toBeInstanceOf(ProduccionSinLoteError);
    expect((error as ProduccionSinLoteError).code).toBe("POSIBLE_DUPLICADO");
    expect((error as ProduccionSinLoteError).detail).toMatchObject({ duplicados: [{ lineNo: 7, sinLote: true }] });
    expect(H.estado.lecturas.delDia[0]).toMatchObject({
      where: {
        tenantId: "tenant-qa",
        section: "produccion",
        deletedAt: null,
        entryDate: { gte: new Date("2026-09-22T00:00:00.000Z"), lt: new Date("2026-09-23T00:00:00.000Z") },
      },
    });
    expect(H.tx.forestCtpEntry.create).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const r = await producir(input(PROPIA, { confirmarDuplicado: true }));
    expect(H.tx.forestCtpEntry.findMany).not.toHaveBeenCalled();
    expect(r.corridas).toHaveLength(2);
  });

  it("un código de paquete usado en la planta → PAQUETE_YA_DECLARADO con el N° de la corrida", async () => {
    H.estado.choque = { codigo: LOTE[0].codigo, entry: { id: "z", lineNo: 9, deletedAt: new Date() } };
    let error: unknown;
    await producir(input(PROPIA)).catch((e) => (error = e));
    expect((error as ProduccionSinLoteError).code).toBe("PAQUETE_YA_DECLARADO");
    expect((error as Error).message).toMatch(/corrida N° 9 \(borrada\)/);
    expect(H.estado.lecturas.choque[0]).toMatchObject({ where: { tenantId: "tenant-qa" } });
    expect(H.estado.entries).toEqual([]);
  });

  it("mes cerrado → PERIODO_CERRADO, sin abrir la transacción", async () => {
    H.estado.cerrado = { label: "setiembre 2026", periodKey: "2026-09" };
    expect(await codigoDelError(producir(input(PROPIA)))).toBe("PERIODO_CERRADO");
    expect(H.prisma.$transaction).not.toHaveBeenCalled();
  });
});
