import { describe, expect, it } from "vitest";
import {
  interpretarDetalleProduccionSniffs,
  interpretarListaProgramacionesSniffs,
  mismaEspecie,
  normalizarProductoLoctp,
  paquetesDesdeSniffs,
  pareceDetalleSniffs,
  pareceListaProgramaciones,
  sniffsRefDesdeDetalle,
} from "@/lib/forestal/sniffs-produccion-parse";

/**
 * Lo que lee «Traer del SNIFFS» (ADR-397), probado con los TRES textos reales
 * que puede recibir: el OCR de la captura ampliada (lo que sale de verdad de
 * tesseract a 2×), el OCR sin ampliar (pierde los puntos decimales) y el texto
 * que copia el portapapeles al seleccionar la tabla en el navegador.
 */

/** Salida real de tesseract.js sobre la captura de Brandon, ampliada 2×. */
const OCR_2X = `Detalle de la programacion de produccion: *
N* de Lote: Fecha Inicio: Fecha Fin:
18-2026 01/08/2026 01/10/2026
Especie: . . .
P Cedrelinga cateniformis - TORNILLO
Descripcion:
Volumen consumido:
Resumen de Produccion por PMF y Producto
Especie Producto Volumen (m3) Porcentaje aprovechado (%)
Cedrelinga cateniformis - TORNILLO MADERA ASERRADA (COMERCIAL) 0.002 0.01
Cedrelinga cateniformis - TORNILLO MADERA ASERRADA (PAQUETERIA CORTA) 9.753 35.44
Cedrelinga cateniformis - TORNILLO MADERA ASERRADA (PAQUETERIA LARGA) 5.456 19.82
Cerrar`;

/** La misma captura sin ampliar: se come puntos decimales y una letra. */
const OCR_1X = `Detalle de la programacion de produccion: *
N” de Lote: Fecha Inicio: Fecha Fin:
18-2026 01/08/2026 01/10/2026
Especie: " de
P Cedrelinga cateniformis - TORNILLO
Descripcion:
Volumen consumido:
Resumen de Produccion por PMF y Producto
Especie Producto Volumen (m3) Porcentaje aprovechado (%)
Cedreliga cateniformis - TORNILLO MADERA ASERRADA (COMERCIAL) 0.002 001
Cedreliga cateniformis - TORNILLO MADERA ASERRADA (PAQUETERIA CORTA) 9753 35.44
Cedreliga cateniformis - TORNILLO MADERA ASERRADA (PAQUETERIA LARGA) 5.456 1982
Cerrar`;

/** Seleccionar la tabla en el SNIFFS y Ctrl+C: celdas separadas por tabs. */
const PORTAPAPELES = [
  "Especie\tProducto\tVolumen (m3)\tPorcentaje aprovechado (%)",
  "Cedrelinga cateniformis - TORNILLO\tMADERA ASERRADA (COMERCIAL)\t0.002\t0.01",
  "Cedrelinga cateniformis - TORNILLO\tMADERA ASERRADA (PAQUETERÍA CORTA)\t9.753\t35.44",
  "Cedrelinga cateniformis - TORNILLO\tMADERA ASERRADA (PAQUETERIA LARGA)\t5.456\t19.82",
].join("\n");

describe("interpretarDetalleProduccionSniffs — captura ampliada (OCR 2×)", () => {
  const d = interpretarDetalleProduccionSniffs(OCR_2X, { consumidoM3: 27.522 });

  it("lee el encabezado aunque los rótulos y los valores vengan en líneas distintas", () => {
    expect(d.lote).toBe("18-2026");
    expect(d.fechaInicio).toBe("2026-08-01");
    expect(d.fechaFin).toBe("2026-10-01");
    expect(d.especieCientifica).toBe("Cedrelinga cateniformis");
    expect(d.especieComun).toBe("TORNILLO");
  });

  it("no inventa el volumen consumido si el OCR no lo leyó", () => {
    expect(d.volumenConsumidoM3).toBeNull();
  });

  it("saca las tres filas con producto del catálogo, m³ y % aprovechado", () => {
    expect(d.productos.map((p) => [p.productType, p.volumenM3, p.pctAprovechado])).toEqual([
      ["MADERA ASERRADA (COMERCIAL)", 0.002, 0.01],
      ["MADERA ASERRADA (PAQUETERIA CORTA)", 9.753, 35.44],
      ["MADERA ASERRADA (PAQUETERIA LARGA)", 5.456, 19.82],
    ]);
    expect(d.productos.every((p) => !p.dudoso)).toBe(true);
    expect(d.productos[0].especie).toBe("TORNILLO");
    expect(d.avisos).toEqual([]);
  });

  it("no toma el encabezado de la tabla ni el título como fila", () => {
    expect(d.productos).toHaveLength(3);
  });
});

