/**
 * ADR-450 R2 — el alta de una guía entera guarda TODO lo que trae cada troza.
 *
 * `crearDesdeGtfEnTx` (alta desde SERFOR y «Recibir» del Libro TH) guardaba
 * sólo la parcela de cada pieza: «no llegó», su fecha, el código de planta y
 * su observación se perdían SIN error, y L1 (recibir contando) hubiera entrado
 * todo como llegado. Acá se recorre CADA clave de `WoodEntryTrozaInput` contra
 * la fila que se crea: si mañana se suma una clave al input y no a la fila,
 * este archivo no compila (`satisfies Required<…>` y el `Record` de columnas).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WoodEntryTrozaInput } from "@/lib/db/wood-entries.db";

const H = vi.hoisted(() => {
  const estado = {
    creadas: [] as Record<string, unknown>[],
    locks: 0,
  };
  const tx = {
    $executeRaw: async () => {
      estado.locks += 1;
      return 1;
    },
    /* El guard del código de planta: ninguno está en uso. */
    $queryRaw: async () => [],
    woodEntry: {
      /* `ingresosVivos`: la guía no está en el libro. */
      findMany: async () => [],
      aggregate: async () => ({ _max: { libroNro: 41 } }),
      create: async (a: { data: Record<string, unknown> }) => ({ id: `we-${String(a.data.libroNro)}`, ...a.data }),
    },
    woodEntryTroza: {
      createMany: async (a: { data: Record<string, unknown>[] }) => {
        estado.creadas.push(...a.data);
        return { count: a.data.length };
      },
    },
  };
  return { estado, tx };
});

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {}, m3: (v: number) => `${v} m³` }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null, list: async () => [] } }));

const { WoodEntriesDB } = await import("@/lib/db/wood-entries.db");

/** Una troza con TODAS las claves del input puestas (y distintas de su default). */
const COMPLETA = {
  orden: 3,
  codificacion: "113-A",
  especieComun: "Sapotillo",
  especieCientifica: "Quararibea cordata",
  dimensiones: "70 X 60 X 5",
  largoM: 5,
  diametroCm: 65,
  d1Cm: 70,
  d2Cm: 60,
  cantidad: 1,
  volumenM3: 1.6592,
  codigoPlanta: "P-118",
  parcela: "PC-2",
  fechaRecepcion: new Date("2026-09-28T12:00:00.000Z"),
  noRecepcionada: false,
  recepcionObs: "Llegó rajada en la testa",
  lothTrozadoId: "cmtrozado113a",
  arbolCodigo: "113",
  recibida: { d1Cm: 70, d2Cm: 60, largoM: 4.2, volumenM3: 1.3937 },
} satisfies Required<WoodEntryTrozaInput>;

/** Dónde cae cada clave del input en la fila de `WoodEntryTroza`. */
const COLUMNAS: Record<keyof WoodEntryTrozaInput, readonly string[]> = {
  orden: ["orden"],
  codificacion: ["codificacion"],
  especieComun: ["especieComun"],
  especieCientifica: ["especieCientifica"],
  dimensiones: ["dimensiones"],
  largoM: ["largoM"],
  diametroCm: ["diametroCm"],
  d1Cm: ["d1Cm"],
  d2Cm: ["d2Cm"],
  cantidad: ["cantidad"],
  volumenM3: ["volumenM3"],
  codigoPlanta: ["codigoPlanta"],
  parcela: ["parcela"],
  fechaRecepcion: ["fechaRecepcion"],
  noRecepcionada: ["noRecepcionada"],
  recepcionObs: ["recepcionObs"],
  lothTrozadoId: ["lothTrozadoId"],
  arbolCodigo: ["arbolCodigo"],
  recibida: ["recibidaD1Cm", "recibidaD2Cm", "recibidaLargoM", "recibidaVolumenM3"],
};

/** Decimal de Prisma, Date o escalar → algo comparable. */
const plano = (v: unknown): unknown => {
  if (v instanceof Date) return v.toISOString();
  if (v != null && typeof v === "object" && "toNumber" in v) return Number(v);
  return v;
};

