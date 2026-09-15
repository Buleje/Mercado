import { describe, expect, it } from "vitest";
import {
  COLUMNAS_POR_FORMATO,
  FORMATOS,
  FORMATOS_LIBRO,
  columnasFaltantes,
  detectarColumnas,
  detectarFormato,
  leerFecha,
  leerNumero,
  parsearFilas,
  resumirParseo,
} from "@/lib/forestal/ctp-formatos-serfor";
import { aCentimetros } from "@/app/api/admin/forestal/ctp-serfor-import/route";
import { cabecerasDePlantilla } from "@/lib/forestal/ctp-serfor-plantilla";

/**
 * Las cabeceras EXACTAS que imprime el SNIFFS, copiadas del reporte real de un
 * CTP (registro 19-SEC/AUT-CTP-2020-12). Si el importador no las reconoce, no
 * sirve para nada: es el archivo que el aserradero tiene a mano.
 */
const CAB_INGRESOS = [
  "N°", "Fecha", "Tipo de Documento", "N° de Documento", "N° de fuente de Origen / Procedencia",
  "Tipo de Producto", "Nombre Comun", "Nombre Cientifico", "Codigo de Origen / Procedencia",
  "Codigo de CTP", "Unidad de Medida", "Cantidad", "Observaciones",
];
const CAB_CONSUMOS = [
  "N°", "Fecha", "Tipo de Producto", "Nombre Comun", "Nombre Cientifico",
  "Codigo de Origen / Procedencia / CTP o Retrozado", "N° Fuente Origen / Procedencia",
  "Unidad de medida", "Cantidad", "Lote", "Observaciones",
];
const CAB_RETROZADO = [
  "Fecha", "Codigo de Origen / Procedencia / CTP", "Volumen Inicial (m3)", "Codigo de Retrozado",
  "Nombre Comun", "Nombre Cientifico", "Diametro Mayor (m)", "Diametro Menor (m)", "Longitud (m)",
  "Volumen Final (m3)", "Observaciones",
];
const CAB_PRODUCCION = [
  "N°", "Fecha", "Tipo de Producto", "Nombre Comun", "Nombre Cientifico",
  "Unidad Medida", "Cantidad", "Lote", "observaciones",
];
const CAB_SALIDAS = [
  "N°", "Fecha", "Tipo de Documento", "N° de Documento", "Tipo de Producto",
  "Nombre Común", "Nombre Cientifico", "Lote", "Codigo", "Unidad de Medida", "Cantidad", "Observaciones",
];

describe("detectarFormato · reconoce los cinco reportes del SNIFFS", () => {
  it("Sección 1 · Ingresos", () => {
    expect(detectarFormato(CAB_INGRESOS)?.formato).toBe("ingresos");
  });
  it("Sección 2 · Consumos", () => {
    expect(detectarFormato(CAB_CONSUMOS)?.formato).toBe("consumos");
  });
  it("Apartado 2 · Retrozado", () => {
    expect(detectarFormato(CAB_RETROZADO)?.formato).toBe("retrozado");
  });
  it("Sección 3 · Producción", () => {
    expect(detectarFormato(CAB_PRODUCCION)?.formato).toBe("produccion");
  });
  it("Sección 4 · Salidas", () => {
    expect(detectarFormato(CAB_SALIDAS)?.formato).toBe("salidas");
  });
  it("un archivo que no es del libro no se fuerza a ningún formato", () => {
    expect(detectarFormato(["Cliente", "Producto", "Precio"])).toBeNull();
    expect(detectarFormato([])).toBeNull();
  });
});

describe("detectarColumnas · Ingresos", () => {
  const m = detectarColumnas("ingresos", CAB_INGRESOS);

  it("empareja todas las columnas del formato", () => {
    expect(columnasFaltantes("ingresos", m)).toEqual([]);
  });

  it("NO confunde «Codigo de CTP» con «Codigo de Origen / Procedencia»", () => {
    // Son dos códigos distintos: el del árbol en el título habilitante y el que
    // este centro le pone a la pieza. Mezclarlos rompe la trazabilidad justo
    // donde OSINFOR la mira.
    expect(m.codigoOrigen).toBe(8);
    expect(m.codigoCtp).toBe(9);
  });

  it("NO confunde «N° de Documento» con «N° de fuente de Origen»", () => {
    expect(m.numeroDocumento).toBe(3);
    expect(m.fuenteOrigen).toBe(4);
  });

  it("la columna «N°» no se roba «Nombre Comun»", () => {
    expect(m.numero).toBe(0);
    expect(m.especieComun).toBe(6);
    expect(m.especieCientifica).toBe(7);
  });
});

