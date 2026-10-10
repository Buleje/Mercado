/**
 * Anular en el Libro TH ve el ingreso de la MISMA guía en el Libro CTP
 * (revisión 29-09-2026, regla de la memoria `numero-de-guia-tramo-a-tramo`:
 * N° tramo a tramo + mismo titular o permiso).
 *
 * 1. Nombres reales de Blas: el plan dice «CCNN SAN LUIS DE CHINCHIGUANI» (sin
 *    título) y el ingreso de SERFOR «COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI».
 *    «Recibir» los toma por la misma guía («ya entró»); anular en el TH tenía
 *    que frenar igual, y no lo veía: liberaba trozas que están en el CTP.
 * 2. Dos titulares con el mismo N° en el Libro TH: anular UNA línea de despacho
 *    miraba «la guía más nueva con ese N°» (la del otro titular, con otro
 *    permiso) y dejaba anular la línea cuya madera ya entró al CTP.
 *
 * Base simulada: una `tx` falsa con las filas justas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  ingresos: [] as Record<string, unknown>[],
  gtfs: [] as Record<string, unknown>[],
  lineas: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));

import { GtfNumeroDB, GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";

const T = "t-prueba";
const termina = (v: unknown, w?: { endsWith?: string }) =>
  !w?.endsWith || String(v ?? "").toLowerCase().endsWith(w.endsWith.toLowerCase());
const porFecha = (a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.createdAt) - Number(a.createdAt);

const tx = {
  $executeRaw: vi.fn(async () => 0),
  woodEntry: {
    findMany: vi.fn(async (q: { where: { gtfNumber?: { endsWith: string } } }) =>
      H.ingresos.filter((e) => termina(e.gtfNumber, q.where.gtfNumber)),
    ),
  },
  forestLothEntry: {
    findFirst: vi.fn(async (q: { where: { id: string } }) => H.lineas.find((l) => l.id === q.where.id) ?? null),
  },
  forestGtf: {
    findFirst: vi.fn(async (q: { where: { gtfNumber: string } }) =>
      H.gtfs.filter((g) => g.gtfNumber === q.where.gtfNumber).sort(porFecha)[0] ?? null,
    ),
    findMany: vi.fn(async (q: { where: { gtfNumber: string } }) =>
      H.gtfs.filter((g) => g.gtfNumber === q.where.gtfNumber).sort(porFecha),
    ),
  },
} as never;

/** El control privado de `annul` de una línea: el que corre dentro de su transacción. */
const exigirDespachoFueraDelCtp = (id: string) =>
  (ForestLothDB as unknown as { exigirDespachoFueraDelCtp: (tx: never, t: string, id: string) => Promise<void> })
    .exigirDespachoFueraDelCtp.call(ForestLothDB, tx, T, id);

beforeEach(() => {
  H.ingresos = [];
  H.gtfs = [];
  H.lineas = [];
});

describe("anular en el TH — el titular escrito distinto es la misma guía", () => {
  const serfor = {
    id: "i1",
    gtfNumber: "019-0000001",
    providerName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
    originCode: "19-SEC/PER-FMC-2024-008",
    libroNro: 23,
    serforNumeroRegistro: "1-19-0300920",
    speciesCommonName: "Tornillo",
  };
  const th = { gtfNumber: "19-0000001", titular: "CCNN SAN LUIS DE CHINCHIGUANI", permiso: null };

  it("«Recibir» ve el ingreso y anular también frena", async () => {
    H.ingresos = [serfor];
    expect(await GtfNumeroDB.ingresosVivos(tx, T, th.gtfNumber, { identidad: th })).toHaveLength(1);
    await expect(GtfNumeroDB.exigirSinIngresosEnElCtp(tx, T, th)).rejects.toBeInstanceOf(GuiaYaEnElCtpError);
  });

  it("otro titular con otro permiso y el mismo N° no traba el TH", async () => {
    H.ingresos = [{ ...serfor, providerName: "QUINCHUNLLA PEREZ, NELLY", originCode: "19-SEC/REG-PLT-2018-020" }];
    await expect(
      GtfNumeroDB.exigirSinIngresosEnElCtp(tx, T, { ...th, permiso: "19-SEC/PER-FMC-2024-008" }),
    ).resolves.toBeUndefined();
  });
});

describe("anular UNA línea de despacho — la guía es la que lleva su troza", () => {
  const N = "019-001-0000012";
  const chivis = { titularName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", tituloHabilitante: "19-SEC/REG-PLT-2021-017" };
  const quin = { titularName: "QUINCHUNLLA PEREZ, NELLY", tituloHabilitante: "19-SEC/REG-PLT-2018-020" };

  beforeEach(() => {
    H.gtfs = [
      { id: "a", gtfNumber: N, ...chivis, gtfDatos: {}, items: [{ code: "85-TOR-A" }], createdAt: 1 },
      { id: "b", gtfNumber: N, ...quin, gtfDatos: {}, items: [{ code: "12-CED-B" }], createdAt: 2 },
    ];
    H.lineas = [
      { id: "L", section: "despacho_troza", status: "registrado", gtfNumber: N, trozaCode: "85-TOR-A", treeCode: null, planId: "pA", lineNo: 1 },
    ];
  });

  it("frena si la madera de SU guía ya entró al CTP, aunque el otro titular emitió después", async () => {
    H.ingresos = [{ id: "i", gtfNumber: N, providerName: chivis.titularName, originCode: chivis.tituloHabilitante, libroNro: 40, serforNumeroRegistro: null, speciesCommonName: "Tornillo" }];
    await expect(exigirDespachoFueraDelCtp("L")).rejects.toBeInstanceOf(GuiaYaEnElCtpError);
  });

  it("no frena por el ingreso de la guía del OTRO titular", async () => {
    H.ingresos = [{ id: "i", gtfNumber: N, providerName: quin.titularName, originCode: quin.tituloHabilitante, libroNro: 41, serforNumeroRegistro: null, speciesCommonName: "Cedro" }];
    await expect(exigirDespachoFueraDelCtp("L")).resolves.toBeUndefined();
  });

  it("si no se sabe de qué guía es la línea, cuenta cualquier ingreso con ese N°", async () => {
    H.lineas = [{ ...H.lineas[0], trozaCode: "sin-guia" }];
    H.ingresos = [{ id: "i", gtfNumber: N, providerName: quin.titularName, originCode: quin.tituloHabilitante, libroNro: 41, serforNumeroRegistro: null, speciesCommonName: "Cedro" }];
    await expect(exigirDespachoFueraDelCtp("L")).rejects.toBeInstanceOf(GuiaYaEnElCtpError);
  });
});
