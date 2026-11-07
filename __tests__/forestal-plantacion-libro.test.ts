/**
 * Actualización del registro de plantación con lo del Libro TH (ADR-459, ronda 3).
 *
 * Lo que no puede pasar: elegir otra plantación porque el código se escribió con
 * otros ceros o separadores, adivinar entre dos que tienen el mismo código,
 * pisar una producción que la persona ya escribió, poner m³ donde dice «kg», y
 * repartir solos entre bloques lo que el libro no sabe de qué bloque salió.
 */
import { describe, expect, it } from "vitest";
import {
  agregarDelLibro,
  aplicarLlenado,
  claveCodigoPlantacion,
  especieNuevaDelLibro,
  especiesDelLibro,
  esUnidadM3,
  etiquetaPlanDelLibro,
  mismoCodigoPlantacion,
  planDeLlenado,
  sugerirPlanDelTramite,
  type EspecieDelLibro,
  type PlanDelLibro,
} from "@/lib/forestal/plantacion-libro";
import type { BloqueInput } from "@/lib/forestal/plantacion-tramite";

const plan = (over: Partial<PlanDelLibro>): PlanDelLibro => ({
  id: "p1",
  planType: "PLANTACION",
  planNumber: "19-SEC/REG-PLT-2025-096",
  tituloHabilitante: null,
  titularName: "Agroforestal QA",
  ...over,
});

describe("qué plantación del libro es la del trámite", () => {
  it("el código se compara tramo a tramo: otros ceros y separadores son el mismo papel", () => {
    expect(mismoCodigoPlantacion("19-SEC/REG-PLT-2025-096", "019 sec-reg-plt-2025-96")).toBe(true);
    expect(mismoCodigoPlantacion("19-SEC/REG-PLT-2025-096", "19-SEC/REG-PLT-2025-097")).toBe(false);
    expect(mismoCodigoPlantacion("", "")).toBe(false);
    expect(claveCodigoPlantacion("  ")).toBeNull();
    expect(claveCodigoPlantacion("Plantación QA-459")).toBe("PLANTACION-QA-459");
  });

  it("propone la que coincide por código, por N° del plan o por título habilitante", () => {
    const planes = [plan({ id: "a", planNumber: "PLT-001" }), plan({ id: "b", planNumber: "X", tituloHabilitante: "19-SEC/REG-PLT-2025-096" })];
    expect(sugerirPlanDelTramite("019-SEC/REG-PLT-2025-96", planes)).toEqual({ planId: "b", motivo: "codigo" });
  });

  it("dos plantaciones con el mismo código: se elige, nunca la primera", () => {
    const planes = [plan({ id: "a" }), plan({ id: "b" })];
    expect(sugerirPlanDelTramite("19-SEC/REG-PLT-2025-096", planes)).toEqual({ planId: null, motivo: "ambigua" });
  });

  it("trámite SIN código y una sola plantación: ésa, diciendo que es la única", () => {
    const planes = [plan({ id: "a", planNumber: "PLT-001" }), plan({ id: "po", planType: "PO", planNumber: "PO 12" })];
    expect(sugerirPlanDelTramite(null, planes)).toEqual({ planId: "a", motivo: "unica" });
  });

  it("trámite CON código que no coincide: ninguna (no se llena con lo talado de OTRA plantación)", () => {
    const planes = [plan({ id: "a", planNumber: "19-SEC/REG-PLT-2025-096" })];
    expect(sugerirPlanDelTramite("OTRO-1", planes)).toEqual({ planId: null, motivo: "ninguna" });
    expect(sugerirPlanDelTramite("19-SEC/REG-PLT-2025-097", planes)).toEqual({ planId: null, motivo: "ninguna" });
  });

  it("un PO no es candidato; un plan con «REG-PLT» en el código sí, aunque diga PO", () => {
    const planes = [plan({ id: "po", planType: "PO", planNumber: "PO 12" }), plan({ id: "reg", planType: "PO", planNumber: "19-SEC/REG-PLT-2025-096" })];
    expect(sugerirPlanDelTramite(null, planes)).toEqual({ planId: "reg", motivo: "unica" });
    expect(sugerirPlanDelTramite(null, [plan({ id: "po", planType: "PO", planNumber: "PO 12" })])).toEqual({ planId: null, motivo: "ninguna" });
  });

  it("la etiqueta dice código, titular y nombre corto", () => {
    expect(etiquetaPlanDelLibro(plan({ alias: "Bolainal" }))).toBe("19-SEC/REG-PLT-2025-096 · Agroforestal QA (Bolainal)");
    expect(etiquetaPlanDelLibro(plan({ planNumber: null, titularName: "" }))).toBe("Sin código");
  });
});

