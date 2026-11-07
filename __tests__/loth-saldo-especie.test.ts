import { describe, expect, it } from "vitest";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  ordenarSaldo,
  saldoDeCupos,
  saldoPorEspecie,
  type SaldoEspecie,
  type TrozaSaldo,
} from "@/lib/forestal/loth-saldo-especie";
import { cupoPorEspecie, type ArbolCensoCupo } from "@/lib/forestal/loth-cupo-especie";

/*
 * Números de Blas medidos el 30-09. Dos planes vivos con el MISMO libro:
 * - P_TOR: Tornillo autorizado 320 m³, 2 árboles censados;
 * - P_GRANDE: 0 especies autorizadas → todo «del censo».
 */
const P_TOR = "cmrtxh5bp-plan-tornillo";
const P_GRANDE = "cmuamvvnu-plan-grande";

let n = 0;
const linea = (p: Partial<LothEntryDTO>): LothEntryDTO =>
  ({
    id: `e${++n}`,
    lineNo: n,
    entryDate: "2026-09-20",
    treeCode: null,
    trozaCode: null,
    speciesCommon: null,
    volumeM3: null,
    gtfNumber: null,
    discarded: false,
    status: "registrado",
    ...p,
  }) as LothEntryDTO;

const arbol = (treeCode: string, speciesCommon: string, v: number): ArbolCensoCupo => ({ treeCode, speciesCommon, volumenEstimadoM3: v });

const CENSO_TOR = [arbol("85-TOR", "Tornillo", 2.9), arbol("86-TOR", "Tornillo", 3.3)];
const CENSO_GRANDE = [
  arbol("111", "Copaiba", 120),
  arbol("113", "Sapotillo", 70),
  arbol("114", "Lupuna", 90),
  arbol("100", "Mashonaste", 40),
  arbol("501", "Catahua", 60),
  arbol("601", "Aguanomasha", 50),
];

const LIBRO: LothEntryDTO[] = [
  // plan Tornillo
  linea({ section: "tala", treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: "3.5640", planId: P_TOR }),
  linea({ section: "tala", treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: "5.9730", planId: P_TOR }),
  linea({ section: "trozado", treeCode: "85-TOR", trozaCode: "001-TOR-A", speciesCommon: "Tornillo", volumeM3: "2.8500", planId: P_TOR }),
  linea({ section: "trozado", treeCode: "86-TOR", trozaCode: "002-TOR-A", speciesCommon: "Tornillo", volumeM3: "1.5150", planId: P_TOR }),
  linea({ section: "despacho_troza", treeCode: "85-TOR", trozaCode: "001-TOR-A", speciesCommon: "Tornillo", gtfNumber: "001-0045678", planId: P_TOR }),
  linea({ section: "consumo_troza", treeCode: "86-TOR", trozaCode: "002-TOR-A", speciesCommon: "Tornillo", planId: P_TOR }),
  // plan grande
  linea({ section: "tala", treeCode: "111", speciesCommon: "Copaiba", volumeM3: "10.37", planId: P_GRANDE }),
  linea({ section: "tala", treeCode: "113", speciesCommon: "Sapotillo", volumeM3: "4.142", planId: P_GRANDE }),
  linea({ section: "tala", treeCode: "114", speciesCommon: "Lupuna", volumeM3: "15.59", planId: P_GRANDE }),
  linea({ section: "tala", treeCode: "100", speciesCommon: "Mashonaste", volumeM3: "2.84", planId: P_GRANDE }),
  linea({ section: "trozado", treeCode: "111", trozaCode: "T-111", speciesCommon: "Copaiba", volumeM3: "4.951", planId: P_GRANDE }),
  linea({ section: "despacho_troza", treeCode: "111", trozaCode: "T-111", speciesCommon: "Copaiba", gtfNumber: "001-0045999", planId: P_GRANDE }),
  linea({ section: "trozado", treeCode: "113", trozaCode: "T-113", speciesCommon: "Sapotillo", volumeM3: "1.659", planId: P_GRANDE }),
  linea({ section: "despacho_troza", treeCode: "113", trozaCode: "T-113", speciesCommon: "Sapotillo", gtfNumber: "001-0045999", planId: P_GRANDE }),
];

