/**
 * __tests__/declarar-produccion-trato-cliente.test.ts
 *
 * ADR-430 en «Declarar producción» y en los cobros de aserrío: la vista previa
 * cotiza con los MISMOS argumentos que el cobro del servidor —el trato de
 * aserrío del cliente vigente el día de la corrida y los grupos de especies de
 * la planta—. El revisor de ADR-429 midió lo que cuesta que no: la pantalla
 * decía «no se carga nada» y el servidor cargó S/ 9 272,68.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/forestal/tarifa-aserrio", async (original) => {
  const real = await original<typeof import("@/lib/forestal/tarifa-aserrio")>();
  return { ...real, cotizarAserrio: vi.fn(real.cotizarAserrio) };
});

/* La base del cobro del servidor, con las filas como las guarda Prisma: así el
   test compara contra `ForestParteTarifaDB.vigente` —lo que lee `cobrarCorrida`—
   y no contra una copia de su regla. */
const { filasDb } = vi.hoisted(() => ({ filasDb: { lista: [] as unknown[] } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestParteTarifa: {
      findMany: vi.fn(async ({ where }: { where: { parteId: string; servicio?: string } }) =>
        (filasDb.lista as { parteId: string; servicio: string }[]).filter(
          (r) => r.parteId === where.parteId && (!where.servicio || r.servicio === where.servicio),
        ),
      ),
    },
  },
}));
vi.mock("@/lib/cache", () => ({ getOrSet: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/db/forest-especies.db", () => ({ ForestEspeciesDB: { get: vi.fn() } }));

import { cotizarAserrio } from "@/lib/forestal/tarifa-aserrio";
import { argumentosDelCobro, diaDeLaCorrida } from "@/lib/forestal/argumentos-del-cobro";
import { tarifaVigente, type GrupoEspecies, type TarifaCliente } from "@/lib/forestal/precio-cliente";
import { corridasPorEspecie, resumenEspecieTipo, type PaqueteDeclarable } from "@/lib/forestal/declarar-produccion";
import {
  faltaParaRegistrar,
  lineasDePrecio,
  TEXTOS_VACIOS,
  type PrecioDeEspecie,
} from "@/components/admin/forestal/hooks/declarar-produccion-pantalla";
import { useTratoDelCliente } from "@/components/admin/forestal/hooks/use-trato-del-cliente";
import { ForestParteTarifaDB } from "@/lib/db/forest-parte-tarifa.db";

const espia = vi.mocked(cotizarAserrio);

const GRUPOS: GrupoEspecies[] = [{ id: "g-duras", nombre: "Duras", claves: ["shihuahuaco"] }];
const tarifa = (parcial: Partial<TarifaCliente>): TarifaCliente => ({
  id: "t", parteId: "juan", servicio: "aserrio", vigenteDesde: "2026-09-01", basePt: null,
  grupos: [], especies: [], tipos: [], nota: null, ...parcial,
});
const TARIFAS: TarifaCliente[] = [
  tarifa({ id: "vieja", vigenteDesde: "2026-08-01", basePt: 0.4 }),
  tarifa({ id: "vigente", especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.6 }], grupos: [{ grupoId: "g-duras", precioPt: 1.2 }] }),
  tarifa({ id: "futura", vigenteDesde: "2026-10-01", basePt: 0.9 }),
  tarifa({ id: "venta", servicio: "venta", especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 3.2 }] }),
];

const paquete = (especie: string, codigo: string): PaqueteDeclarable => ({
  codigo, productType: "MADERA ASERRADA", tipo: "Comercial", presentacion: "PIEZAS", cantidad: 10,
  volumenM3: 0.2358, espesorCm: 5.08, anchoCm: 20.32, largoM: 3.05, medida: "2×8×10", especie, pieTablar: 100,
});
const PAQUETES = [paquete("Tornillo", "PQ-1"), paquete("Shihuahuaco", "PQ-2")];
const corridas = corridasPorEspecie(PAQUETES);
const resumen = resumenEspecieTipo(PAQUETES);
const FECHA = "2026-09-22";

