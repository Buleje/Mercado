/**
 * T3 (ADR-433) — la madera no se asierra antes de entrar al patio.
 *
 * Medido el 25-09: la vinculación de 10-HUA escribía 20 corridas de Blas (del
 * 07/09 al 22/09) con trozas de guías recibidas el 23/09. Las fechas de los
 * casos son esas. La parte pura fija el criterio; la parte de base simulada
 * prueba que los tres escritores de consumo por pieza lo aplican ANTES de
 * escribir, y que una corrida vieja que ya lo viola se puede seguir corrigiendo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  diaDelLibro,
  ingresoDeLaTroza,
  mensajeEntroDespues,
  trozasQueEntraronDespues,
  type TrozaConFechas,
} from "@/lib/forestal/recepcion-antes-de-la-sierra";

const CORRIDA_0709 = "2026-09-07T00:00:00.000Z";
const GUIA_2309 = "2026-09-23T00:00:00.000Z";

const troza = (p: Partial<TrozaConFechas> = {}): TrozaConFechas => ({
  id: "t1",
  codigo: "3037752",
  gtf: "010-001-0000014",
  fechaRecepcionTroza: null,
  fechaRecepcionGuia: GUIA_2309,
  fechaAsientoGuia: "2026-09-08T00:00:00.000Z",
  ...p,
});

describe("T3 · criterio (puro)", () => {
  it("corrida del 07/09 + troza de una guía recibida el 23/09 → rechazada", () => {
    const fuera = trozasQueEntraronDespues([troza()], CORRIDA_0709);
    expect(fuera).toEqual([
      { id: "t1", codigo: "3037752", gtf: "010-001-0000014", ingreso: "2026-09-23", fuente: "guia" },
    ]);
  });

  it("recepción PROPIA de la troza anterior a la corrida, en una guía recibida después → pasa (manda la de la troza)", () => {
    const t = troza({ fechaRecepcionTroza: "2026-09-05T00:00:00.000Z" });
    expect(ingresoDeLaTroza(t)).toEqual({ dia: "2026-09-05", fuente: "troza" });
    expect(trozasQueEntraronDespues([t], CORRIDA_0709)).toEqual([]);
  });

  it("guía sin recepción → cuenta el asiento", () => {
    const tarde = troza({ fechaRecepcionGuia: null, fechaAsientoGuia: "2026-09-10T00:00:00.000Z" });
    expect(trozasQueEntraronDespues([tarde], CORRIDA_0709)).toEqual([
      expect.objectContaining({ ingreso: "2026-09-10", fuente: "asiento" }),
    ]);
    const temprano = troza({ fechaRecepcionGuia: null, fechaAsientoGuia: "2026-09-01T00:00:00.000Z" });
    expect(trozasQueEntraronDespues([temprano], CORRIDA_0709)).toEqual([]);
  });

  it("misma fecha → pasa (se descarga a la mañana y se asierra a la tarde)", () => {
    expect(trozasQueEntraronDespues([troza({ fechaRecepcionGuia: CORRIDA_0709 })], CORRIDA_0709)).toEqual([]);
  });

  it("sin fecha de corrida o sin ninguna fecha de la troza no se inventa un rechazo", () => {
    expect(trozasQueEntraronDespues([troza()], null)).toEqual([]);
    const sinFechas = troza({ fechaRecepcionGuia: null, fechaAsientoGuia: null });
    expect(trozasQueEntraronDespues([sinFechas], CORRIDA_0709)).toEqual([]);
  });

  it("el día es el del libro, en UTC, igual que lo muestra la fila y lo corta la pantalla", () => {
    expect(diaDelLibro("2026-09-07T00:00:00.000Z")).toBe("2026-09-07");
    expect(diaDelLibro(new Date("2026-09-07T00:00:00.000Z"))).toBe("2026-09-07");
    expect(diaDelLibro("2026-09-07")).toBe("2026-09-07");
    // Una corrida creada con hora (22/09 20:30 en Lima): el libro la muestra el 23/09.
    expect(diaDelLibro(new Date("2026-09-23T01:30:00.000Z"))).toBe("2026-09-23");
    expect(diaDelLibro(null)).toBeNull();
    expect(diaDelLibro("no es fecha")).toBeNull();
  });

  it("el mensaje dice qué troza, de qué guía, con qué fechas y el camino", () => {
    const fuera = trozasQueEntraronDespues([troza()], CORRIDA_0709);
    const m = mensajeEntroDespues(fuera, { lineNo: 29, fecha: CORRIDA_0709 });
    expect(m).toContain("La troza 3037752");
    expect(m).toContain("guía 010-001-0000014: 23/09/2026, por la recepción de su guía");
    expect(m).toContain("la corrida N° 29 del 07/09/2026");
    expect(m).toContain("Corrige la fecha de recepción de la guía 010-001-0000014 en Ingresos");
    expect(m).toContain("o usa una corrida del 23/09/2026 en adelante");
  });

  it("con muchas trozas nombra cinco y cuenta el resto, y junta las guías", () => {
    const muchas = Array.from({ length: 7 }, (_, i) =>
      troza({ id: `t${i}`, codigo: `C${i}`, gtf: i % 2 ? "G-A" : "G-B" }),
    );
    const m = mensajeEntroDespues(trozasQueEntraronDespues(muchas, CORRIDA_0709), { lineNo: 3, fecha: CORRIDA_0709 });
    expect(m).toMatch(/^7 trozas entraron al patio/);
    expect(m).toContain("y 2 más");
    expect(m).toMatch(/las guías G-(A|B), G-(A|B) en Ingresos/);
  });
});

/* ───────────── Base simulada: los escritores aplican T3 antes de escribir ───────────── */

