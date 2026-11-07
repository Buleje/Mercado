/**
 * El badge de «Productos disponibles» cuenta los paquetes sin medidas que SIGUEN
 * EN EL PATIO, y es el mismo número que el chip «sin escuadría» de esa pantalla.
 *
 * Por qué existe: la campana cuenta el histórico del libro (34 en Blas, con lo ya
 * despachado o consumido); sumar ese total al badge no cuadraba con el chip. Con
 * HEAD no hay conteo «en el patio» ni badge que lo use.
 *
 * Se fija:
 *  · badge == chip sobre UN mismo depósito (la pantalla con `productosDisponibles`
 *    y el conteo del servidor leen lo mismo), y ≠ del total histórico;
 *  · la DB filtra con `whereCorridaEnElPatio` (tenantId, usado, cantidad, origen),
 *    deja afuera corrida sin saldo y paquete en guía viva, y no baja filas;
 *  · la pestaña suma reservas vencidas + sin medidas del patio, nada más.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  findMany: vi.fn(),
  saldos: vi.fn(),
  despachados: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { forestCtpPaquete: { findMany: H.findMany, count: vi.fn() } } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: vi.fn() } }));
vi.mock("@/lib/db/forest-ctp-saldo-corrida", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/forest-ctp-saldo-corrida")>()),
  saldosDeCorridas: H.saldos,
}));
vi.mock("@/lib/db/forest-ctp-despacho.db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/forest-ctp-despacho.db")>();
  return {
    ...actual,
    ForestCtpDespachoDB: { ...actual.ForestCtpDespachoDB, codigosDespachados: H.despachados },
  };
});

import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { alertasPorVistaDe } from "@/lib/forestal/alertas-por-vista";
import {
  contarSinMedidasEnElPatio,
  resumenPaquetesSinMedidas,
  type CandidatoEnElPatio,
} from "@/lib/forestal/paquetes-sin-medidas";
import {
  filasDeProductos,
  resumenProductos,
  type CorridaDisponible,
  type PaqueteDisponible,
} from "@/lib/forestal/productos-disponibles-resumen";

const TENANT = "tenant-qa";
const AHORA = new Date("2026-09-30T12:00:00-05:00");

const pq = (id: string, o: Partial<PaqueteDisponible> = {}): PaqueteDisponible => ({
  id,
  codigo: id,
  producto: null,
  presentacion: "PAQUETES",
  cantidad: 10,
  volumenM3: 0.5,
  espesorCm: 5.08,
  anchoCm: 20.32,
  largoM: 3,
  observations: null,
  apartado: null,
  ...o,
});
const cr = (id: string, disponible: number, paquetes: PaqueteDisponible[]): CorridaDisponible => ({
  id,
  lineNo: 1,
  fecha: "2026-09-01T00:00:00.000Z",
  especie: "Tornillo",
  especieCientifica: null,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: null,
  unidad: "m3",
  lote: null,
  cantidad: 1,
  volumenConsumidoM3: null,
  producido: disponible,
  despachado: 0,
  reprocesado: 0,
  disponible,
  paquetes,
  observations: null,
  titularOrigen: ["CON-25-UCA-0207"],
  gtfOrigen: [],
  usadoAt: null,
  usadoMotivo: null,
  apartado: null,
});

/**
 * El libro: lo que el servidor lee (TODOS los paquetes vivos de corridas
 * registradas) y lo que la pantalla termina mostrando.
 *  · cA en el patio: A1 sin espesor (cuenta) · A2 completo · A3 sin ancho pero ya en una guía viva.
 *  · cB agotada (saldo 0): B1 sin medidas — ya no está.
 *  · cC en el patio: C1 con largo 0 (cuenta) · C2 completo.
 */
const A1 = pq("A1", { espesorCm: null });
const A2 = pq("A2");
const A3 = pq("A3", { anchoCm: null });
const B1 = pq("B1", { espesorCm: null, anchoCm: null, largoM: null });
const C1 = pq("C1", { largoM: 0 });
const C2 = pq("C2");

const SALDOS = new Map([
  ["cA", { disponible: 1 }],
  ["cB", { disponible: 0 }],
  ["cC", { disponible: 1 }],
]);
const DESPACHADOS = new Set(["A3"]);

const candidatos = (ps: [string, PaqueteDisponible][]): CandidatoEnElPatio[] =>
  ps.map(([ctpEntryId, p]) => ({
    codigo: p.codigo,
    ctpEntryId,
    espesorCm: p.espesorCm,
    anchoCm: p.anchoCm,
    largoM: p.largoM,
  }));
const TODOS = candidatos([["cA", A1], ["cA", A2], ["cA", A3], ["cB", B1], ["cC", C1], ["cC", C2]]);

