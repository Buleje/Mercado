/**
 * `WoodEntriesDB.agregarTrozas` reparte por especie (ADR-435).
 *
 * Así nació el problema en Blas (24-09 05:09): el inventario del SNIFFS
 * completó la lista de la GTF 010-001-0000005 —ya registrada desde SERFOR con
 * una fila por especie, todas validadas y sin lista— entrando por UNA fila
 * (`idByGtf` eligió «Copal») y le colgó las siete. Acá se prueba lo que queda
 * escrito con la misma entrada: cada troza en la fila de su especie, y el
 * «ya tiene su lista» mirado sobre la guía entera.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const fila = (id: string, especie: string, status = "validado") => ({
    id,
    tenantId: "t-blas",
    gtfNumber: "010-001-0000005",
    gtfSeries: null as string | null,
    speciesCommonName: especie,
    speciesScientificName: null as string | null,
    status,
    entryDate: new Date("2026-09-08T00:00:00Z"),
    deletedAt: null,
  });
  const estado = {
    filas: [] as ReturnType<typeof fila>[],
    existentes: [] as { codificacion: string | null; orden: number; woodEntryId: string }[],
    creadas: [] as { woodEntryId: string; codificacion: string | null; orden: number }[],
    audit: [] as { entityId: string; detail: string }[],
  };
  const tx = {
    /* ADR-437: el alta bloquea la guía y hereda su plata (marca de servicio, dueño). */
    $executeRaw: async () => 1,
    woodEntry: {
      aggregate: async () => ({ _max: { libroNro: 10 } }),
      create: async (a: { data: Record<string, unknown> }) => ({ id: "nueva", costoTotal: null, ...a.data }),
      findFirst: async () => null,
    },
    woodEntryTroza: {
      findMany: async (a: { where: { woodEntryId: { in: string[] } } }) =>
        estado.existentes.filter((t) => a.where.woodEntryId.in.includes(t.woodEntryId)),
      createMany: async (a: { data: { woodEntryId: string; codificacion: string | null; orden: number }[] }) => {
        estado.creadas.push(...a.data);
        return { count: a.data.length };
      },
    },
  };
  const prisma = {
    woodEntry: {
      findFirst: async (a: { where: { id: string; tenantId: string } }) =>
        estado.filas.find((f) => f.id === a.where.id && f.tenantId === a.where.tenantId) ?? null,
      findMany: async (a: { where: { tenantId: string; gtfNumber: string } }) =>
        estado.filas.filter((f) => f.tenantId === a.where.tenantId && f.gtfNumber === a.where.gtfNumber),
    },
    woodEntryTroza: {
      count: async (a: { where: { woodEntryId: { in: string[] } } }) =>
        estado.existentes.filter((t) => a.where.woodEntryId.in.includes(t.woodEntryId)).length,
    },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { estado, prisma, fila };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: (p: { entityId: string; detail: string }) => H.estado.audit.push(p),
  m3: (v: number) => `${v} m³`,
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null, list: async () => [] } }));
vi.mock("@/lib/db/forest-contrato.db", () => ({ ForestContratoDB: { idPorCodigo: async () => null } }));
vi.mock("@/lib/db/forest-especies.db", () => ({
  ForestEspeciesDB: { resolverEspecie: async (_t: string, nombre: string) => ({ nombre, cientifico: null }) },
}));

const { WoodEntriesDB } = await import("@/lib/db/wood-entries.db");

const pieza = (codificacion: string, especieComun: string, volumenM3: number) => ({
  orden: 1,
  codificacion,
  especieComun,
  especieCientifica: null,
  dimensiones: null,
  largoM: null,
  diametroCm: null,
  d1Cm: null,
  d2Cm: null,
  cantidad: 1,
  volumenM3,
});

/** Las 7 filas del inventario para la 0000005, como vinieron en «Sheet1». */
const sheet1 = [
  pieza("115-A", "Cachimbo", 2.808),
  pieza("115-B", "Cachimbo", 2.153),
  pieza("115-C", "Cachimbo", 1.956),
  pieza("116-B", "Shimbillo", 2.991),
  pieza("226-B", "Cachimbo", 1.44),
  pieza("233-A", "Cachimbo", 3.453),
  pieza("215-X", "Copal", 1.752),
];

beforeEach(() => {
  H.estado.filas = [H.fila("cachimbo", "Cachimbo"), H.fila("shimbillo", "Shimbillo"), H.fila("copal", "Copal")];
  H.estado.existentes = [];
  H.estado.creadas = [];
  H.estado.audit = [];
});