describe("interpretarDetalleProduccionSniffs — OCR flojo (1×)", () => {
  const d = interpretarDetalleProduccionSniffs(OCR_1X, { consumidoM3: 27.522 });

  it("reinterpreta «9753» como 9.753 y lo MARCA dudoso con aviso", () => {
    const corta = d.productos.find((p) => p.productType === "MADERA ASERRADA (PAQUETERIA CORTA)");
    expect(corta?.volumenM3).toBe(9.753);
    expect(corta?.dudoso).toBe(true);
    expect(corta?.volumenLeido).toBe("9753");
    expect(d.avisos.some((a) => a.includes("9753"))).toBe(true);
  });

  it("los números bien leídos no se tocan", () => {
    const larga = d.productos.find((p) => p.productType === "MADERA ASERRADA (PAQUETERIA LARGA)");
    expect(larga?.volumenM3).toBe(5.456);
    expect(larga?.dudoso).toBe(false);
  });

  it("el encabezado sigue saliendo aunque la especie de la fila venga mal escrita", () => {
    expect(d.lote).toBe("18-2026");
    expect(d.especieCientifica).toBe("Cedrelinga cateniformis");
  });
});

describe("interpretarDetalleProduccionSniffs — texto copiado del portapapeles", () => {
  const d = interpretarDetalleProduccionSniffs(PORTAPAPELES);

  it("lee las celdas separadas por tabs y tolera el acento de «PAQUETERÍA»", () => {
    expect(d.productos.map((p) => p.productType)).toEqual([
      "MADERA ASERRADA (COMERCIAL)",
      "MADERA ASERRADA (PAQUETERIA CORTA)",
      "MADERA ASERRADA (PAQUETERIA LARGA)",
    ]);
    expect(d.productos.map((p) => p.volumenM3)).toEqual([0.002, 9.753, 5.456]);
  });

  it("sin encabezado, lo que no está vuelve null — no se inventa", () => {
    expect(d.lote).toBeNull();
    expect(d.fechaInicio).toBeNull();
    expect(d.volumenConsumidoM3).toBeNull();
    /* La especie sí: cada fila la trae. */
    expect(d.especieComun).toBe("TORNILLO");
  });

  it("lee el volumen consumido y el lote cuando vienen en la misma línea que su rótulo", () => {
    const con = interpretarDetalleProduccionSniffs(`N° de Lote:\tLA-2026-007\nVolumen consumido:\t27.522\n${PORTAPAPELES}`);
    expect(con.lote).toBe("LA-2026-007");
    expect(con.volumenConsumidoM3).toBe(27.522);
  });
});

describe("interpretarDetalleProduccionSniffs — lo que no es esta pantalla", () => {
  it("un texto cualquiera no da filas y lo dice", () => {
    const d = interpretarDetalleProduccionSniffs("Hola, ¿cómo va el aserradero?");
    expect(d.productos).toEqual([]);
    expect(d.avisos[0]).toMatch(/No encontré filas de producto/);
  });

  it("más producto que materia prima se marca, no se corrige", () => {
    const d = interpretarDetalleProduccionSniffs("X\tMADERA ASERRADA (TABLA)\t40.5\t50", { consumidoM3: 27.522 });
    expect(d.productos[0].volumenM3).toBe(40.5);
    expect(d.productos[0].dudoso).toBe(true);
    expect(d.avisos[0]).toMatch(/más que los 27.522 m³ consumidos/);
  });
});