/** Lo que dibuja `productosDisponibles`: sin la corrida agotada y sin el paquete ya despachado. */
const pantalla = () => filasDeProductos([cr("cA", 1, [A1, A2]), cr("cC", 1, [C1, C2])], AHORA);

describe("badge == chip", () => {
  it("cuenta lo mismo que el chip «sin escuadría» y no el histórico", () => {
    const chip = resumenProductos(pantalla(), AHORA).sinEscuadria;
    const badge = contarSinMedidasEnElPatio(TODOS, SALDOS, DESPACHADOS);
    expect(chip).toBe(2);
    expect(badge).toBe(chip);
    /* El histórico de la campana incluye lo despachado y lo agotado. */
    expect(TODOS.filter((p) => p.espesorCm == null || p.anchoCm == null || !p.largoM)).toHaveLength(4);
  });

  it("una corrida sin saldo en el mapa (desconocida) no cuenta", () => {
    expect(contarSinMedidasEnElPatio(TODOS, new Map(), DESPACHADOS)).toBe(0);
  });

  it("un paquete completo que se cuele no cuenta", () => {
    expect(contarSinMedidasEnElPatio(candidatos([["cA", A2], ["cC", C2]]), SALDOS, new Set())).toBe(0);
  });
});

describe("ForestCtpDB.paquetesSinMedidasEnElPatio", () => {
  const dec = (n: number | null) => (n == null ? null : ({ valueOf: () => n, toString: () => String(n) } as never));
  const fila = (ctpEntryId: string, p: PaqueteDisponible) => ({
    codigo: p.codigo,
    ctpEntryId,
    espesorCm: dec(p.espesorCm),
    anchoCm: dec(p.anchoCm),
    largoM: dec(p.largoM),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    H.findMany.mockResolvedValue([fila("cA", A1), fila("cA", A3), fila("cB", B1), fila("cC", C1)]);
    H.saldos.mockResolvedValue(SALDOS);
    H.despachados.mockResolvedValue(DESPACHADOS);
  });

  it("sin tenantId no lee nada", async () => {
    await expect(ForestCtpDB.paquetesSinMedidasEnElPatio("")).rejects.toThrow("tenantId is required");
    expect(H.findMany).not.toHaveBeenCalled();
  });

  it("da el número del chip (2), no el histórico (4)", async () => {
    await expect(ForestCtpDB.paquetesSinMedidasEnElPatio(TENANT)).resolves.toBe(
      resumenProductos(pantalla(), AHORA).sinEscuadria,
    );
  });

  it("filtra con el criterio de patio de Productos disponibles, por tenant, y lee pocas columnas", async () => {
    await ForestCtpDB.paquetesSinMedidasEnElPatio(TENANT);
    const { where, select } = H.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ tenantId: TENANT, deletedAt: null });
    expect(where.entry).toMatchObject({
      tenantId: TENANT,
      section: "produccion",
      deletedAt: null,
      status: "registrado",
      quantity: { not: null },
      usadoAt: null,
      OR: [{ volumeInputM3: { gt: 0 } }, { consumos: { some: {} } }],
    });
    expect(Object.keys(select).sort()).toEqual(["anchoCm", "codigo", "ctpEntryId", "espesorCm", "largoM"]);
    expect(H.saldos.mock.calls[0][1]).toBe(TENANT);
    expect(H.despachados.mock.calls[0][0]).toBe(TENANT);
  });

  it("sin paquetes sin medidas en el patio no pregunta saldos ni guías", async () => {
    H.findMany.mockResolvedValue([]);
    await expect(ForestCtpDB.paquetesSinMedidasEnElPatio(TENANT)).resolves.toBe(0);
    expect(H.saldos).not.toHaveBeenCalled();
    expect(H.despachados).not.toHaveBeenCalled();
  });
});

describe("la pestaña y la campana", () => {
  it("Productos disponibles suma reservas vencidas + sin medidas del patio", () => {
    const lista = [{ vista: "ingresos", cantidad: 3 }, { vista: "disponibles", cantidad: 1 }];
    expect(alertasPorVistaDe(lista, { reservasVencidas: 2, sinMedidasEnElPatio: 11 })).toEqual({
      ingresos: 3,
      disponibles: 14,
    });
  });

  it("sin nada en el patio no aparece badge inventado", () => {
    expect(alertasPorVistaDe([], { reservasVencidas: 0, sinMedidasEnElPatio: 0 })).toEqual({});
  });

  it("la campana distingue los del patio del total histórico", () => {
    expect(resumenPaquetesSinMedidas(34)).toBe("34 paquetes sin medidas");
    expect(resumenPaquetesSinMedidas(34, 11)).toBe("34 paquetes sin medidas · 11 en el patio");
    expect(resumenPaquetesSinMedidas(1, 0)).toBe("1 paquete sin medidas · 0 en el patio");
  });
});
