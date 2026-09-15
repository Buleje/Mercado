import { describe, expect, it } from "vitest";
import { detectarSeparador, leerCsv, partirLineaCsv, ubicarCabecera } from "@/lib/forestal/ctp-serfor-archivo";
import { esPieDelReporte } from "@/lib/forestal/ctp-formatos-serfor";
import {
  aCuerpoDelLibro,
  normalizarRespuesta,
  proveedorDesdeFormato,
  tipoDeProducto,
} from "@/lib/forestal/ctp-serfor-a-libro";

/**
 * El preámbulo REAL del reporte del SNIFFS: título del libro, N° de registro y
 * la sección, con filas vacías entre medio. Si el importador asume que la
 * cabecera es la fila 1, lee «LIBRO DE OPERACIONES…» como nombre de columna.
 */
const PREAMBULO: unknown[][] = [
  ["", "", "LIBRO DE OPERACIONES DE CENTROS DE TRANSFORMACION PRIMARIA DE PRODUCTOS Y SUB PRODUCTOS FORESTALES MADERABLES"],
  [],
  ["", "", "N° REGISTRO", "19-SEC/AUT-CTP-2020-12"],
  ["", "", "SECCION 1", "INGRESOS"],
  [],
];
const CAB_INGRESOS = [
  "N°", "Fecha", "Tipo de Documento", "N° de Documento", "N° de fuente de Origen / Procedencia",
  "Tipo de Producto", "Nombre Comun", "Nombre Cientifico", "Codigo de Origen / Procedencia",
  "Codigo de CTP", "Unidad de Medida", "Cantidad", "Observaciones",
];
const FILA = [
  1, "28/05/2024", "GTF Primaria", "019-0000002", "3", "MADERA EN ROLLO", "Copaiba",
  "Copaifera paupera (Herzog) Dwyer", "33/B (0000010)", "3012263", "Metros Cúbicos", "3.010", "",
];

describe("ubicarCabecera", () => {
  it("salta el preámbulo del SNIFFS y encuentra la fila de cabecera", () => {
    const r = ubicarCabecera([...PREAMBULO, CAB_INGRESOS, FILA]);
    expect(r).toMatchObject({ indice: 5, formato: "ingresos" });
  });

  it("el título del libro NO se confunde con una cabecera", () => {
    // Tiene una sola celda con texto: no llega al mínimo de columnas.
    expect(ubicarCabecera([PREAMBULO[0]])).toBeNull();
  });

  it("una hoja que no es del libro no devuelve nada", () => {
    expect(ubicarCabecera([["Cliente", "Producto", "Cantidad", "Precio"], ["A", "B", 1, 2]])).toBeNull();
    expect(ubicarCabecera([])).toBeNull();
  });

  it("reconoce el retrozado, que no tiene columna «N°»", () => {
    const cab = [
      "Fecha", "Codigo de Origen / Procedencia / CTP", "Volumen Inicial (m3)", "Codigo de Retrozado",
      "Nombre Comun", "Nombre Cientifico", "Diametro Mayor (m)", "Diametro Menor (m)", "Longitud (m)",
      "Volumen Final (m3)", "Observaciones",
    ];
    expect(ubicarCabecera([[], ["", "", "APARTADO 2", "RETROZADO"], cab])?.formato).toBe("retrozado");
  });
});

describe("detectarSeparador", () => {
  it("elige el que más aparece, no el del idioma", () => {
    // Un export es-PE usa «;» porque la coma es decimal; el mismo archivo en
    // inglés viene con «,», y el operador no sabe cuál tiene.
    expect(detectarSeparador("a;b;c;d")).toBe(";");
    expect(detectarSeparador("a,b,c,d")).toBe(",");
  });

  it("con «;» de separador y comas decimales adentro, gana el «;»", () => {
    expect(detectarSeparador('Fecha;Cantidad;Obs')).toBe(";");
  });
});

describe("partirLineaCsv", () => {
  it("no parte adentro de comillas", () => {
    expect(partirLineaCsv('a;"b;c";d', ";")).toEqual(["a", "b;c", "d"]);
  });

  it("las comillas dobles adentro son una comilla literal", () => {
    expect(partirLineaCsv('a;"dijo ""hola""";b', ";")).toEqual(["a", 'dijo "hola"', "b"]);
  });

  it("deja las celdas vacías en su lugar, sin correr las columnas", () => {
    expect(partirLineaCsv("a;;c", ";")).toEqual(["a", "", "c"]);
  });
});

