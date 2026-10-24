/**
 * loth-arbol — el cruce censo ↔ tala ↔ trozado por ÁRBOL.
 *
 * Lo que se blinda: un censo inflado es una autorización inflada — el fraude que
 * fiscaliza OSINFOR. Si la precisión del censo se calcula mal, el sistema
 * bendice un desvío que debería estar señalado en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  construirFichasArbol,
  fichaMatches,
  fichasToCsv,
  resumirArboles,
  type ArbolCensoInput,
} from "@/lib/forestal/loth-arbol";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

const HOY = new Date("2026-07-22T12:00:00Z");

const censo = (treeCode: string, vol: number, dapCm = 80, especie = "Tornillo"): ArbolCensoInput => ({
  treeCode,
  speciesCommon: especie,
  dapM: dapCm / 100,
  volumenEstimadoM3: vol,
  estado: "en_pie",
});

let seq = 0;
const linea = (p: Partial<LothEntryDTO>): LothEntryDTO =>
  ({
    id: `e${seq++}`,
    section: "tala",
    lineNo: seq,
    entryDate: "2026-07-01",
    treeCode: null,
    trozaCode: null,
    despachoCode: null,
    isRama: false,
    speciesCommon: "Tornillo",
    speciesScientific: null,
    cites: false,
    diamMayorM: null,
    diamMenorM: null,
    lengthM: null,
    volumeM3: null,
    productType: null,
    quantity: null,
    unit: null,
    pieces: null,
    gtfNumber: null,
    discarded: false,
    consumoInterno: false,
    observations: null,
    status: "registrado",
    annulledReason: null,
    gpsLat: null,
    gpsLng: null,
    photoUrl: null,
    ...p,
  }) as LothEntryDTO;

describe("cadena por árbol", () => {
  it("cruza censo, tala, trozado y movilización", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 5)],
      entries: [
        linea({ section: "tala", treeCode: "T1", volumeM3: "4.8" }),
        linea({ section: "trozado", treeCode: "T1", trozaCode: "T1-A", volumeM3: "2.5" }),
        linea({ section: "trozado", treeCode: "T1", trozaCode: "T1-B", volumeM3: "1.8" }),
        linea({ section: "despacho_troza", trozaCode: "T1-A", gtfNumber: "GTF-1" }),
      ],
      hoy: HOY,
    });
    const f = fichas[0];
    expect(f.volumenCensoM3).toBe(5);
    expect(f.volumenTaladoM3).toBe(4.8);
    expect(f.volumenTrozadoM3).toBe(4.3);
    expect(f.volumenMovilizadoM3).toBe(2.5); // solo la troza despachada
    expect(f.trozas).toEqual(["T1-A", "T1-B"]);
    expect(f.precisionCensoPct).toBe(96); // 4.8 / 5
    expect(f.rendimientoTrozadoPct).toBeCloseTo(89.6, 1);
    expect(f.avanceMovilizacionPct).toBeCloseTo(58.1, 1);
  });

  it("el consumo interno también cuenta como movilizado", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 5)],
      entries: [
        linea({ section: "tala", treeCode: "T1", volumeM3: "4" }),
        linea({ section: "trozado", treeCode: "T1", trozaCode: "T1-A", volumeM3: "4" }),
        linea({ section: "consumo_troza", trozaCode: "T1-A" }),
      ],
      hoy: HOY,
    });
    expect(fichas[0].volumenMovilizadoM3).toBe(4);
    expect(fichas[0].flags).not.toContain("sin_movilizar");
  });

  it("ignora las líneas anuladas", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 5)],
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "4.8", status: "anulado" })],
      hoy: HOY,
    });
    expect(fichas[0].enPie).toBe(true);
    expect(fichas[0].volumenTaladoM3).toBeNull();
  });
});

describe("banderas de fiscalización", () => {
  it("ROJO: una tala cuyo código no está en el censo", () => {
    const fichas = construirFichasArbol({
      censo: [],
      entries: [linea({ section: "tala", treeCode: "X9", volumeM3: "4" })],
      hoy: HOY,
    });
    expect(fichas[0].flags).toContain("no_censado");
  });

  it("marca el censo SOBREESTIMADO (dio mucho menos de lo prometido)", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 10)],
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "6" })], // 60%
      hoy: HOY,
    });
    expect(fichas[0].precisionCensoPct).toBe(60);
    expect(fichas[0].flags).toContain("censo_sobreestimado");
  });

  it("marca el censo SUBESTIMADO (dio mucho más)", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 4)],
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "6" })], // 150%
      hoy: HOY,
    });
    expect(fichas[0].flags).toContain("censo_subestimado");
  });

  it("no marca desvío dentro de la tolerancia", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 10)],
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "9" })], // 90%
      hoy: HOY,
    });
    expect(fichas[0].flags).not.toContain("censo_sobreestimado");
    expect(fichas[0].flags).not.toContain("censo_subestimado");
  });

  it("avisa del árbol tumbado hace más de 30 días sin trozar", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 5)],
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "4", entryDate: "2026-05-01" })],
      hoy: HOY,
    });
    expect(fichas[0].diasDesdeTala).toBeGreaterThan(30);
    expect(fichas[0].flags).toContain("sin_trozar");
  });

  it("no avisa si se tumbó hace pocos días", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 5)],
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "4", entryDate: "2026-07-20" })],
      hoy: HOY,
    });
    expect(fichas[0].flags).not.toContain("sin_trozar");
  });

  it("ROJO: talado por debajo del DMC de su especie", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 2, 45)], // 45 cm, DMC tornillo = 61
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "1.8" })],
      hoy: HOY,
    });
    expect(fichas[0].flags).toContain("bajo_dmc");
  });

  it("respeta el DMC que fijó el plan", () => {
    const fichas = construirFichasArbol({
      censo: [censo("T1", 2, 45)],
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "1.8" })],
      dmcOverrides: { tornillo: 41 },
      hoy: HOY,
    });
    expect(fichas[0].flags).not.toContain("bajo_dmc");
  });

  it("ordena primero lo que hay que mirar", () => {
    const fichas = construirFichasArbol({
      censo: [censo("OK", 5), censo("MAL", 10)],
      entries: [
        linea({ section: "tala", treeCode: "OK", volumeM3: "5" }),
        linea({ section: "tala", treeCode: "MAL", volumeM3: "2" }),
        linea({ section: "trozado", treeCode: "OK", trozaCode: "OK-A", volumeM3: "5" }),
        linea({ section: "despacho_troza", trozaCode: "OK-A" }),
      ],
      hoy: HOY,
    });
    expect(fichas[0].treeCode).toBe("MAL"); // el desviado va primero
  });
});

describe("resumen y salida", () => {
  const fichas = () =>
    construirFichasArbol({
      censo: [censo("T1", 10), censo("T2", 5), censo("T3", 8)],
      entries: [
        linea({ section: "tala", treeCode: "T1", volumeM3: "9" }),
        linea({ section: "tala", treeCode: "T2", volumeM3: "6" }),
        linea({ section: "trozado", treeCode: "T1", trozaCode: "T1-A", volumeM3: "7.5" }),
      ],
      hoy: HOY,
    });

  it("promedia la precisión del censo de forma PONDERADA por volumen", () => {
    const r = resumirArboles(fichas());
    // (9 + 6) / (10 + 5) = 100% — T3 sigue en pie y no entra al promedio.
    expect(r.precisionCensoPct).toBe(100);
    expect(r.talados).toBe(2);
    expect(r.enPie).toBe(1);
  });

  it("calcula el rendimiento de trozado del conjunto", () => {
    const r = resumirArboles(fichas());
    expect(r.volumenTaladoM3).toBe(15);
    expect(r.volumenTrozadoM3).toBe(7.5);
    expect(r.rendimientoTrozadoPct).toBe(50);
  });

  it("cuenta solo las banderas que importan, no las informativas", () => {
    // En este set nada se desvía más del 25%: "en pie" y "sin movilizar" son
    // informativas y NO deben inflar el contador.
    expect(resumirArboles(fichas()).conBandera).toBe(0);

    const conDesvio = construirFichasArbol({
      censo: [censo("T1", 10)],
      entries: [linea({ section: "tala", treeCode: "T1", volumeM3: "3" })], // 30%
      hoy: HOY,
    });
    expect(resumirArboles(conDesvio).conBandera).toBe(1);
  });

  it("exporta CSV con encabezado y una fila por árbol", () => {
    const csv = fichasToCsv(fichas());
    const filas = csv.split("\n");
    expect(filas[0]).toContain("precision_censo_pct");
    expect(filas).toHaveLength(4);
  });

  it("el buscador encuentra por código, especie y troza", () => {
    const f = fichas().find((x) => x.treeCode === "T1")!;
    expect(fichaMatches(f, "t1")).toBe(true);
    expect(fichaMatches(f, "tornillo")).toBe(true);
    expect(fichaMatches(f, "T1-A")).toBe(true);
    expect(fichaMatches(f, "caoba")).toBe(false);
  });

  it("sin datos no rompe", () => {
    const r = resumirArboles(construirFichasArbol({ censo: [], entries: [], hoy: HOY }));
    expect(r.arboles).toBe(0);
    expect(r.precisionCensoPct).toBeNull();
  });
});
