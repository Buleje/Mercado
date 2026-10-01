/**
 * Armar lotes escaneando (Brandon, 2026-09-26): la pila se escanea mezclada y
 * al guardar se reparte en un lote por especie + permiso — las dos cosas que el
 * servidor exige iguales dentro de un lote (L-A1, ADR-393). Lo que ningún lote
 * acepta (T1, ADR-339, ya apartada, sin especie) no entra a la pila.
 * Datos con la forma del patio de `main` y de Blas al 26-09.
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  claveDeGrupo,
  gruposDeLaPila,
  lotesQueAceptan,
  motivoFueraDeLaPila,
  pedidoDeLote,
  resumenDeLaPila,
  textoDelBoton,
  textoDelReparto,
} from "@/lib/forestal/lote-por-escaneo";

const troza = (over: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: over.id ?? "t1",
  woodEntryId: "e1",
  codificacion: "106/C",
  codigoPlanta: null,
  especieComun: "Copaiba",
  especieCientifica: "Copaifera sp.",
  volumenM3: 1.25,
  gtfNumber: "19-SEC/001",
  permiso: "19-SEC/PER-FMC-2024-008",
  guiaRecepcionada: true,
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  loteAserrioId: null,
  ...over,
});

const PER_A = "10-HUA-PUE/PER-FMP-2026-007";
const PER_B = "CON-25-UCA-0207";

describe("la pila acepta cualquier especie y cualquier permiso", () => {
  it("otra especie u otro permiso ya NO se rechazan: se reparten al guardar", () => {
    expect(motivoFueraDeLaPila(troza({ especieComun: "Sapotillo" }))).toBeNull();
    expect(motivoFueraDeLaPila(troza({ permiso: PER_B }))).toBeNull();
    expect(motivoFueraDeLaPila(troza({ permiso: null }))).toBeNull();
  });
});

describe("qué sigue sin entrar (lo que ningún lote acepta)", () => {
  it("consumida, despachada, retrozada, descarte o sin volumen: el motivo del libro", () => {
    expect(motivoFueraDeLaPila(troza({ consumidaEnId: "c1" }))).toBe("Ya entró a otra corrida");
    expect(motivoFueraDeLaPila(troza({ despachadaEnId: "d1" }))).toBe(
      "Ya salió despachada sin aserrar",
    );
    expect(motivoFueraDeLaPila(troza({ retrozos: 2 }))).toBe(
      "Se cortó en pedazos: consume los pedazos",
    );
    expect(motivoFueraDeLaPila(troza({ descarte: true }))).toBe(
      "Descarte del retrozado: no es producto",
    );
    expect(motivoFueraDeLaPila(troza({ volumenM3: 0 }))).toBe("Sin volumen registrado");
    expect(motivoFueraDeLaPila(troza({ noRecepcionada: true }))).toBe("No llegó al patio");
  });

  it("guía sin recibir: dice el camino", () => {
    expect(motivoFueraDeLaPila(troza({ guiaRecepcionada: false }))).toBe(
      "Su guía 19-SEC/001 no se recibió: recíbela en Ingresos",
    );
  });

  it("apartada en otro lote: dice cuál", () => {
    expect(
      motivoFueraDeLaPila(troza({ loteAserrioId: "l1", loteAserrioCode: "LA-2026-059" })),
    ).toBe("Ya está en el lote LA-2026-059");
  });

  it("sin especie: no hay lote que la acepte", () => {
    expect(motivoFueraDeLaPila(troza({ especieComun: "  " }))).toBe(
      "No tiene especie: corrígela en su guía antes de armar el lote",
    );
  });
});

describe("el reparto: un grupo por especie + permiso", () => {
  /* Escaneada de corrido: 3 especies, y la Copaiba viene de DOS permisos (como
     el Mashonaste de Blas, que aparece bajo dos títulos). */
  const pila = [
    troza({ id: "a", especieComun: "Copaiba", permiso: PER_A, gtfNumber: "G1", volumenM3: 1.1 }),
    troza({
      id: "b",
      especieComun: "Tornillo",
      especieCientifica: "Cedrelinga cateniformis",
      permiso: PER_A,
      gtfNumber: "G1",
      volumenM3: 0.9,
    }),
    troza({ id: "c", especieComun: "copaíba", permiso: PER_A, gtfNumber: "G2", volumenM3: 0.4 }),
    troza({ id: "d", especieComun: "Copaiba", permiso: PER_B, gtfNumber: "G3", volumenM3: 2 }),
    troza({
      id: "e",
      especieComun: "Sapotillo",
      especieCientifica: null,
      permiso: PER_A,
      gtfNumber: "G1",
      volumenM3: 0.755,
    }),
    troza({ id: "f", especieComun: "Tornillo", permiso: PER_A, gtfNumber: "G2", volumenM3: 1 }),
  ];

  it("3 especies + la misma especie con 2 permisos = 4 grupos, en el orden en que aparecieron", () => {
    const g = gruposDeLaPila(pila);
    expect(g.map((x) => [x.especie, x.permiso, x.trozas.map((t) => t.id)])).toEqual([
      ["Copaiba", PER_A, ["a", "c"]],
      ["Tornillo", PER_A, ["b", "f"]],
      ["Copaiba", PER_B, ["d"]],
      ["Sapotillo", PER_A, ["e"]],
    ]);
  });

  it("cada grupo trae sus piezas, sus m³ y sus guías sin repetir", () => {
    const [copaibaA, tornillo] = gruposDeLaPila(pila);
    expect(copaibaA).toMatchObject({
      piezas: 2,
      m3: 1.5,
      guias: ["G1", "G2"],
      especieCientifica: "Copaifera sp.",
    });
    expect(tornillo).toMatchObject({
      piezas: 2,
      m3: 1.9,
      especieCientifica: "Cedrelinga cateniformis",
    });
  });

  it("una troza sin permiso es un grupo aparte de su especie, no se mezcla con la del permiso", () => {
    const g = gruposDeLaPila([
      troza({ id: "x", permiso: PER_A }),
      troza({ id: "y", permiso: null }),
      troza({ id: "z", permiso: "  " }),
    ]);
    expect(g.map((x) => [x.permiso, x.trozas.map((t) => t.id)])).toEqual([
      [PER_A, ["x"]],
      [null, ["y", "z"]],
    ]);
    expect(claveDeGrupo({ especieComun: "Copaiba", permiso: null })).not.toBe(
      claveDeGrupo({ especieComun: "Copaiba", permiso: PER_A }),
    );
  });

  it("la científica sale de la primera pieza del grupo que la trae", () => {
    const [g] = gruposDeLaPila([
      troza({ id: "a", especieCientifica: null }),
      troza({ id: "b", especieCientifica: "Copaifera paupera" }),
    ]);
    expect(g.especieCientifica).toBe("Copaifera paupera");
  });

  it("el resumen cuenta especies distintas, no grupos", () => {
    expect(resumenDeLaPila(pila)).toEqual({
      piezas: 6,
      m3: 6.155,
      especies: 3,
      guias: ["G1", "G2", "G3"],
    });
    expect(resumenDeLaPila([])).toEqual({ piezas: 0, m3: 0, especies: 0, guias: [] });
  });
});