const H = vi.hoisted(() => {
  const trozaViva = (
    id: string,
    p: { fechaRecepcion?: string | null; guiaRecepcion?: string | null; consumidaEnId?: string | null } = {},
  ) => ({
    id,
    woodEntryId: "we-14",
    codigoPlanta: `P-${id}`,
    codificacion: id,
    volumenM3: 2,
    consumidaEnId: p.consumidaEnId ?? null,
    consumidaEn: p.consumidaEnId ? { status: "registrado", deletedAt: null } : null,
    despachadaEnId: null,
    despachadaEn: null,
    noRecepcionada: false,
    descarte: false,
    fechaRecepcion: p.fechaRecepcion ? new Date(p.fechaRecepcion) : null,
    _count: { retrozos: 0 },
    entry: {
      status: "validado",
      deletedAt: null,
      gtfNumber: "010-001-0000014",
      fechaRecepcion: p.guiaRecepcion === null ? null : new Date(p.guiaRecepcion ?? "2026-09-23T00:00:00.000Z"),
      entryDate: new Date("2026-09-08T00:00:00.000Z"),
    },
  });
  const estado = {
    corrida: {
      id: "corrida-29",
      lineNo: 29,
      section: "produccion",
      status: "registrado",
      quantity: null as number | null,
      volumeInputM3: null as number | null,
      speciesCommon: "Tornillo",
      unit: "m3" as string | null,
      entryDate: new Date("2026-09-07T00:00:00.000Z"),
    },
    trozas: [] as ReturnType<typeof trozaViva>[],
    escrituras: [] as string[],
    marcadas: [] as unknown[],
    setConsumos: vi.fn(async () => []),
    trozaViva,
  };
  const lote = () => ({
    id: "L-1",
    code: "LA-2026-001",
    status: "abierto",
    speciesCommon: "Tornillo",
    trozas: estado.trozas,
  });
  const tx = {
    $queryRaw: async () => [estado.corrida],
    forestCtpConsumo: { count: async () => 0, findMany: async () => [] },
    forestLoteAserrio: {
      count: async () => 0,
      findFirst: async () => lote(),
      update: async () => {
        estado.escrituras.push("lote");
        return {};
      },
    },
    forestCtpEntry: {
      findFirst: async () => estado.corrida,
      update: async () => {
        estado.escrituras.push("corrida");
        return {};
      },
    },
    woodEntryTroza: {
      findMany: async () => estado.trozas,
      updateMany: async (args: { where: unknown; data: unknown }) => {
        estado.escrituras.push("trozas");
        estado.marcadas.push(args);
        return { count: 1 };
      },
    },
  };
  return { estado, tx, lote };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(H.tx),
    forestCtpConsumo: { findMany: async () => [], count: async () => 0 },
    forestCtpEntry: H.tx.forestCtpEntry,
    forestLoteAserrio: { findFirst: async () => H.lote() },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", async (real) => ({
  ...((await real()) as Record<string, unknown>),
  auditCtp: () => {},
}));
/* Desde el 27-09 la atribución de sumar/consumir va DENTRO de la tx
   (`setConsumosEnTx`) y los cierres se leen antes de abrirla: el mismo espía
   cuenta las dos puertas. */
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({
  ForestCtpCierreDB: { closedPeriodOf: async () => null, list: async () => [] },
}));
vi.mock("@/lib/db/forest-ctp-consumo.db", async (real) => {
  const mod = (await real()) as Record<string, unknown>;
  return {
    ...mod,
    ForestCtpConsumoDB: {
      setConsumos: H.estado.setConsumos,
      setConsumosEnTx: H.estado.setConsumos,
      despuesDeConsumos: async () => {},
    },
  };
});