describe("leerCsv", () => {
  it("lee un reporte con preámbulo y devuelve todas las filas", () => {
    const csv = [
      "LIBRO DE OPERACIONES DE CENTROS DE TRANSFORMACION PRIMARIA",
      "N° REGISTRO;19-SEC/AUT-CTP-2020-12",
      CAB_INGRESOS.join(";"),
      FILA.join(";"),
    ].join("\n");
    const filas = leerCsv(csv);
    expect(ubicarCabecera(filas)).toMatchObject({ indice: 2, formato: "ingresos" });
  });

  it("se come el BOM de Excel, que rompe la primera cabecera", () => {
    const filas = leerCsv(`﻿${CAB_INGRESOS.join(";")}\n${FILA.join(";")}`);
    expect(filas[0][0]).toBe("N°");
  });

  it("ignora las líneas en blanco del pie del reporte", () => {
    const filas = leerCsv(`${CAB_INGRESOS.join(";")}\n${FILA.join(";")}\n\n\n`);
    expect(filas).toHaveLength(2);
  });

  it("un archivo vacío no rompe", () => {
    expect(leerCsv("")).toEqual([]);
  });
});

describe("normalizarRespuesta · las dos puertas de escritura hablan distinto", () => {
  it("lee el «detalle» de wood-entries/import, que no se llama «rows»", () => {
    // Leer la clave equivocada devolvía 0 filas con status 200: el modal decía
    // «0 listas para importar» sobre un archivo que sí tenía datos.
    const r = normalizarRespuesta({
      mode: "preview",
      resumen: { total: 1, crear: 1, creados: 0, saltados: 0, difieren: 0, errores: 0 },
      detalle: [{ row: 7, gtf: "019-0000002", action: "crear", message: "Copaiba · 3.01 m³" }],
    });
    expect(r.resumen.porCrear).toBe(1);
    expect(r.filas[0]).toMatchObject({ fila: 7, codigo: "019-0000002", accion: "crear" });
  });

  it("«difiere» se muestra como que ya está: el importador es insert-only", () => {
    const r = normalizarRespuesta({
      detalle: [{ row: 3, gtf: "G-1", action: "difiere", message: "volumen 20→25 m³" }],
    });
    expect(r.filas[0].accion).toBe("existe");
    expect(r.resumen.existen).toBe(1);
  });

  it("deja pasar tal cual la respuesta de ctp-serfor-import", () => {
    const propia = { resumen: { creados: 2, porCrear: 0, existen: 1, errores: 0 }, filas: [] };
    expect(normalizarRespuesta(propia)).toBe(propia);
  });

  it("una respuesta vacía no rompe la pantalla", () => {
    expect(normalizarRespuesta(null).resumen).toEqual({ creados: 0, porCrear: 0, existen: 0, errores: 0 });
    expect(normalizarRespuesta({}).filas).toEqual([]);
  });
});