describe("detectarColumnas · inventarioTrozas (Brandon, 2026-09-01)", () => {
  /**
   * Las cabeceras EXACTAS de `trozas_disponibles.xlsx`, el reporte real que
   * exportó el SNIFFS: «Documento de Ingreso» declara el TIPO ("GTF") y el N°
   * de GTF viene en la columna de al lado, SIN encabezado propio (celda
   * fusionada). Sin el fallback posicional, `numeroDocumento` queda sin
   * mapear y `aCuerpoDelLibro` agrupa TODAS las trozas del archivo en una
   * sola guía inventada — perdiendo a qué GTF real llegó cada una.
   */
  const CAB_INV_TROZAS = [
    "Contrato", "Numero Resolucion", "Documento de Ingreso", "", "Troza Padre", "",
    "Codigo Planta", "Especie", "D1(cm)", "D2(cm)", "Largo(m)", "Volumen",
    "Tipo de Producto", "Estado Actual", "Fecha del Estado",
  ];
  const m = detectarColumnas("inventarioTrozas", CAB_INV_TROZAS);

  it("el N° de GTF se resuelve por posición cuando su columna no tiene encabezado propio", () => {
    expect(m.tipoDocumento).toBe(2);
    expect(m.numeroDocumento).toBe(3);
  });

  it("«Contrato» y «Numero Resolucion» no se confunden entre sí", () => {
    expect(m.contrato).toBe(0);
    expect(m.resolucion).toBe(1);
  });

  it("las columnas obligatorias quedan emparejadas", () => {
    expect(columnasFaltantes("inventarioTrozas", m)).toEqual([]);
  });

  it("no inventa un N° de GTF cuando la columna de al lado SÍ tiene su propio encabezado", () => {
    // Sin la celda fusionada: «Troza Padre» tiene nombre propio y no debe
    // robarse como si fuera el GTF de «Documento de Ingreso».
    const conEncabezados = [
      "Contrato", "Numero Resolucion", "Documento de Ingreso", "Troza Padre",
      "Codigo Planta", "Especie", "D1(cm)", "D2(cm)", "Largo(m)", "Volumen",
    ];
    const m2 = detectarColumnas("inventarioTrozas", conEncabezados);
    expect(m2.numeroDocumento).toBeNull();
    expect(m2.trozaPadre).toBe(3);
  });
});

describe("detectarColumnas · Consumos", () => {
  const m = detectarColumnas("consumos", CAB_CONSUMOS);

  it("empareja todas las columnas", () => {
    expect(columnasFaltantes("consumos", m)).toEqual([]);
  });

  it("el código largo gana sobre el genérico y no se lo lleva «N° Fuente Origen»", () => {
    expect(m.codigoOrigen).toBe(5);
    expect(m.fuenteOrigen).toBe(6);
  });
});

describe("detectarColumnas · Retrozado", () => {
  const m = detectarColumnas("retrozado", CAB_RETROZADO);

  it("empareja todas las columnas", () => {
    expect(columnasFaltantes("retrozado", m)).toEqual([]);
  });

  it("distingue el código de la madre del código del retrozo", () => {
    expect(m.codigoMadre).toBe(1);
    expect(m.codigoRetrozo).toBe(3);
  });

  it("distingue los dos diámetros y los dos volúmenes", () => {
    expect(m.diametroMayor).toBe(6);
    expect(m.diametroMenor).toBe(7);
    expect(m.volumenInicial).toBe(2);
    expect(m.volumenFinal).toBe(9);
  });
});