const alta = (t: WoodEntryTrozaInput) => ({
  gtfNumber: "019-001-0000999",
  providerName: "Titular de prueba",
  createdBy: "test",
  lineas: [{ especieComun: "Sapotillo", especieCientifica: null, volumenM3: 1.6592, piezas: 1, trozas: [t] }],
});

beforeEach(() => {
  H.estado.creadas = [];
  H.estado.locks = 0;
});

describe("crearDesdeGtfEnTx guarda cada clave de la troza (ADR-450 R2)", () => {
  it("todas las claves del input llegan a su columna, con su valor", async () => {
    await WoodEntriesDB.crearDesdeGtfEnTx(H.tx as never, "main", alta(COMPLETA), null);
    expect(H.estado.creadas).toHaveLength(1);
    const fila = H.estado.creadas[0] as Record<string, unknown>;
    for (const clave of Object.keys(COMPLETA) as (keyof WoodEntryTrozaInput)[]) {
      const columnas = COLUMNAS[clave];
      const valor = COMPLETA[clave];
      if (clave === "recibida") {
        expect(columnas.map((c) => plano(fila[c]))).toEqual([70, 60, 4.2, 1.3937]);
        continue;
      }
      expect(plano(fila[columnas[0] as string]), `la clave «${clave}» no llegó a la fila`).toEqual(plano(valor));
    }
    expect(fila).toMatchObject({ tenantId: "main", woodEntryId: "we-42" });
  });

  it("la que NO llegó: sin fecha de llegada ni medida de planta, con su motivo", async () => {
    await WoodEntriesDB.crearDesdeGtfEnTx(
      H.tx as never,
      "main",
      alta({ ...COMPLETA, noRecepcionada: true, recepcionObs: "No llegó al patio al recibir la guía" }),
      null,
    );
    const fila = H.estado.creadas[0] as Record<string, unknown>;
    expect(fila).toMatchObject({
      noRecepcionada: true,
      fechaRecepcion: null,
      recepcionObs: "No llegó al patio al recibir la guía",
      recibidaD1Cm: null,
      recibidaD2Cm: null,
      recibidaLargoM: null,
      recibidaVolumenM3: null,
      lothTrozadoId: "cmtrozado113a",
      arbolCodigo: "113",
    });
    /* El m³ de la GUÍA se guarda igual: la faltante no borra el acta. */
    expect(plano(fila.volumenM3)).toBe(1.6592);
  });

  it("sin los opcionales, la fila queda con sus defaults (no «undefined» colado)", async () => {
    const minima: WoodEntryTrozaInput = {
      orden: 1,
      codificacion: "113-B",
      especieComun: "Sapotillo",
      especieCientifica: null,
      dimensiones: null,
      largoM: 4,
      diametroCm: null,
      d1Cm: null,
      d2Cm: null,
      cantidad: 1,
      volumenM3: 1.0387,
    };
    await WoodEntriesDB.crearDesdeGtfEnTx(H.tx as never, "main", alta(minima), null);
    const fila = H.estado.creadas[0] as Record<string, unknown>;
    expect(fila).toMatchObject({
      codigoPlanta: null,
      parcela: null,
      fechaRecepcion: null,
      noRecepcionada: false,
      recepcionObs: null,
      lothTrozadoId: null,
      arbolCodigo: null,
      recibidaVolumenM3: null,
    });
    expect(Object.values(fila).some((v) => v === undefined)).toBe(false);
  });

  it("el código de planta pasa por el guard (toma el candado); sin código no lo toma", async () => {
    await WoodEntriesDB.crearDesdeGtfEnTx(H.tx as never, "main", alta(COMPLETA), null);
    const conCodigo = H.estado.locks;
    H.estado.locks = 0;
    await WoodEntriesDB.crearDesdeGtfEnTx(H.tx as never, "main", alta({ ...COMPLETA, codigoPlanta: null }), null);
    expect(conCodigo).toBe(H.estado.locks + 1);
  });
});