const AUTORIZADAS_TOR = [{ speciesCommon: "Tornillo (Cedrelinga catenaeformis)", volumenAutorizadoM3: 320, arbolesAutorizados: 45 }];

const fila = (filas: readonly SaldoEspecie[], especie: string) => {
  const f = filas.find((x) => x.especie === especie);
  if (!f) throw new Error(`falta ${especie}`);
  return f;
};

describe("saldoPorEspecie — plan Tornillo (autorizado)", () => {
  const { filas, totales, fuera } = saldoPorEspecie({ planId: P_TOR, censo: CENSO_TOR, entries: LIBRO, autorizadas: AUTORIZADAS_TOR });
  const tor = fila(filas, "Tornillo");

  it("cupo autorizado 320, talado 9,537, saldo por talar 310,463", () => {
    expect(tor.fuente).toBe("autorizado");
    expect(tor.cupoM3).toBe(320);
    expect(tor.taladoM3).toBe(9.537);
    expect(tor.saldoPorTalarM3).toBe(310.463);
    expect(tor.veredicto).toBe("ok");
  });

  it("trozado 4,365 = 2,850 despachada + 1,515 consumida; patio 0", () => {
    expect(tor.trozadoM3).toBe(4.365);
    expect(tor.despachadoM3).toBe(2.85);
    expect(tor.consumidoM3).toBe(1.515);
    expect(tor.enPatioM3).toBe(0);
    expect(tor.trozas).toBe(2);
  });

  it("no le entran las talas ni trozas del otro plan", () => {
    expect(filas).toHaveLength(1);
    expect(fuera).toEqual({ n: 0, m3: 0 });
    expect(totales.taladoM3).toBe(9.537);
  });
});

describe("saldoPorEspecie — plan grande (sin autorizadas → del censo)", () => {
  const { filas, totales } = saldoPorEspecie({ planId: P_GRANDE, censo: CENSO_GRANDE, entries: LIBRO, autorizadas: [] });

  it("todas las especies miden contra el censo", () => {
    expect(filas.every((f) => f.fuente === "censo")).toBe(true);
    expect(fila(filas, "Copaiba").cupoM3).toBe(120);
  });

  it("Copaiba 111: talado 10,37, trozado 4,951 despachado, saldo 109,63", () => {
    const c = fila(filas, "Copaiba");
    expect(c.taladoM3).toBe(10.37);
    expect(c.trozadoM3).toBe(4.951);
    expect(c.despachadoM3).toBe(4.951);
    expect(c.saldoPorTalarM3).toBe(109.63);
  });

  it("Sapotillo 113: talado 4,142, trozado 1,659 despachado", () => {
    const s = fila(filas, "Sapotillo");
    expect(s.taladoM3).toBe(4.142);
    expect(s.despachadoM3).toBe(1.659);
    expect(s.enPatioM3).toBe(0);
  });

  it("Lupuna 114 y Mashonaste 100: talados sin trozar", () => {
    for (const [nombre, m3] of [["Lupuna", 15.59], ["Mashonaste", 2.84]] as const) {
      const f = fila(filas, nombre);
      expect(f.taladoM3).toBe(m3);
      expect(f.trozadoM3).toBe(0);
      expect(f.trozas).toBe(0);
      expect(f.sinTalar).toBe(false);
    }
  });

  it("Catahua y Aguanomasha quedan como «sin talar» con su cupo intacto", () => {
    expect(filas.filter((f) => f.sinTalar).map((f) => f.especie).sort()).toEqual(["Aguanomasha", "Catahua"]);
    expect(totales.sinTalar).toBe(2);
    expect(totales.cupoSinTalarM3).toBe(110);
  });

  it("totales: talado 32,942 y trozado 6,61; no entra nada del plan Tornillo", () => {
    expect(totales.taladoM3).toBe(32.942);
    expect(totales.trozadoM3).toBe(6.61);
    expect(totales.despachadoM3).toBe(6.61);
    expect(totales.cupoM3).toBe(430);
    expect(totales.saldoPorTalarM3).toBe(397.058);
    expect(totales.excesoM3).toBe(0);
  });
});