const lineas = (over: Partial<Parameters<typeof lineasDePrecio>[0]> = {}) =>
  lineasDePrecio({
    especies: resumen.especies,
    corridas,
    servicio: "tercero",
    textos: TEXTOS_VACIOS,
    recordados: {},
    tarifa: null,
    tarifasCliente: TARIFAS,
    grupos: GRUPOS,
    fecha: FECHA,
    ...over,
  });

/* Con llaves: `mockClear()` devuelve el mock, y vitest toma una función devuelta por
   `beforeEach` como su limpieza — la llamaba sin argumentos. */
beforeEach(() => {
  espia.mockClear();
});

describe("la vista previa arma los MISMOS argumentos que el cobro", () => {
  it("cotizarAserrio recibe el trato de aserrío vigente ese día y los grupos: lo mismo que usa el servidor", () => {
    lineas();
    expect(espia).toHaveBeenCalled();
    /* Lo que arma el cobro del servidor para una corrida de ese día (su
       `entryDate` es un Date a medianoche UTC). */
    const delServidor = argumentosDelCobro({
      precioManualPt: null,
      tarifasCliente: TARIFAS,
      grupos: GRUPOS,
      fecha: new Date(`${FECHA}T00:00:00.000Z`),
    });
    expect(delServidor.cliente?.id).toBe("vigente");
    for (const [, , opts] of espia.mock.calls) {
      expect(opts?.cliente).toBe(delServidor.cliente);
      expect(opts?.cliente).toBe(tarifaVigente(TARIFAS, "aserrio", FECHA));
      expect(opts?.grupos).toBe(GRUPOS);
      expect(opts?.precioManualPt ?? null).toBe(delServidor.precioManualPt);
    }
  });

  it("con precio a mano viaja también el trato: el servidor lo recibe igual (y el precio a mano manda)", () => {
    const ls = lineas({ textos: { ...TEXTOS_VACIOS, tercero: { tornillo: "0.35" } } });
    const conMano = espia.mock.calls.find(([, , o]) => o?.precioManualPt === 0.35);
    expect(conMano?.[2]?.cliente?.id).toBe("vigente");
    expect(conMano?.[2]?.grupos).toBe(GRUPOS);
    expect(ls.find((l) => l.clave === "tornillo")).toMatchObject({ precio: 0.35, importe: 35, desde: "precio" });
  });

  it("sin precio a mano el importe sale del trato: Tornillo 0.60 y el grupo Duras 1.20", () => {
    const ls = lineas();
    expect(ls.find((l) => l.clave === "tornillo")).toMatchObject({ importe: 60, desde: "cliente", sugerido: { valor: 0.6, origen: "cliente" } });
    expect(ls.find((l) => l.clave === "shihuahuaco")).toMatchObject({ importe: 120, desde: "cliente" });
  });

  it("es la MISMA versión que elige el servidor al cobrar (`ForestParteTarifaDB.vigente`)", async () => {
    /* Las filas como las guarda la base: el detalle en JSON y la fecha a medianoche UTC. */
    filasDb.lista = TARIFAS.map((t, i) => ({
      id: t.id, parteId: t.parteId, servicio: t.servicio, vigenteDesde: new Date(`${t.vigenteDesde}T00:00:00.000Z`),
      basePt: t.basePt, detalle: { grupos: t.grupos, especies: t.especies, tipos: t.tipos }, nota: null,
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)),
    }));
    for (const dia of ["2026-08-15", "2026-09-22", "2026-10-03", "2026-07-01"]) {
      espia.mockClear();
      lineas({ fecha: dia });
      const delServidor = await ForestParteTarifaDB.vigente("t-qa", "juan", "aserrio", new Date(`${dia}T00:00:00.000Z`));
      const enPantalla = espia.mock.calls[0]?.[2]?.cliente ?? null;
      expect(enPantalla?.id ?? null).toBe(delServidor?.id ?? null);
    }
  });

  it("la fecha se lee como el día de la corrida, venga como ISO con hora o como Date", () => {
    expect(diaDeLaCorrida("2026-09-22T00:00:00.000Z")).toBe("2026-09-22");
    expect(diaDeLaCorrida(new Date("2026-09-22T00:00:00.000Z"))).toBe("2026-09-22");
    expect(argumentosDelCobro({ tarifasCliente: TARIFAS, fecha: "2026-10-03T00:00:00.000Z" }).cliente?.id).toBe("futura");
  });

  it("madera propia: el precio de venta pactado se sugiere, el último usado queda atrás", () => {
    const ls = lineas({ servicio: "propia", recordados: { tornillo: 2.9 } });
    expect(ls.find((l) => l.clave === "tornillo")?.sugerido).toEqual({ valor: 3.2, origen: "cliente" });
    /* El trato de venta no cubre el shihuahuaco: sin último usado, no se sugiere nada. */
    expect(ls.find((l) => l.clave === "shihuahuaco")?.sugerido).toBeNull();
    expect(lineas({ servicio: "propia", recordados: { tornillo: 2.9 }, tarifasCliente: [] }).find((l) => l.clave === "tornillo")?.sugerido).toEqual({ valor: 2.9, origen: "ultimo" });
  });
});

