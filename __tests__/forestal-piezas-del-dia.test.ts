/**
 * Lo que salió un día, paquete por paquete (Brandon, 2026-09-23): la tabla
 * «pieza por pieza», traer TODO el día al cubicado y el Anexo 04 de los días
 * marcados, combinados.
 *
 * Lo que se fija acá es lo que ningún tipo ve:
 *  · la escuadría vuelve a pulgadas y pies SIN el ruido del libro (8.01 → 8);
 *  · la tabla cierra con el día: lo que el asiento declara y ningún paquete
 *    detalla tiene su renglón;
 *  · un paquete sin escuadría no viaja y se cuenta — nunca una fila 0×0×0 ni
 *    una medida inventada en el anexo;
 *  · el tipo y el dueño que declaró el libro viajan con la pieza.
 */
import { describe, expect, it } from "vitest";
import {
  avisoSinEscuadria,
  cifrasDeLaCorrida,
  escuadriaEnPulgadas,
  filasPiezaPorPieza,
  hojaPiezaPorPieza,
  piezasDeLasCorridas,
  totalesDeLasCorridas,
  type CorridaDelDia,
  type PaqueteDelDia,
} from "@/lib/forestal/piezas-del-dia";
import { entraConDuenos } from "@/lib/forestal/resumen-de-jornadas";
import { construirAnexo04 } from "@/lib/forestal/anexo04-serfor";
import { tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/* Un 2×8×10 como lo guarda el libro: cm y metros con dos decimales. */
const paq = (id: string, over: Partial<PaqueteDelDia> = {}): PaqueteDelDia => ({
  id,
  codigo: `PQ-${id}`,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: "PIEZAS",
  cantidad: 10,
  volumenM3: 0.3145,
  espesorCm: 5.08,
  anchoCm: 20.32,
  largoM: 3.05,
  pieTablar: 133.33,
  ...over,
});

const corrida = (id: string, over: Partial<CorridaDelDia> = {}): CorridaDelDia => ({
  id,
  lineNo: Number(id.replace(/\D/g, "")) || 1,
  dia: "2026-09-23",
  fecha: "2026-09-23T00:00:00.000Z",
  especie: "Tornillo",
  especieCientifica: null,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: "PIEZAS",
  unidad: "m3",
  cantidad: 0.629,
  m3: 0.629,
  piezasAsiento: 20,
  volumenConsumidoM3: null,
  observaciones: null,
  materiaPrimaRef: null,
  dueno: "Del centro",
  duenoMadera: "propia",
  titularNombre: null,
  duenoParteId: null,
  gtfOrigen: [],
  permisos: [],
  atadaPorque: null,
  paquetes: [paq(`${id}a`), paq(`${id}b`)],
  ...over,
});

describe("la escuadría del paquete, en pulgadas y pies", () => {
  it("vuelve a la grilla de la sierra: 2.44 m son 8 pies, no 8.01", () => {
    expect(escuadriaEnPulgadas({ espesorCm: 5.08, anchoCm: 20.32, largoM: 2.44 })).toEqual({
      espesor: 2,
      ancho: 8,
      largo: 8,
    });
  });

  it("sin una de las tres no hay escuadría (y 0 cuenta como falta)", () => {
    expect(escuadriaEnPulgadas({ espesorCm: 5.08, anchoCm: null, largoM: 2.44 })).toBeNull();
    expect(escuadriaEnPulgadas({ espesorCm: 5.08, anchoCm: 20.32, largoM: 0 })).toBeNull();
  });
});

describe("pieza por pieza: paquetes del día → filas", () => {
  it("una fila por paquete, en el orden del libro (día, N.º), con su escuadría y su tipo", () => {
    const filas = filasPiezaPorPieza([
      corrida("c42", { lineNo: 42, especie: "Cumala" }),
      corrida("c41", { lineNo: 41, dia: "2026-09-22" }),
    ]);
    expect(filas.map((f) => `${f.dia}#${f.lineNo}:${f.codigo}`)).toEqual([
      "2026-09-22#41:PQ-c41a",
      "2026-09-22#41:PQ-c41b",
      "2026-09-23#42:PQ-c42a",
      "2026-09-23#42:PQ-c42b",
    ]);
    expect(filas[0]).toMatchObject({
      escuadria: { espesor: 2, ancho: 8, largo: 10 },
      tipo: "Comercial",
      cantidad: 10,
      pt: 133.33,
    });
  });

  it("el PT es el medido al cubicar; un paquete viejo (sin PT) lo saca del m³", () => {
    const [fila] = filasPiezaPorPieza([corrida("c1", { paquetes: [paq("v", { pieTablar: null, volumenM3: 1 })] })]);
    expect(fila!.pt).toBe(424);
  });

  it("el producto genérico no dice el tipo: sale de la medida", () => {
    const [fila] = filasPiezaPorPieza([
      corrida("c1", { paquetes: [paq("g", { producto: "MADERA ASERRADA", espesorCm: 2.54, anchoCm: 20.32 })] }),
    ]);
    expect(fila!.tipo).toBe("Tabla");
  });

  it("la tabla cierra con el día: lo que el asiento declara sin paquete tiene su renglón", () => {
    /* 0.629 declarados, 0.629 en paquetes: nada suelto. */
    expect(cifrasDeLaCorrida(corrida("c1")).sinPaqueteM3).toBe(0);
    /* 1 m³ declarado y 0.629 en paquetes: 0.371 van en su renglón. */
    const suelta = cifrasDeLaCorrida(corrida("c2", { m3: 1, cantidad: 1 }));
    expect(suelta).toMatchObject({ sinPaqueteM3: 0.371, m3: 1, piezas: 20 });
    /* Sin paquetes: las piezas son las del asiento, como en el casillero. */
    const sinPaquetes = cifrasDeLaCorrida(corrida("c3", { paquetes: [], m3: 0.5, piezasAsiento: 12 }));
    expect(sinPaquetes).toMatchObject({ paquetes: 0, piezas: 12, m3: 0.5, pt: 212 });

    const total = totalesDeLasCorridas([corrida("c1"), corrida("c2", { m3: 1 })]);
    expect(total).toMatchObject({ corridas: 2, paquetes: 4, piezas: 40, m3: 1.629 });
  });

  it("el Excel lleva día, corrida, especie y dueño en CADA fila, y las medidas como números", () => {
    const hoja = hojaPiezaPorPieza(filasPiezaPorPieza([corrida("c7", { lineNo: 7 })]));
    expect(hoja.nombre).toBe("Pieza por pieza");
    expect(hoja.filas[1]).toMatchObject({
      Fecha: "2026-09-23",
      "N° corrida": 7,
      Especie: "Tornillo",
      Dueño: "Del centro",
      "Espesor (pulg)": 2,
      "Ancho (pulg)": 8,
      "Largo (pies)": 10,
      Piezas: 10,
    });
  });
});

describe("traer TODO el día al cubicado", () => {
  const dia = [
    corrida("c1"),
    corrida("c2", {
      especie: "Cumala",
      dueno: "De tercero · WASACO",
      duenoMadera: "tercero",
      titularNombre: "WASACO",
      duenoParteId: "parte-9",
      paquetes: [paq("x"), paq("sin", { espesorCm: null, cantidad: 336, volumenM3: 5.154 })],
    }),
  ];

  it("junta las piezas de TODAS las corridas; la sin escuadría no viaja y se cuenta", () => {
    const { piezas, sinEscuadria } = piezasDeLasCorridas(dia);
    expect(piezas).toHaveLength(3);
    expect(piezas.map((p) => p.especie)).toEqual(["Tornillo", "Tornillo", "Cumala"]);
    expect(sinEscuadria).toEqual({ paquetes: 1, piezas: 336, m3: 5.154, codigos: ["PQ-sin"] });
    expect(avisoSinEscuadria(sinEscuadria, fmtM3, { adonde: "al cubicado", como: "cárgala" })).toBe(
      "1 paquete (5.154 m³ · 336 piezas) no tiene escuadría y no entra al cubicado: cárgala.",
    );
  });

  it("cada pieza viaja cubicada y con su dueño de tercero (nombre y ficha)", () => {
    const { piezas } = piezasDeLasCorridas(dia);
    expect(piezas[0]).toMatchObject({ espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uLargo: "pies", cantidad: 10 });
    expect(piezas[0]!.pieTablar).toBeCloseTo((2 * 8 * 10 * 10) / 12, 1);
    expect(piezas[0]!.dueno).toBeUndefined();
    expect(piezas[2]).toMatchObject({ dueno: "WASACO", duenoParteId: "parte-9" });
  });

  it("el tipo del libro manda: si se declaró Comercial sobre una medida de tabla, sigue siendo Comercial", () => {
    const { piezas } = piezasDeLasCorridas([
      corrida("c1", { paquetes: [paq("t", { espesorCm: 2.54, producto: "MADERA ASERRADA (COMERCIAL)" })] }),
    ]);
    expect(tipoDePieza(piezas[0]!)).toBe("Comercial");
    /* Si coincide con el de la medida, no se fuerza: la fila sigue la regla. */
    expect(piezasDeLasCorridas([corrida("c2")]).piezas[0]!.tipo).toBeUndefined();
  });
});

describe("días marcados → piezas del Anexo 04, combinadas", () => {
  const lunes = corrida("c1", { dia: "2026-09-21", lineNo: 1, dueno: "Del centro" });
  const martes = [
    corrida("c2", { dia: "2026-09-22", lineNo: 2, especie: "Cumala", dueno: "Del centro" }),
    corrida("c3", {
      dia: "2026-09-22",
      lineNo: 3,
      dueno: "De tercero · WASACO",
      duenoMadera: "tercero",
      titularNombre: "WASACO",
    }),
  ];

  it("los dos días en un solo anexo: un bloque por especie × tipo y el total de todas las piezas", () => {
    const { piezas } = piezasDeLasCorridas([lunes, ...martes]);
    const anexo = construirAnexo04(piezas, { unidadV: "m3", modo: "oficial" });
    expect(anexo.hojas.flatMap((h) => h.bloques).map((b) => `${b.especie}·${b.tipo}`)).toEqual(["TORNILLO·COMERCIAL", "CUMALA·COMERCIAL"]);
    expect(anexo.totalPiezas).toBe(60);
    expect(anexo.totalM3).toBeCloseTo(piezas.reduce((a, p) => a + p.m3, 0), 3);
  });

  it("con un dueño sacado en los chips, sus piezas no entran (el mismo filtro del resumen)", () => {
    const soloDuenos = { "2026-09-22": ["Del centro"] };
    const elegidas = [lunes, ...martes].filter((c) => entraConDuenos(c, soloDuenos));
    const { piezas } = piezasDeLasCorridas(elegidas);
    expect(piezas).toHaveLength(4);
    expect(piezas.some((p) => p.dueno === "WASACO")).toBe(false);
  });
});