describe("detectarColumnas · Producción y Salidas", () => {
  it("Producción acepta «Unidad Medida» sin «de» y «observaciones» en minúscula", () => {
    const m = detectarColumnas("produccion", CAB_PRODUCCION);
    expect(columnasFaltantes("produccion", m)).toEqual([]);
    expect(m.unidad).toBe(5);
    expect(m.observaciones).toBe(8);
  });

  it("Salidas acepta «Nombre Común» con tilde y su «Codigo» de producto", () => {
    const m = detectarColumnas("salidas", CAB_SALIDAS);
    expect(columnasFaltantes("salidas", m)).toEqual([]);
    expect(m.especieComun).toBe(5);
    expect(m.codigoProducto).toBe(8);
    expect(m.lote).toBe(7);
  });
});

describe("leerFecha", () => {
  it("acepta el DD/MM/YYYY que imprime el SNIFFS", () => {
    expect(leerFecha("28/05/2024")).toBe("2024-05-28");
    expect(leerFecha("3/7/2026")).toBe("2026-07-03");
  });

  it("acepta ISO y Date de Excel sin correr el día", () => {
    // `entryDate` es date-only: meterle zona horaria corre el día en Lima.
    expect(leerFecha("2026-07-08")).toBe("2026-07-08");
    expect(leerFecha(new Date(Date.UTC(2026, 6, 8)))).toBe("2026-07-08");
  });

  it("lo que no es fecha devuelve null en vez de una fecha inventada", () => {
    expect(leerFecha("")).toBeNull();
    expect(leerFecha("s/f")).toBeNull();
    expect(leerFecha(null)).toBeNull();
  });
});

describe("leerNumero", () => {
  it("lee los volúmenes del reporte", () => {
    expect(leerNumero("3.010")).toBe(3.01);
    expect(leerNumero("0.862")).toBe(0.862);
    expect(leerNumero(1.724)).toBe(1.724);
  });

  it("decide el decimal por el separador de más a la derecha", () => {
    expect(leerNumero("1,234.56")).toBe(1234.56);
    expect(leerNumero("1.234,56")).toBe(1234.56);
  });

  it("una coma sola: decimal si deja 1-2 dígitos, miles si deja 3", () => {
    expect(leerNumero("0,5")).toBe(0.5);
    expect(leerNumero("12,75")).toBe(12.75);
    expect(leerNumero("1,234")).toBe(1234);
  });

  it("lo que no es número devuelve null, nunca 0", () => {
    // Un 0 finge un volumen medido y descuadra el saldo del libro.
    expect(leerNumero("")).toBeNull();
    expect(leerNumero("—")).toBeNull();
    expect(leerNumero(null)).toBeNull();
  });
});

describe("parsearFilas", () => {
  const mapeo = detectarColumnas("ingresos", CAB_INGRESOS);
  const fila = (over: Partial<Record<number, unknown>> = {}) => {
    const base: unknown[] = [
      1, "28/05/2024", "GTF Primaria", "019-0000002", "3", "MADERA EN ROLLO", "Copaiba",
      "Copaifera paupera (Herzog) Dwyer", "33/B (0000010)", "3012263", "Metros Cúbicos", "3.010", "",
    ];
    for (const [i, v] of Object.entries(over)) base[Number(i)] = v;
    return base;
  };

  it("parsea una fila real del reporte con sus tipos", () => {
    const [f] = parsearFilas("ingresos", mapeo, [fila()]);
    expect(f.datos).toMatchObject({
      fecha: "2024-05-28",
      numeroDocumento: "019-0000002",
      especieComun: "Copaiba",
      codigoOrigen: "33/B (0000010)",
      codigoCtp: "3012263",
      cantidad: 3.01,
    });
    expect(f.problemas).toEqual([]);
  });

  it("numera las filas como las ve el operador en Excel", () => {
    const fs = parsearFilas("ingresos", mapeo, [fila(), fila()], 2);
    expect(fs.map((f) => f.fila)).toEqual([2, 3]);
  });

  it("una fila sin especie se marca pero NO frena el archivo", () => {
    // Abortar entero por una celda obliga a rehacer las otras doscientas.
    const fs = parsearFilas("ingresos", mapeo, [fila({ 6: "" }), fila()]);
    expect(fs[0].problemas).toContain("Falta Nombre Común");
    expect(fs[1].problemas).toEqual([]);
    expect(resumirParseo(fs)).toEqual({ listas: 1, conProblemas: 1 });
  });

  it("las filas vacías del pie del reporte no cuentan como error", () => {
    // El SNIFFS deja filas en blanco y un «DETALLE DE OBSERVACIONES» al final.
    const fs = parsearFilas("ingresos", mapeo, [fila(), ["", "", "", "", "", "", "", "", "", "", "", "", ""]]);
    expect(fs).toHaveLength(1);
  });

  it("una columna que el archivo no trae queda en null, no rompe", () => {
    const cab = CAB_INGRESOS.filter((c) => c !== "Codigo de CTP");
    const sinCtp = detectarColumnas("ingresos", cab);
    // La fila también pierde esa celda: si no, los índices se corren y el test
    // estaría probando otra cosa.
    const celdas = fila().filter((_, i) => i !== 9);
    const fs = parsearFilas("ingresos", sinCtp, [celdas]);
    expect(fs[0].datos.codigoCtp).toBeNull();
    expect(fs[0].datos.cantidad).toBe(3.01);
    expect(fs[0].problemas).toEqual([]); // no es obligatoria
  });
});