const bolainaLibro: EspecieDelLibro = {
  comun: "Bolaina",
  cientifico: "Guazuma crinita",
  cites: false,
  anioInstalacion: 2018,
  arboles: 400,
  registrada: true,
  registradoM3: 120,
  taladoM3: 2.553,
  despachadoM3: 1.2,
  enPieM3: 117.447,
};
const capironaLibro: EspecieDelLibro = { ...bolainaLibro, comun: "Capirona", cientifico: "Calycophyllum spruceanum", registradoM3: 80, taladoM3: 0, despachadoM3: 0, enPieM3: 80 };

const bloque = (numero: number, especies: BloqueInput["especies"]): BloqueInput => ({ numero, vertices: [], especies });

describe("las especies del libro", () => {
  it("cada especie del registro con su cascada, y las del libro que no están registradas", () => {
    const libro = especiesDelLibro(
      [
        { speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita", cites: false, volumenAutorizadoM3: "120", arbolesAutorizados: 400, anioInstalacion: 2018 },
        { speciesCommon: "Tornillo (Cedrelinga catenaeformis)", speciesScientific: null, volumenAutorizadoM3: "50" },
      ],
      {
        rows: [
          { species: "Bolaina", cites: false, autorizado: 120, talado: 2.553, trozado: 2, movilizado: 1.2, movilizadoTroza: 1.2, consumido: 0 },
          { species: "Tornillo (Cedrelinga catenaeformis)", cites: false, autorizado: 50, talado: 0, trozado: 0, movilizado: 0, consumido: 0 },
        ],
        sinRegistrar: [{ species: "Copaiba", taladoM3: 4.951, trozadoM3: 0, movilizadoM3: 0 }],
      },
    );
    expect(libro.map((l) => [l.comun, l.cientifico, l.registrada, l.taladoM3, l.enPieM3])).toEqual([
      ["Bolaina", "Guazuma crinita", true, 2.553, 117.447],
      ["Tornillo", "Cedrelinga catenaeformis", true, 0, 50],
      ["Copaiba", null, false, 4.951, null],
    ]);
    expect(libro[0].despachadoM3).toBe(1.2);
  });

  it("sin el saldo, sale lo registrado con talado 0 (no un error)", () => {
    const [b] = especiesDelLibro([{ speciesCommon: "Bolaina", volumenAutorizadoM3: 120 }], null);
    expect([b.registradoM3, b.taladoM3, b.enPieM3]).toEqual([120, 0, 120]);
  });
});

describe("qué se llena en el trámite", () => {
  it("una especie vacía en un bloque se completa con lo TALADO, en m³", () => {
    const bloques = [bloque(1, [{ nombreComun: "Bolaina" }])];
    const plan1 = planDeLlenado(bloques, [bolainaLibro]);
    expect(plan1.destinos[0].destino).toEqual({ tipo: "completar", bloque: 1, m3: 2.553 });
    expect(plan1.aCompletar).toBe(1);
    const nuevos = aplicarLlenado(bloques, [bolainaLibro]);
    expect(nuevos[0].especies[0]).toMatchObject({ produccionCantidad: 2.553, produccionUnidad: "m³" });
    // No muta lo que recibió.
    expect(bloques[0].especies[0].produccionCantidad).toBeUndefined();
  });

  it("se reconoce por el científico cuando el común se escribe distinto (la misma regla que T6/T7)", () => {
    const bloques = [bloque(1, [{ nombreComun: "Bolaina blanca", nombreCientifico: "Guazuma crinita" }])];
    expect(planDeLlenado(bloques, [bolainaLibro]).destinos[0].destino.tipo).toBe("completar");
  });

  it("nunca pisa lo escrito: con otro número queda igual; con el mismo, «coincide»", () => {
    const conDato = [bloque(1, [{ nombreComun: "Bolaina", produccionCantidad: 3, produccionUnidad: "m3" }])];
    expect(planDeLlenado(conDato, [bolainaLibro]).destinos[0].destino).toEqual({ tipo: "ya_tiene", bloque: 1, cantidad: 3, unidad: "m3" });
    expect(aplicarLlenado(conDato, [bolainaLibro])[0]).toBe(conDato[0]);
    const igual = [bloque(1, [{ nombreComun: "Bolaina", produccionCantidad: 2.553, produccionUnidad: "M³" }])];
    expect(planDeLlenado(igual, [bolainaLibro]).destinos[0].destino).toEqual({ tipo: "coincide", bloque: 1 });
  });

  it("con otra unidad escrita (kg) no pone m³ debajo de ese rótulo", () => {
    const bloques = [bloque(1, [{ nombreComun: "Bolaina", produccionUnidad: "kg" }])];
    expect(planDeLlenado(bloques, [bolainaLibro]).destinos[0].destino).toEqual({ tipo: "otra_unidad", bloque: 1, unidad: "kg" });
    expect(aplicarLlenado(bloques, [bolainaLibro])[0]).toBe(bloques[0]);
  });

  it("en dos bloques no reparte: el libro no sabe de qué bloque salió", () => {
    const bloques = [bloque(1, [{ nombreComun: "Bolaina" }]), bloque(2, [{ nombreComun: "Bolaina" }])];
    expect(planDeLlenado(bloques, [bolainaLibro]).destinos[0].destino).toEqual({ tipo: "repartir", bloques: [1, 2] });
    expect(aplicarLlenado(bloques, [bolainaLibro])).toEqual(bloques);
  });

  it("sin tala en el libro queda vacía (vacío = no se sabe; nunca un 0 inventado)", () => {
    const bloques = [bloque(1, [{ nombreComun: "Capirona" }])];
    expect(planDeLlenado(bloques, [capironaLibro]).destinos[0].destino).toEqual({ tipo: "sin_tala" });
    expect(aplicarLlenado(bloques, [capironaLibro])[0].especies[0].produccionCantidad).toBeUndefined();
  });

  it("lo que el libro tiene y el trámite no, se marca para agregar", () => {
    const bloques = [bloque(1, [{ nombreComun: "Bolaina" }])];
    const d = planDeLlenado(bloques, [bolainaLibro, capironaLibro]).destinos;
    expect(d.map((x) => [x.especie.comun, x.destino.tipo])).toEqual([["Bolaina", "completar"], ["Capirona", "falta"]]);
  });

  it("la unidad m³ se reconoce como la escriban", () => {
    expect(["m3", "M3", "m³", " m 3 "].every(esUnidadM3)).toBe(true);
    expect(["", "kg", "m2", "árboles"].some(esUnidadM3)).toBe(false);
  });
});

describe("agregar del libro", () => {
  it("la fila nueva trae científico, año, plantas y lo talado como producción", () => {
    expect(especieNuevaDelLibro(bolainaLibro)).toEqual({
      nombreComun: "Bolaina",
      nombreCientifico: "Guazuma crinita",
      cites: false,
      anioInstalacion: 2018,
      cantidad: 400,
      produccionCantidad: 2.553,
      produccionUnidad: "m³",
    });
    // Sin tala, sin producción; el científico sale del catálogo si el libro no lo trae.
    const caoba = especieNuevaDelLibro({ ...capironaLibro, comun: "Caoba", cientifico: null });
    expect(caoba).toMatchObject({ nombreCientifico: "Swietenia macrophylla", cites: true, produccionCantidad: null, produccionUnidad: null });
  });

  it("sin bloques crea el bloque 1; con bloques va al elegido", () => {
    expect(agregarDelLibro([], [bolainaLibro], 0)).toEqual([{ numero: 1, vertices: [], especies: [especieNuevaDelLibro(bolainaLibro)] }]);
    const dos = [bloque(1, []), bloque(2, [{ nombreComun: "Teca" }])];
    const r = agregarDelLibro(dos, [bolainaLibro, capironaLibro], 1);
    expect(r[0]).toBe(dos[0]);
    expect(r[1].especies.map((e) => e.nombreComun)).toEqual(["Teca", "Bolaina", "Capirona"]);
  });
});

describe("el Formato N°01 de una actualización", () => {
  it("muestra la situación actual y la producción de cada especie (antes no salían en el papel)", async () => {
    const { buildPlantacionHtml } = await import("@/lib/forestal/plantacion-print");
    const datos = {
      tipoTramite: "actualizacion" as const,
      bloques: aplicarLlenado([bloque(1, [{ nombreComun: "Bolaina<b>", situacionActual: "En aprovechamiento" }, { nombreComun: "Capirona" }])], [
        { ...bolainaLibro, comun: "Bolaina<b>" },
      ]),
    };
    const html = buildPlantacionHtml({ datos, codigoInterno: "RPF-2026-0005" });
    expect(html).toContain("<th>Situación actual</th>");
    expect(html).toContain("En aprovechamiento");
    expect(html).toContain("2.553 m³");
    expect(html).toContain("Bolaina&lt;b&gt;");
    // Una inscripción no lleva esa tabla.
    expect(buildPlantacionHtml({ datos: { ...datos, tipoTramite: "inscripcion" }, codigoInterno: "x" })).not.toContain("Situación actual");
  });
});