describe("agregarTrozas — la importación que completa una guía de varias especies", () => {
  it("entrando por la fila Copal, cada troza queda en la fila de su especie", async () => {
    const r = await WoodEntriesDB.agregarTrozas("t-blas", "copal", sheet1, "import", { desdeImportacion: true });
    expect(r.agregadas).toBe(7);
    const en = (id: string) => H.estado.creadas.filter((t) => t.woodEntryId === id).map((t) => t.codificacion);
    expect(en("cachimbo")).toEqual(["115-A", "115-B", "115-C", "226-B", "233-A"]);
    expect(en("shimbillo")).toEqual(["116-B"]);
    expect(en("copal")).toEqual(["215-X"]);
    // La numeración sigue por fila: la primera de cada una es la N° 1.
    expect(H.estado.creadas.filter((t) => t.woodEntryId === "cachimbo").map((t) => t.orden)).toEqual([1, 2, 3, 4, 5]);
    expect(r.fueraDeSuFila).toEqual([]);
    // Un renglón de auditoría por fila que recibió piezas.
    expect(H.estado.audit.map((a) => a.entityId).sort()).toEqual(["cachimbo", "copal", "shimbillo"]);
  });

  it("re-importar el mismo archivo por OTRA fila no duplica: la guía ya tiene su lista", async () => {
    H.estado.existentes = [{ codificacion: "215-X", orden: 1, woodEntryId: "copal" }];
    const r = await WoodEntriesDB.agregarTrozas("t-blas", "cachimbo", sheet1, "import", { desdeImportacion: true });
    expect(r.bloqueado).toBe("ya-tiene-lista");
    expect(H.estado.creadas).toEqual([]);
  });

  it("guía pendiente: las repetidas se miran en TODA la guía, no sólo en la fila", async () => {
    H.estado.filas = H.estado.filas.map((f) => ({ ...f, status: "pendiente" }));
    H.estado.existentes = [{ codificacion: "115-A", orden: 1, woodEntryId: "cachimbo" }];
    const r = await WoodEntriesDB.agregarTrozas("t-blas", "copal", sheet1, "qa");
    expect(r.repetidas).toEqual(["115-A"]);
    expect(r.agregadas).toBe(6);
    // Cachimbo seguía su numeración: la primera nueva es la N° 2.
    expect(H.estado.creadas.find((t) => t.codificacion === "115-B")).toMatchObject({ woodEntryId: "cachimbo", orden: 2 });
  });

  it("especie sin fila: se queda en la fila de la carga y se dice; fila validada con lista: no recibe", async () => {
    H.estado.filas = [
      H.fila("copal", "Copal", "pendiente"),
      H.fila("cachimbo", "Cachimbo", "validado"),
    ];
    H.estado.existentes = [{ codificacion: "OTRA", orden: 1, woodEntryId: "cachimbo" }];
    const r = await WoodEntriesDB.agregarTrozas("t-blas", "copal", [pieza("L-1", "Lupuna", 1), pieza("C-9", "Cachimbo", 1)], "qa");
    expect(H.estado.creadas.map((t) => [t.codificacion, t.woodEntryId])).toEqual([
      ["L-1", "copal"],
      ["C-9", "copal"],
    ]);
    expect(r.fueraDeSuFila).toEqual([
      { codigo: "L-1", especie: "Lupuna", nota: "sin_fila" },
      { codigo: "C-9", especie: "Cachimbo", nota: "fila_no_recibe" },
    ]);
  });
});

describe("create — una fila nueva de una guía que ya tiene otra especie", () => {
  it("la pieza de otra especie va a la fila hermana, salvo que esa fila ya la tenga (no se duplica)", async () => {
    H.estado.filas = [H.fila("cachimbo", "Cachimbo", "pendiente")];
    H.estado.existentes = [{ codificacion: "115-A", orden: 1, woodEntryId: "cachimbo" }];
    const creado = await WoodEntriesDB.create("t-blas", {
      gtfNumber: "010-001-0000005",
      providerName: "SANTOS MUÑOZ",
      speciesCommonName: "Copal",
      volumeM3: 1.752,
      pieces: 1,
      createdBy: "qa",
      trozas: [pieza("115-A", "Cachimbo", 2.808), pieza("115-B", "Cachimbo", 2.153), pieza("215-X", "Copal", 1.752)],
    });
    expect(H.estado.creadas.map((t) => [t.codificacion, t.woodEntryId])).toEqual([
      ["115-B", "cachimbo"],
      ["215-X", "nueva"],
    ]);
    expect(creado.acomodo.yaEstabanEnSuFila).toEqual([{ codigo: "115-A", especie: "Cachimbo" }]);
    expect(creado.acomodo.aOtrasFilas).toEqual([{ woodEntryId: "cachimbo", especie: "Cachimbo", trozas: 1 }]);
  });
});