describe("aCuerpoDelLibro", () => {
  const fila = (datos: Record<string, unknown>, problemas: string[] = []) => ({ fila: 7, datos, problemas }) as never;

  it("arma el proveedor con lo que SÍ trae el formato", () => {
    // El SNIFFS no publica al titular, pero el endpoint lo exige: sin esto la
    // fila entera se rechaza por un dato que el documento nunca tuvo.
    expect(proveedorDesdeFormato({ codigoOrigen: "33/B", numeroDocumento: "019-2" })).toBe("Origen 33/B · 019-2");
    expect(proveedorDesdeFormato({})).toMatch(/Sin identificar/);
  });

  it("traduce el tipo de producto al vocabulario del schema", () => {
    expect(tipoDeProducto("MADERA EN ROLLO")).toBe("rolliza");
    expect(tipoDeProducto("MADERA ASERRADA (PAQUETERIA CORTA)")).toBe("aserrada");
    expect(tipoDeProducto("")).toBe("rolliza");
  });

  it("conserva el código de CTP en las notas: sin él se pierde el cruce con el consumo", () => {
    const [r] = aCuerpoDelLibro("ingresos", [
      fila({ numeroDocumento: "019-2", especieComun: "Copaiba", cantidad: 3.01, codigoCtp: "3012263", codigoOrigen: "33/B" }),
    ]);
    expect(String(r.notes)).toContain("3012263");
    expect(r.volumeM3).toBe(3.01);
  });

  it("las filas con problemas NO se mandan: el server las rechazaría con peor mensaje", () => {
    const r = aCuerpoDelLibro("ingresos", [fila({ cantidad: 1 }, ["Falta Nombre Común"])]);
    expect(r).toEqual([]);
  });

  it("sin las otras secciones, la producción entra sin consumos: no se adivina el origen", () => {
    const [r] = aCuerpoDelLibro("produccion", [
      fila({ tipoProducto: "MADERA ASERRADA", especieComun: "Tornillo", cantidad: 4.9, lote: "9-2026" }),
    ]);
    expect(r.consumos).toEqual([]);
    expect(r.rendimientoPct).toBeNull();
    expect(String(r.notes)).toContain("9-2026");
  });

  it("con el libro completo, el LOTE atribuye la corrida a su guía de ingreso", () => {
    // Es lo que hace que los saldos salgan bien: sin esta atribución el
    // aserradero muestra disponible una madera que el libro declara aserrada.
    const [r] = aCuerpoDelLibro(
      "produccion",
      [fila({ tipoProducto: "MADERA ASERRADA", especieComun: "Copaiba", cantidad: 1.5, lote: "9-2026" })],
      {
        ingresos: [fila({ numeroDocumento: "019-0000002", codigoCtp: "3012263", cantidad: 3.0 })],
        consumos: [fila({ codigoOrigen: "3012263", cantidad: 3.0, lote: "9-2026" })],
      },
    );
    expect(r.consumos).toEqual([{ gtfIngreso: "019-0000002", volumeM3: 3.0 }]);
    expect(r.rendimientoPct).toBe(50);
  });

  it("dos productos del mismo lote NO consumen la misma madera dos veces", () => {
    const rs = aCuerpoDelLibro(
      "produccion",
      [
        { fila: 1, datos: { tipoProducto: "MA", especieComun: "Copaiba", cantidad: 3, lote: "9-2026" }, problemas: [] } as never,
        { fila: 2, datos: { tipoProducto: "MT", especieComun: "Copaiba", cantidad: 1, lote: "9-2026" }, problemas: [] } as never,
      ],
      {
        ingresos: [fila({ numeroDocumento: "G-1", codigoCtp: "100", cantidad: 10 })],
        consumos: [fila({ codigoOrigen: "100", cantidad: 8, lote: "9-2026" })],
      },
    );
    const total = rs.flatMap((r) => r.consumos as { volumeM3: number }[]).reduce((s, c) => s + c.volumeM3, 0);
    expect(total).toBe(8); // los 8 m³ del libro, no 16
  });
});

describe("detectarFormato · los consumos se reconocen con la cabecera corta y la larga", () => {
  const base = ["N°", "Fecha", "Tipo de Producto", "Nombre Comun", "Nombre Cientifico"];
  const cola = ["Unidad de Medida", "Cantidad", "Lote", "Observaciones"];

  it("reconoce la cabecera COMPLETA que imprime el SNIFFS", () => {
    const cab = [...base, "Codigo de Origen / Procedencia / CTP o Retrozado", ...cola];
    expect(ubicarCabecera([cab])?.formato).toBe("consumos");
  });

  it("reconoce la ABREVIADA: exigir el texto largo perdía la sección en silencio", () => {
    // Sin consumos reconocidos, la producción entra sin origen y el saldo
    // muestra como disponible una madera que el libro declara aserrada.
    const cab = [...base, "Codigo de Origen / Procedencia / CTP", ...cola];
    expect(ubicarCabecera([cab])?.formato).toBe("consumos");
  });

  it("el retrozado sigue ganando su propio archivo, no lo roba consumos", () => {
    const cab = [
      "Fecha", "Codigo de Origen / Procedencia / CTP", "Volumen Inicial (m3)", "Codigo de Retrozado",
      "Nombre Comun", "Nombre Cientifico", "Diametro Mayor (m)", "Diametro Menor (m)", "Longitud (m)",
      "Volumen Final (m3)", "Observaciones",
    ];
    expect(ubicarCabecera([cab])?.formato).toBe("retrozado");
  });
});