describe("integridad de la tabla de formatos", () => {
  it("ningún formato tiene claves repetidas", () => {
    for (const [formato, cols] of Object.entries(COLUMNAS_POR_FORMATO)) {
      const claves = cols.map((c) => c.clave);
      expect(new Set(claves).size, `claves duplicadas en ${formato}`).toBe(claves.length);
    }
  });

  it("toda columna declara al menos un alias", () => {
    for (const cols of Object.values(COLUMNAS_POR_FORMATO)) {
      for (const c of cols) expect(c.alias.length, `${c.clave} sin alias`).toBeGreaterThan(0);
    }
  });
});

describe("aCentimetros · los diámetros del Apartado 2", () => {
  it("convierte los metros del formato a los centímetros de la base", () => {
    // Un 0.60 guardado como cm sería un tronco de 6 mm.
    expect(aCentimetros(0.6)).toBe(60);
    expect(aCentimetros(0.85)).toBe(85);
  });

  it("deja como está lo que YA viene en centímetros", () => {
    // El reporte de la captura muestra «60» y «59» bajo «Diametro Mayor (m)»:
    // confiar en la unidad declarada guardaría basura en la mitad de los casos.
    expect(aCentimetros(60)).toBe(60);
    expect(aCentimetros(85)).toBe(85);
  });

  it("sin diámetro devuelve null, no 0", () => {
    expect(aCentimetros(null)).toBeNull();
    expect(aCentimetros(0)).toBeNull();
    expect(aCentimetros(undefined)).toBeNull();
  });
});

describe("round-trip · la plantilla se importa a sí misma", () => {
  it("las cabeceras que ESCRIBE la plantilla son las que RECONOCE el importador", () => {
    // Es la garantía de que no haya dos formatos: la plantilla y el parser
    // salen de la misma tabla, así que agregar una columna aparece en las dos
    // puntas a la vez o en ninguna.
    // Sólo las secciones del LIBRO: los inventarios no tienen plantilla porque
    // el formato lo emite el sistema del aserradero, no el SNIFFS.
    for (const formato of FORMATOS_LIBRO) {
      const cabeceras = cabecerasDePlantilla(formato);
      expect(detectarFormato(cabeceras)?.formato, `la plantilla de ${formato} no se reconoce`).toBe(formato);
      expect(columnasFaltantes(formato, detectarColumnas(formato, cabeceras)), `faltan columnas en ${formato}`).toEqual([]);
    }
  });

  it("cada sección declara todas sus columnas, sin huecos", () => {
    for (const formato of FORMATOS_LIBRO) {
      expect(cabecerasDePlantilla(formato).length).toBe(COLUMNAS_POR_FORMATO[formato].length);
      expect(cabecerasDePlantilla(formato).every((c) => c.trim().length > 0)).toBe(true);
    }
  });
});
