import { describe, it, expect } from "vitest";
import {
  claveProducto,
  cuadrosResumen,
  esLineaProduccion,
  esTroza,
  LINEAS_PRODUCCION,
  resumen1Trozas,
  resumen2Productos,
  resumen3Balance,
  type EntradaResumenes,
} from "@/lib/forestal/loctp-resumenes";

/**
 * Los cuadros resumen son lo que un fiscalizador lee primero: si un número no
 * cierra contra las secciones del libro, la observación es inmediata. Y un 0
 * donde el dato no existe AFIRMA que no hubo movimiento — por eso hay tests
 * dedicados a que esos casilleros salgan vacíos (ADR-311).
 */

const BASE: EntradaResumenes = {
  ingresos: [
    {
      especie: "Tornillo",
      cientifico: "Cedrelinga catenaeformis",
      cites: false,
      volumenM3: 10,
      piezas: 8,
      tipoProducto: "rolliza",
      consumidoM3: 6,
    },
    {
      especie: "Shihuahuaco",
      cientifico: "Dipteryx micrantha",
      cites: true,
      volumenM3: 5,
      piezas: 4,
      tipoProducto: "rolliza",
      consumidoM3: 0,
    },
    // Producto que entra YA transformado: va al Resumen 2, no al 1.
    {
      especie: "Tornillo",
      cientifico: "Cedrelinga catenaeformis",
      cites: false,
      volumenM3: 2,
      piezas: 0,
      tipoProducto: "aserrada",
      consumidoM3: 0,
    },
  ],
  produccion: [
    {
      especie: "Tornillo",
      cientifico: "Cedrelinga catenaeformis",
      tipoProducto: "aserrada",
      unidad: "m3",
      cantidad: 4.5,
      consumidoM3: 6,
      lineaProduccion: "LP",
      lote: "L-2026-001",
    },
  ],
  salidas: [
    {
      especie: "Tornillo",
      cientifico: "Cedrelinga catenaeformis",
      tipoProducto: "aserrada",
      unidad: "m3",
      cantidad: 3,
      lote: "L-2026-001",
    },
  ],
};

describe("LO-CTP · Cuadro Resumen 1 (trozas)", () => {
  it("separa trozas de productos transformados", () => {
    const r1 = resumen1Trozas(BASE);
    expect(r1.map((f) => f.especie)).toEqual(["Shihuahuaco", "Tornillo"]);
    // El ingreso de madera aserrada NO suma acá.
    expect(r1.find((f) => f.especie === "Tornillo")?.ingresado.volumen).toBe(10);
  });

  it("cierra el saldo: inicial + ingresado − consumido − salido", () => {
    const r1 = resumen1Trozas({
      ...BASE,
      inicial: { trozasM3: { Tornillo: 3 }, productos: {} },
      salidas: [{ especie: "Tornillo", cientifico: null, tipoProducto: "rolliza", unidad: "m3", cantidad: 1, lote: null }],
    });
    const t = r1.find((f) => f.especie === "Tornillo")!;
    expect(t.inicial.volumen).toBe(3);
    expect(t.ingresado.volumen).toBe(10);
    expect(t.consumido.volumen).toBe(6);
    expect(t.salido.volumen).toBe(1);
    expect(t.saldo.volumen).toBe(6); // 3 + 10 − 6 − 1
  });

  it("las piezas consumidas van VACÍAS, no en cero (el consumo se atribuye en m³)", () => {
    const t = resumen1Trozas(BASE).find((f) => f.especie === "Tornillo")!;
    expect(t.ingresado.piezas).toBe(8);
    expect(t.consumido.piezas).toBeNull();
    expect(t.saldo.piezas).toBeNull();
  });

  it("el retrozado va vacío porque el módulo no registra el Apartado 2", () => {
    const t = resumen1Trozas(BASE).find((f) => f.especie === "Tornillo")!;
    expect(t.retrozado.piezas).toBeNull();
    expect(t.deRetrozado.piezas).toBeNull();
  });

  it("una especie que sólo tiene stock inicial igual aparece en el cuadro", () => {
    const r1 = resumen1Trozas({
      ingresos: [],
      produccion: [],
      salidas: [],
      inicial: { trozasM3: { Capirona: 7.5 }, productos: {} },
    });
    expect(r1).toHaveLength(1);
    expect(r1[0]).toMatchObject({ especie: "Capirona" });
    expect(r1[0].saldo.volumen).toBe(7.5);
  });

  it("marca CITES si algún movimiento de la especie lo trae", () => {
    expect(resumen1Trozas(BASE).find((f) => f.especie === "Shihuahuaco")?.cites).toBe(true);
  });
});