describe("aCuerpoDelLibro · las dos caras del consumo", () => {
  const fila = (n: number, datos: Record<string, unknown>) => ({ fila: n, datos, problemas: [] }) as never;
  const libro = {
    ingresos: [
      fila(7, { numeroDocumento: "G-1", codigoCtp: "100", cantidad: 10 }),
      fila(8, { numeroDocumento: "G-2", codigoCtp: "200", cantidad: 6 }),
    ],
    consumos: [
      fila(7, { codigoOrigen: "100", cantidad: 8, lote: "001" }),
      fila(8, { codigoOrigen: "200", cantidad: 4, lote: "001" }),
    ],
  };

  it("manda los códigos de troza además de los m³: son el mismo hecho", () => {
    // Escribir sólo los m³ deja el patio mostrando trozas libres que ya se
    // aserraron; sólo las piezas deja el saldo por guía sin descontar.
    const [r] = aCuerpoDelLibro("produccion", [fila(9, { tipoProducto: "MA", especieComun: "X", cantidad: 6, lote: "001" })], libro);
    expect(r.trozasConsumidas).toEqual(["100", "200"]);
    expect(r.consumos).toEqual([
      { gtfIngreso: "G-1", volumeM3: 8 },
      { gtfIngreso: "G-2", volumeM3: 4 },
    ]);
  });

  it("con dos productos del lote, la troza va a UNA sola corrida", () => {
    // Los m³ se reparten a prorrata, pero una pieza es indivisible: repetirla
    // marcaría la misma troza consumida dos veces.
    const rs = aCuerpoDelLibro(
      "produccion",
      [
        fila(9, { tipoProducto: "MA", especieComun: "X", cantidad: 4, lote: "001" }),
        fila(10, { tipoProducto: "MT", especieComun: "X", cantidad: 2, lote: "001" }),
      ],
      libro,
    );
    expect(rs[0].trozasConsumidas).toEqual(["100", "200"]);
    expect(rs[1].trozasConsumidas).toEqual([]);
    // Pero los m³ sí se reparten entre las dos.
    expect((rs[1].consumos as unknown[]).length).toBeGreaterThan(0);
  });

  it("sin el libro no manda trozas: no hay de dónde sacarlas", () => {
    const [r] = aCuerpoDelLibro("produccion", [fila(9, { tipoProducto: "MA", especieComun: "X", cantidad: 6, lote: "001" })]);
    expect(r.trozasConsumidas).toEqual([]);
  });

  it("el ingreso manda su código de CTP como campo, no sólo en las notas", () => {
    // Con él se crea la troza, que es lo que el consumo y el retrozado buscan.
    const [r] = aCuerpoDelLibro("ingresos", [
      fila(7, { numeroDocumento: "G-1", especieComun: "Copaiba", cantidad: 3, codigoCtp: "3012263" }),
    ]);
    expect(r.codigoCtp).toBe("3012263");
    expect(String(r.notes)).toContain("3012263");
  });
});

describe("ubicarCabecera · la cabecera del libro real ocupa DOS filas", () => {
  it("elige la fila que desdobla ESPECIE, no la que la agrupa", () => {
    // El libro pone «ESPECIE» arriba y «Nombre Común / Científico» abajo. Las
    // demás columnas se repiten en las dos, así que la de arriba también pasa
    // como cabecera — y quedarse con ella metía la de abajo como si fuera dato.
    const agrupadora = [
      "Fecha", "Codigo de Origen / Procedencia / CTP", "Volumen Inicial (m3)", "Codigo de Retrozado",
      "Especie", "Especie", "Diametro Mayor (m)", "Diametro Menor (m)", "Longitud (m)",
      "Volumen Final (m3)", "Observaciones",
    ];
    const desdoblada = [...agrupadora];
    desdoblada[4] = "Nombre Comun";
    desdoblada[5] = "Nombre Cientifico";

    const r = ubicarCabecera([agrupadora, desdoblada]);
    expect(r?.indice).toBe(1);
    expect(r?.formato).toBe("retrozado");
  });

  it("una cabecera de una sola fila se sigue tomando tal cual", () => {
    expect(ubicarCabecera([CAB_INGRESOS, FILA])?.indice).toBe(0);
  });
});

describe("esPieDelReporte · la leyenda final no es un dato", () => {
  it("reconoce el pie que ExcelJS expande por la celda combinada", () => {
    // Cada archivo del SNIFFS termina con «DETALLE DE OBSERVACIONES: …» en una
    // celda merged. Sin descartarlo, el reporte marcaba una fila incompleta que
    // el operador no podía arreglar porque no existe.
    const pie = Array(12).fill("DETALLE DE OBSERVACIONES:C/I: Consumo Interno");
    expect(esPieDelReporte(pie)).toBe(true);
  });

  it("una fila de datos NO se confunde con el pie", () => {
    expect(esPieDelReporte(FILA)).toBe(false);
  });

  it("una fila con el mismo valor repetido pero otro texto no es el pie", () => {
    // El criterio es la forma Y el texto: sólo la forma dejaría afuera datos.
    expect(esPieDelReporte(["3.010", "3.010", "3.010", "3.010"])).toBe(false);
  });

  it("una fila casi vacía no cuenta", () => {
    expect(esPieDelReporte(["DETALLE DE OBSERVACIONES:"])).toBe(false);
    expect(esPieDelReporte(undefined)).toBe(false);
  });
});