import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

beforeEach(() => {
  H.estado.escrituras.length = 0;
  H.estado.marcadas.length = 0;
  H.estado.setConsumos.mockClear();
  H.estado.corrida = { ...H.estado.corrida, entryDate: new Date("2026-09-07T00:00:00.000Z") };
});

const t3 = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(CtpInvariantError);
  expect((e as CtpInvariantError).code).toBe("T3_ASERRADA_ANTES_DE_LLEGAR");
  return e as CtpInvariantError;
};

describe("T3 · sumarACorrida (vincular)", () => {
  const sumar = () =>
    ForestLoteAserrioDB.sumarACorrida("tenant-blas", {
      loteId: "L-1",
      corridaId: "corrida-29",
      trozaIds: ["t1"],
      user: "qaadmin",
    });

  it("troza de guía recibida el 23/09 a la corrida del 07/09 → rechazada sin escribir nada", async () => {
    H.estado.trozas = [H.estado.trozaViva("t1")];
    const e = await t3(sumar());
    expect(e.message).toContain("la corrida N° 29 del 07/09/2026");
    expect(e.detail).toMatchObject({ corridaId: "corrida-29", fechaCorrida: "2026-09-07" });
    expect(H.estado.escrituras).toEqual([]);
    expect(H.estado.setConsumos).not.toHaveBeenCalled();
  });

  it("la troza bajó del camión el 05/09 aunque la guía se recibió el 23/09 → pasa", async () => {
    H.estado.trozas = [H.estado.trozaViva("t1", { fechaRecepcion: "2026-09-05T00:00:00.000Z" })];
    await expect(sumar()).resolves.toMatchObject({ piezas: 1 });
    expect(H.estado.setConsumos).toHaveBeenCalledTimes(1);
  });
});

describe("T3 · consumir (lote → corrida, Consumos y jornadas)", () => {
  it("rechaza antes de atribuir m³ y antes de marcar piezas", async () => {
    H.estado.trozas = [H.estado.trozaViva("t1")];
    await t3(ForestLoteAserrioDB.consumir("tenant-blas", "L-1", "corrida-29", undefined, "qaadmin"));
    expect(H.estado.setConsumos).not.toHaveBeenCalled();
    expect(H.estado.escrituras).toEqual([]);
  });

  it("misma fecha → pasa", async () => {
    H.estado.trozas = [H.estado.trozaViva("t1", { guiaRecepcion: "2026-09-07T00:00:00.000Z" })];
    await expect(
      ForestLoteAserrioDB.consumir("tenant-blas", "L-1", "corrida-29", undefined, "qaadmin"),
    ).resolves.toMatchObject({ piezas: 1 });
  });
});

describe("T3 · marcarTrozasConsumidas (patio)", () => {
  const marcar = (ids: string[]) =>
    WoodEntriesDB.marcarTrozasConsumidas("tenant-blas", "corrida-29", ids, { usuario: "qaadmin" });

  it("una troza NUEVA que llegó después → rechazada, sin soltar ni tomar piezas", async () => {
    H.estado.trozas = [H.estado.trozaViva("t1")];
    await t3(marcar(["t1"]));
    expect(H.estado.escrituras).toEqual([]);
  });

  it("guía sin recepción: cuenta el asiento (08/09) y la corrida es del 07/09 → rechazada", async () => {
    H.estado.trozas = [H.estado.trozaViva("t1", { guiaRecepcion: null })];
    const e = await t3(marcar(["t1"]));
    expect(e.message).toContain("por el asiento de su guía");
  });

  it("dato viejo: las piezas que la corrida YA tenía no traban corregirla", async () => {
    // t1 y t2 ya son de esta corrida y violan la regla (como la 95002 de `main`): soltar t2 tiene que poder hacerse.
    H.estado.trozas = [H.estado.trozaViva("t1", { consumidaEnId: "corrida-29" })];
    await expect(marcar(["t1"])).resolves.toEqual({ consumidas: 1 });
    expect(H.estado.escrituras).toEqual(["trozas", "trozas"]);
  });
});