describe("saldoDeCupos — casos de borde", () => {
  const cupos = cupoPorEspecie({
    censo: [arbol("1", "Tornillo", 6.2), arbol("2", "Tornillo", 0), arbol("3", "Cedro", 10)],
    talas: [
      { treeCode: "1", speciesCommon: "Tornillo", volumeM3: 9.537 },
      { treeCode: "3", speciesCommon: "Cedro", volumeM3: 2 },
    ],
  });
  const troza = (p: Partial<TrozaSaldo>): TrozaSaldo => ({ code: "T", treeCode: "1", especie: "Tornillo", volumenM3: 1, estado: "disponible", ...p });

  it("excedida: saldo negativo, el total no le presta a otra especie", () => {
    const s = saldoDeCupos(cupos, []);
    expect(fila(s.filas, "Tornillo").saldoPorTalarM3).toBe(-3.337);
    expect(s.totales.excesoM3).toBe(3.337);
    expect(s.totales.saldoPorTalarM3).toBe(8);
    expect(ordenarSaldo(s.filas)[0]?.especie).toBe("Tornillo");
  });

  it("el embudo cierra: trozado = despachado + consumido + descartado + patio", () => {
    const s = saldoDeCupos(cupos, [
      troza({ code: "A", volumenM3: 1, estado: "despachada" }),
      troza({ code: "B", volumenM3: 2, estado: "consumida" }),
      troza({ code: "C", volumenM3: 0.5, estado: "descartada" }),
      troza({ code: "D", volumenM3: 4, estado: "disponible" }),
    ]);
    const f = fila(s.filas, "Tornillo");
    expect(f.trozadoM3).toBe(7.5);
    expect(f.despachadoM3 + f.consumidoM3 + f.descartadoM3 + f.enPatioM3).toBe(f.trozadoM3);
    expect(f.enPatioM3).toBe(4);
  });

  it("troza sin volumen cuenta como troza, no como 0 m³ silencioso", () => {
    const f = fila(saldoDeCupos(cupos, [troza({ volumenM3: null })]).filas, "Tornillo");
    expect(f.trozas).toBe(1);
    expect(f.trozasSinVolumen).toBe(1);
    expect(f.trozadoM3).toBe(0);
  });

  it("troza de un árbol que el censo no tiene va a «fuera», no a una especie", () => {
    const s = saldoDeCupos(cupos, [troza({ treeCode: "999", volumenM3: 3 })], new Set(["1", "2", "3"]));
    expect(s.fuera).toEqual({ n: 1, m3: 3 });
    expect(fila(s.filas, "Tornillo").trozadoM3).toBe(0);
  });

  it("fantasma (sin trozado) se avisa aparte y no suma", () => {
    const s = saldoDeCupos(cupos, [troza({ estado: "fantasma", volumenM3: null })]);
    expect(s.sinTrozado).toBe(1);
    expect(s.totales.trozadoM3).toBe(0);
  });

  it("especie talada sin cupo: saldo null y no suma al saldo total", () => {
    const sin = cupoPorEspecie({ censo: [], talas: [{ treeCode: null, speciesCommon: "Lupuna", volumeM3: 3 }] });
    const s = saldoDeCupos(sin, []);
    expect(s.filas[0]?.saldoPorTalarM3).toBeNull();
    expect(s.totales.sinCupo).toBe(1);
    expect(s.totales.saldoPorTalarM3).toBe(0);
  });
});