describe("el pedido y los lotes que aceptan, por grupo", () => {
  const [copaibaA, , copaibaB] = gruposDeLaPila([
    troza({ id: "a", permiso: PER_A }),
    troza({ id: "b", especieComun: "Tornillo", permiso: PER_A }),
    troza({ id: "c", permiso: PER_B }),
  ]);
  const [copaibaSinPermiso] = gruposDeLaPila([troza({ id: "s", permiso: null })]);

  it("el lote nace con la especie y el permiso de SU grupo", () => {
    expect(pedidoDeLote(copaibaB, "  ")).toEqual({
      speciesCommon: "Copaiba",
      speciesScientific: "Copaifera sp.",
      permiso: PER_B,
      notes: null,
    });
    expect(pedidoDeLote(copaibaSinPermiso, " pila 2 ").permiso).toBeNull();
    expect(pedidoDeLote(copaibaSinPermiso, " pila 2 ").notes).toBe("pila 2");
  });

  const lotes = [
    { id: "1", speciesCommon: "Copaiba", permiso: null, status: "abierto" },
    { id: "2", speciesCommon: "Copaiba", permiso: PER_B, status: "abierto" },
    { id: "3", speciesCommon: "Tornillo", permiso: null, status: "abierto" },
    { id: "4", speciesCommon: "Copaiba", permiso: PER_A, status: "cerrado" },
    { id: "5", speciesCommon: "COPAÍBA", permiso: PER_A, status: "abierto" },
  ];

  it("cada grupo ve sólo los abiertos de su especie con permiso compatible", () => {
    expect(lotesQueAceptan(lotes, copaibaA).map((l) => l.id)).toEqual(["1", "5"]);
    expect(lotesQueAceptan(lotes, copaibaB).map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("un grupo sin permiso entra a cualquier lote abierto de su especie (como el servidor)", () => {
    expect(lotesQueAceptan(lotes, copaibaSinPermiso).map((l) => l.id)).toEqual(["1", "2", "5"]);
  });

  it("sin grupo, ninguno", () => {
    expect(lotesQueAceptan(lotes, null)).toEqual([]);
  });

  it("un lote SIN permiso sólo se ofrece si su madera ya es del permiso del grupo (o está vacío)", () => {
    const conMadera = [
      { id: "vacio", speciesCommon: "Copaiba", permiso: null, status: "abierto", trozas: [] },
      { id: "deA", speciesCommon: "Copaiba", permiso: null, status: "abierto", trozas: [{ permiso: PER_A }, { permiso: ` ${PER_A} ` }] },
      { id: "mezclado", speciesCommon: "Copaiba", permiso: null, status: "abierto", trozas: [{ permiso: PER_A }, { permiso: PER_B }] },
    ];
    expect(lotesQueAceptan(conMadera, copaibaA).map((l) => l.id)).toEqual(["vacio", "deA"]);
    /* Revisión 26-09: el grupo del permiso B se sumaba al lote de madera A y lo mezclaba. */
    expect(lotesQueAceptan(conMadera, copaibaB).map((l) => l.id)).toEqual(["vacio"]);
    expect(lotesQueAceptan(conMadera, copaibaSinPermiso).map((l) => l.id)).toEqual(["vacio", "deA"]);
  });
});

describe("lo que la pantalla promete antes de guardar", () => {
  it("el reparto: cuántos lotes nuevos y cuántas sumas", () => {
    expect(textoDelReparto(1, 0)).toBe("se crea 1 lote");
    expect(textoDelReparto(4, 0)).toBe("se crean 4 lotes");
    expect(textoDelReparto(0, 1)).toBe("se suma a 1 lote abierto");
    expect(textoDelReparto(2, 1)).toBe("2 lotes nuevos y 1 suma a un lote abierto");
  });

  it("el botón: lotes y trozas; con un solo grupo, el lote o el código al que se suma", () => {
    expect(textoDelBoton({ grupos: 1, piezas: 1, sumas: 0, loteUnico: null })).toBe(
      "Crear el lote con 1 troza",
    );
    expect(textoDelBoton({ grupos: 1, piezas: 5, sumas: 1, loteUnico: "LA-2026-061" })).toBe(
      "Sumar 5 al LA-2026-061",
    );
    expect(textoDelBoton({ grupos: 4, piezas: 12, sumas: 0, loteUnico: null })).toBe(
      "Crear 4 lotes (12 trozas)",
    );
    expect(textoDelBoton({ grupos: 3, piezas: 7, sumas: 1, loteUnico: null })).toBe(
      "Guardar en 3 lotes (7 trozas)",
    );
  });
});