describe("LO-CTP · Cuadro Resumen 2 (productos transformados)", () => {
  it("agrupa por especie + tipo + unidad y cierra el saldo", () => {
    const r2 = resumen2Productos(BASE);
    const aserrada = r2.find((f) => f.tipoProducto === "aserrada")!;
    expect(aserrada.ingresado).toBe(2); // el ingreso ya transformado
    expect(aserrada.producido).toBe(4.5);
    expect(aserrada.salido).toBe(3);
    expect(aserrada.saldo).toBe(3.5); // 0 + 2 + 4.5 − 0 − 3
  });

  it("la misma especie con distinta unidad son filas distintas", () => {
    const r2 = resumen2Productos({
      ...BASE,
      produccion: [
        { ...BASE.produccion[0], unidad: "m3", cantidad: 1 },
        { ...BASE.produccion[0], unidad: "pt", cantidad: 500 },
      ],
    });
    const aserradas = r2.filter((f) => f.tipoProducto === "aserrada");
    expect(aserradas.map((f) => f.unidad).sort()).toEqual(["m3", "pt"]);
  });

  it("la clave del cuadro es especie|tipo|unidad", () => {
    expect(claveProducto("Tornillo", "aserrada", "pt")).toBe("Tornillo|aserrada|pt");
    expect(claveProducto(null, null, null)).toBe("—|—|m3");
  });
});

describe("LO-CTP · Cuadro Resumen 3 (balance por lote)", () => {
  it("calcula el rendimiento cuando las unidades coinciden", () => {
    const [f] = resumen3Balance(BASE);
    expect(f.lote).toBe("L-2026-001");
    expect(f.lineaProduccion).toBe("LP");
    expect(f.cantidadConsumida).toBe(6);
    expect(f.cantidadProducida).toBe(4.5);
    expect(f.rendimientoPct).toBe(75);
    expect(f.factorConversion).toBeNull();
    expect(f.salido).toBe(3);
    expect(f.stock).toBe(1.5);
  });

  it("con unidades distintas da FACTOR de conversión y no un porcentaje sin sentido", () => {
    const [f] = resumen3Balance({
      ...BASE,
      produccion: [{ ...BASE.produccion[0], unidad: "pt", cantidad: 1200 }],
      salidas: [],
    });
    expect(f.rendimientoPct).toBeNull();
    expect(f.factorConversion).toBe("200 pt/m³");
  });

  it("la producción sin lote no se descarta: se agrupa aparte", () => {
    const [f] = resumen3Balance({
      ...BASE,
      produccion: [{ ...BASE.produccion[0], lote: null }],
      salidas: [],
    });
    expect(f.lote).toBe("(sin lote)");
  });

  it("el reproceso va vacío mientras no se registre como tal", () => {
    expect(resumen3Balance(BASE)[0].consumidoReproceso).toBeNull();
  });

  it("separa las líneas de producción LP y LRE del mismo lote", () => {
    const filas = resumen3Balance({
      ...BASE,
      produccion: [
        { ...BASE.produccion[0], lineaProduccion: "LP", cantidad: 4 },
        { ...BASE.produccion[0], lineaProduccion: "LRE", cantidad: 1, consumidoM3: 2 },
      ],
      salidas: [],
    });
    expect(filas.map((f) => f.lineaProduccion)).toEqual(["LP", "LRE"]);
    // Lo salido no se cuenta dos veces sobre el mismo lote.
    expect(filas.filter((f) => f.salido > 0)).toHaveLength(0);
  });

  it("no cuenta dos veces la salida de un lote con dos filas", () => {
    const filas = resumen3Balance({
      ...BASE,
      produccion: [
        { ...BASE.produccion[0], tipoProducto: "aserrada", cantidad: 4 },
        { ...BASE.produccion[0], tipoProducto: "listones", cantidad: 2 },
      ],
    });
    expect(filas.reduce((a, f) => a + f.salido, 0)).toBe(3);
  });
});

describe("LO-CTP · clasificación y catálogos", () => {
  it("reconoce las trozas por su nombre de producto", () => {
    expect(esTroza("rolliza")).toBe(true);
    expect(esTroza("Troza larga")).toBe(true);
    expect(esTroza("aserrada")).toBe(false);
    // Sin tipo, se asume troza: es la materia prima por defecto del CTP.
    expect(esTroza(null)).toBe(true);
  });

  it("LP y LRE siguen siendo las dos primeras, con su código intacto", () => {
    // El catálogo se amplió a 4 en ADR-314 (LREM, LPC). Lo que NO puede cambiar
    // es el código ni la posición de LP y LRE: el Cuadro Resumen 3 agrupa por
    // ese valor y renombrarlos partiría en dos las corridas ya registradas.
    // Por eso se afirma el prefijo y no el conjunto cerrado: el test protegía
    // "que sean sólo dos", que nunca fue la regla, en vez de "que éstas dos no
    // se muevan", que sí lo es.
    expect(LINEAS_PRODUCCION.map((l) => l.valor).slice(0, 2)).toEqual(["LP", "LRE"]);
    expect(esLineaProduccion("LP")).toBe(true);
    expect(esLineaProduccion("LRE")).toBe(true);
    expect(esLineaProduccion("otra")).toBe(false);
  });

  it("los tres cuadros salen de una sola pasada", () => {
    const { resumen1, resumen2, resumen3 } = cuadrosResumen(BASE);
    expect(resumen1.length).toBeGreaterThan(0);
    expect(resumen2.length).toBeGreaterThan(0);
    expect(resumen3.length).toBeGreaterThan(0);
  });
});