describe("normalizarProductoLoctp", () => {
  it("mapea al valor oficial sin importar acentos, mayúsculas o paréntesis", () => {
    expect(normalizarProductoLoctp("Madera aserrada (paquetería corta)")).toBe("MADERA ASERRADA (PAQUETERIA CORTA)");
    expect(normalizarProductoLoctp("MADERA ASERRADA [TABLA]")).toBe("MADERA ASERRADA (TABLA)");
    expect(normalizarProductoLoctp("madera aserrada (tabla cepillada)")).toBe("MADERA ASERRADA (TABLA CEBILLADA)");
  });

  it("el producto más largo le gana al genérico y lo desconocido vuelve null", () => {
    expect(normalizarProductoLoctp("MADERA ASERRADA")).toBe("MADERA ASERRADA");
    expect(normalizarProductoLoctp("MADERA ASERRADA (LARGA ANGOSTA)")).toBe("MADERA ASERRADA (LARGA ANGOSTA)");
    expect(normalizarProductoLoctp("CHAPAS DECORATIVAS")).toBeNull();
  });
});

describe("pareceDetalleSniffs", () => {
  it("reconoce la pantalla y el texto de la tabla", () => {
    expect(pareceDetalleSniffs(OCR_2X)).toBe(true);
    expect(pareceDetalleSniffs(PORTAPAPELES)).toBe(true);
  });
  it("no se dispara con una palabra suelta ni con texto corto", () => {
    expect(pareceDetalleSniffs("Tornillo")).toBe(false);
    expect(pareceDetalleSniffs("turno de la tarde, sierra 2")).toBe(false);
  });
});

describe("mismaEspecie", () => {
  it("compara sin acentos ni mayúsculas y acepta contener", () => {
    expect(mismaEspecie("Tornillo", "TORNILLO")).toBe(true);
    expect(mismaEspecie("Cedrelinga cateniformis - TORNILLO", "TORNILLO")).toBe(true);
    expect(mismaEspecie("Capirona", "TORNILLO")).toBe(false);
    expect(mismaEspecie(null, "TORNILLO")).toBe(true);
  });
});

describe("paquetesDesdeSniffs", () => {
  it("un paquete por fila, con código correlativo, presentación del producto y sin piezas inventadas", () => {
    let n = 0;
    const paquetes = paquetesDesdeSniffs(
      [
        { productType: "MADERA ASERRADA (COMERCIAL)", volumenM3: 0.002 },
        { productType: "MADERA ASERRADA (PAQUETERIA CORTA)", volumenM3: 9.753 },
        { productType: "MADERA ASERRADA (TABLA)", volumenM3: 0 },
      ],
      { siguienteCodigo: (ocupados) => { n++; return `PQ-${String(ocupados.length + 1).padStart(3, "0")}`; }, lote: "18-2026", ahora: 1 },
    );
    expect(paquetes.map((p) => p.codigo)).toEqual(["PQ-001", "PQ-002"]);
    expect(n).toBe(2);
    expect(paquetes[0]).toMatchObject({
      productType: "MADERA ASERRADA (COMERCIAL)",
      presentacion: "PIEZAS",
      cantidad: 0,
      volumenM3: 0.002,
      espesorCm: null,
      observations: "Traído del SNIFFS · lote 18-2026",
    });
    expect(paquetes[1].presentacion).toBe("PAQUETES");
  });
});

/**
 * La LISTA de programaciones (ADR-398): la pantalla anterior al detalle, una
 * fila por lote programado. Es la que se importa de golpe.
 */
const LISTA_OCR = `Programacion de produccion
N° de Lote Fecha Inicio Fecha Fin Especie Volumen consumido Estado
18-2026 01/08/2026 01/10/2026 Cedrelinga cateniformis - TORNILLO 27.522 Finalizado por fecha limite
17-2026 04/07/2026 31/08/2026 Cedrelinga cateniformis - TORNILLO 40.115 Finalizado por fecha limite
16-2026 12/06/2026 12/08/2026 Dipteryx micrantha - SHIHUAHUACO 15.300 En proceso`;

