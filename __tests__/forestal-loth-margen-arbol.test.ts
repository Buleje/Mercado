/**
 * loth-margen-arbol — el margen bajado al árbol. Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { buildTraceOperations } from "@/lib/forestal/loth-trace";
import { margenPorArbol, resumirMargenArbol } from "@/lib/forestal/loth-margen-arbol";
import type { CosteoRow } from "@/lib/forestal/loth-constants";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

let seq = 0;
const entry = (p: Partial<LothEntryDTO>): LothEntryDTO => ({
  id: `e${++seq}`, section: "tala", lineNo: seq, entryDate: "2026-07-10",
  treeCode: null, trozaCode: null, despachoCode: null, isRama: false,
  speciesCommon: "Tornillo", speciesScientific: null, cites: false,
  diamMayorM: null, diamMenorM: null, lengthM: null, volumeM3: null,
  productType: null, quantity: null, unit: null, pieces: null, gtfNumber: null,
  discarded: false, consumoInterno: false, observations: null,
  status: "registrado", annulledReason: null, gpsLat: null, gpsLng: null, photoUrl: null,
  ...p,
});

// El costeo declara la especie como en la resolución; el libro, el común.
const COSTEO: CosteoRow[] = [
  {
    species: "Tornillo (Cedrelinga catenaeformis)", cites: false, movilizadoM3: 0,
    precioVentaM3: 180, costoTotalM3: 30, margenM3: 150, margenPct: 83.3,
    ingreso: 0, costo: 0, margen: 0,
    desglose: { venM3: 12.5, extraccionM3: 10, transformacionM3: 5, fleteM3: 2.5 },
  },
];

const libro: LothEntryDTO[] = [
  // Árbol A: tumbó 10, trozó 8, despachó 5 → movilizó 5
  entry({ section: "tala", treeCode: "A", volumeM3: "10" }),
  entry({ section: "trozado", treeCode: "A", trozaCode: "A-1", volumeM3: "5" }),
  entry({ section: "trozado", treeCode: "A", trozaCode: "A-2", volumeM3: "3" }),
  entry({ section: "despacho_troza", trozaCode: "A-1", gtfNumber: "G-1" }),
  // Árbol B: tumbó 6, trozó 4, nada salió → plata quieta
  entry({ section: "tala", treeCode: "B", volumeM3: "6" }),
  entry({ section: "trozado", treeCode: "B", trozaCode: "B-1", volumeM3: "4" }),
];

describe("margenPorArbol", () => {
  it("valoriza SÓLO lo que salió del patio", () => {
    const [a, b] = margenPorArbol(buildTraceOperations(libro), COSTEO);
    expect(a.tree).toBe("A");
    expect(a.movilizadoM3).toBe(5); // la troza A-2 quedó en patio: no genera ingreso
    expect(a.ingreso).toBe(900); // 180 × 5
    expect(a.costo).toBe(150); // 30 × 5
    expect(a.margen).toBe(750);
    expect(a.margenPct).toBeCloseTo(83.3, 1);
    expect(b.tree).toBe("B");
    expect(b.movilizadoM3).toBe(0);
    expect(b.margen).toBe(0);
  });

  it("cruza la especie por clave: el nombre de la resolución no rompe el costeo", () => {
    const [a] = margenPorArbol(buildTraceOperations(libro), COSTEO);
    expect(a.sinPrecio).toBe(false);
    expect(a.precioM3).toBe(180);
  });

  it("una especie sin costeo se marca en vez de valorizarse en cero callado", () => {
    const otros = [
      entry({ section: "tala", treeCode: "C", speciesCommon: "Cumala", volumeM3: "5" }),
      entry({ section: "trozado", treeCode: "C", speciesCommon: "Cumala", trozaCode: "C-1", volumeM3: "4" }),
      entry({ section: "despacho_troza", trozaCode: "C-1", gtfNumber: "G-9" }),
    ];
    const [c] = margenPorArbol(buildTraceOperations(otros), COSTEO);
    expect(c.sinPrecio).toBe(true);
    expect(c.ingreso).toBe(0);
  });


  it("la troza consumida NO suma ingreso: se transformó, no se vendió", () => {
    // Si el aserrío contara como venta, el total por árbol dejaría de coincidir
    // con el total por especie —y serían dos verdades del mismo hecho.
    const conConsumo = [
      entry({ section: "tala", treeCode: "D", volumeM3: "10" }),
      entry({ section: "trozado", treeCode: "D", trozaCode: "D-1", volumeM3: "6" }),
      entry({ section: "consumo_troza", trozaCode: "D-1", volumeM3: "6" }),
    ];
    const [d] = margenPorArbol(buildTraceOperations(conConsumo), COSTEO);
    expect(d.movilizadoM3).toBe(0);
    expect(d.consumidoM3).toBe(6);
    expect(d.ingreso).toBe(0);
  });

  it("ordena por margen: arriba el que más aportó", () => {
    const filas = margenPorArbol(buildTraceOperations(libro), COSTEO);
    expect(filas.map((f) => f.tree)).toEqual(["A", "B"]);
  });
});

describe("resumirMargenArbol", () => {
  it("separa lo que rindió de la plata que quedó quieta en el patio", () => {
    const r = resumirMargenArbol(margenPorArbol(buildTraceOperations(libro), COSTEO));
    expect(r.arboles).toBe(2);
    expect(r.conMovimiento).toBe(1);
    expect(r.margen).toBe(750);
    expect(r.mejor?.tree).toBe("A");
    expect(r.peor).toBeNull(); // con un solo árbol movido no hay «peor»
    expect(r.sinMovilizar).toBe(1);
    expect(r.sinMovilizarM3).toBe(6); // el árbol B tumbado y sin salir
  });
});