describe("no se registra sin saber qué dice el trato del cliente", () => {
  const linea = (precio: number | null): PrecioDeEspecie => ({
    clave: "tornillo", especie: "Tornillo", texto: precio == null ? "" : String(precio), invalido: false, precio,
    sugerido: null, importe: null, desde: precio == null ? null : "precio",
  });
  const base = { corridas, servicio: "tercero" as const, parteId: "juan", fechaValida: true, tarifa: { cargando: false, error: null } };

  it("mientras el trato carga, no se registra", () => {
    expect(faltaParaRegistrar({ ...base, lineas: [linea(null)], trato: { cargando: true, error: null, cliente: "Juan" } })).toMatch(/Leyendo el precio pactado con Juan/);
  });
  it("si el trato falló, pide el precio a mano", () => {
    expect(faltaParaRegistrar({ ...base, lineas: [linea(null)], trato: { cargando: false, error: "500", cliente: "Juan" } })).toMatch(/precio a mano/);
  });
  it("con los grupos leyéndose (y un trato que cobra por grupo) tampoco", () => {
    expect(faltaParaRegistrar({ ...base, lineas: [linea(null)], trato: { cargando: false, error: null }, grupos: { cargando: true } })).toMatch(/grupos de especies/);
  });
  it("con precio a mano en todas, el trato no importa", () => {
    expect(faltaParaRegistrar({ ...base, lineas: [linea(0.35)], trato: { cargando: true, error: null } })).toBeNull();
  });
  it("madera propia no espera el trato: sólo sugiere", () => {
    expect(faltaParaRegistrar({ ...base, servicio: "propia", lineas: [linea(null)], trato: { cargando: true, error: null } })).toBeNull();
  });
});

describe("useTratoDelCliente: «todavía no leí» es leyendo", () => {
  let respuestas: Record<string, TarifaCliente[]> = {};
  beforeEach(() => {
    respuestas = { juan: TARIFAS, pedro: [tarifa({ id: "p", parteId: "pedro", basePt: 0.3 })] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = new URL(url, "http://x").searchParams.get("parteId") ?? "";
        return new Response(JSON.stringify({ tarifas: respuestas[id] ?? [] }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("el primer render con un cliente elegido ya dice «leyendo» (no «sin trato»)", async () => {
    const { result } = renderHook(({ id }) => useTratoDelCliente(id), { initialProps: { id: "juan" as string | null } });
    expect(result.current.cargando).toBe(true);
    expect(result.current.tarifas).toEqual([]);
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.tarifas.map((t) => t.id)).toEqual(["vieja", "vigente", "futura", "venta"]);
  });

  it("al cambiar de cliente nunca muestra el trato del anterior", async () => {
    const { result, rerender } = renderHook(({ id }) => useTratoDelCliente(id), { initialProps: { id: "juan" as string | null } });
    await waitFor(() => expect(result.current.cargando).toBe(false));
    rerender({ id: "pedro" });
    expect(result.current.cargando).toBe(true);
    expect(result.current.tarifas.some((t) => t.parteId === "juan")).toBe(false);
    await waitFor(() => expect(result.current.tarifas.map((t) => t.id)).toEqual(["p"]));
  });
});