const LISTA_TSV = [
  "N° de Lote\tFecha Inicio\tFecha Fin\tEspecie\tVolumen consumido\tEstado",
  "18-2026\t01/08/2026\t01/10/2026\tCedrelinga cateniformis - TORNILLO\t27.522\tFinalizado por fecha límite",
  "17-2026\t04/07/2026\t31/08/2026\tCedrelinga cateniformis - TORNILLO\t40.115\tEn proceso",
].join("\n");

describe("interpretarListaProgramacionesSniffs", () => {
  it("saca una fila por programación, con lote, fechas, especie, volumen y estado", () => {
    const { filas } = interpretarListaProgramacionesSniffs(LISTA_OCR);
    expect(filas.map((f) => [f.lote, f.fechaInicio, f.fechaFin, f.especieComun, f.volumenConsumidoM3])).toEqual([
      ["18-2026", "2026-08-01", "2026-10-01", "TORNILLO", 27.522],
      ["17-2026", "2026-07-04", "2026-08-31", "TORNILLO", 40.115],
      ["16-2026", "2026-06-12", "2026-08-12", "SHIHUAHUACO", 15.3],
    ]);
    expect(filas[0].estado).toMatch(/Finalizado/i);
    expect(filas[2].estado).toMatch(/En proceso/i);
    expect(filas[0].especieCientifica).toBe("Cedrelinga cateniformis");
  });

  it("no toma el encabezado ni el título como programación", () => {
    expect(interpretarListaProgramacionesSniffs(LISTA_OCR).filas).toHaveLength(3);
  });

  it("lee igual el texto copiado con tabs y con acento en el estado", () => {
    const { filas } = interpretarListaProgramacionesSniffs(LISTA_TSV);
    expect(filas).toHaveLength(2);
    expect(filas[1]).toMatchObject({ lote: "17-2026", volumenConsumidoM3: 40.115, especieComun: "TORNILLO" });
  });

  it("avisa de lo que falta en vez de inventarlo", () => {
    const r = interpretarListaProgramacionesSniffs("01/08/2026 01/10/2026 Cedrelinga cateniformis - TORNILLO");
    expect(r.filas[0].lote).toBeNull();
    expect(r.filas[0].volumenConsumidoM3).toBeNull();
    expect(r.avisos.some((a) => a.includes("sin N° de lote"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("sin volumen consumido"))).toBe(true);
  });

  it("no confunde la fecha con el volumen ni con el N° de lote", () => {
    const { filas } = interpretarListaProgramacionesSniffs(LISTA_OCR);
    expect(filas.every((f) => f.volumenConsumidoM3! < 1000)).toBe(true);
    expect(filas.map((f) => f.lote)).not.toContain("01/08/2026");
  });

  it("un texto sin filas de fecha no es una lista", () => {
    expect(pareceListaProgramaciones("hola")).toBe(false);
    expect(pareceListaProgramaciones(LISTA_OCR)).toBe(true);
    expect(pareceListaProgramaciones("una sola fila 01/08/2026 TORNILLO")).toBe(false);
  });
});

describe("sniffsRefDesdeDetalle", () => {
  it("guarda sólo la foto para cotejar: sin avisos ni marcas de lectura", () => {
    const d = interpretarDetalleProduccionSniffs(OCR_2X, { consumidoM3: 27.522 });
    const ref = sniffsRefDesdeDetalle(d, "captura", new Date("2026-09-08T12:00:00.000Z"));
    expect(ref).toMatchObject({
      lote: "18-2026",
      fechaInicio: "2026-08-01",
      especieComun: "TORNILLO",
      fuente: "captura",
      leidoEn: "2026-09-08T12:00:00.000Z",
    });
    expect(ref.productos).toHaveLength(3);
    expect(ref.productos[1]).toEqual({
      productType: "MADERA ASERRADA (PAQUETERIA CORTA)",
      productoCrudo: "MADERA ASERRADA (PAQUETERIA CORTA)",
      volumenM3: 9.753,
      pctAprovechado: 35.44,
    });
    expect(ref).not.toHaveProperty("avisos");
  });
});
