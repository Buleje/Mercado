import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsearConsultaGtf } from "@/lib/forestal/serfor-gtf";
import {
  LINEAS_PRODUCCION,
  PRESENTACIONES_LOCTP,
  RENDIMIENTO_META,
  TIPOS_PRODUCTO_LOCTP,
  TIPOS_PRODUCTO_SALIDA,
  aPieTablar,
  esLineaProduccion,
  juzgarRendimiento,
  presentacionSugerida,
  productoDelTipoComercial,
  sugerirCodigoPaquete,
} from "@/lib/forestal/loctp-catalogos";

/**
 * ADR-314 — los catálogos del negocio maderero.
 *
 * El control que importa: que lo que declara una GTF real de SERFOR esté en
 * nuestros catálogos. Un catálogo que no acepta lo que dice el documento
 * obligaría a elegir "Otro" para el caso más común.
 */

const guiaReal = parsearConsultaGtf(
  readFileSync(join(process.cwd(), "__tests__/fixtures/serfor-gtf-encontrada.html"), "utf8"),
  "1-19-0313629",
).gtf!;

describe("Los catálogos aceptan lo que declara SERFOR", () => {
  it("el tipo de producto de la guía real está en el catálogo", () => {
    for (const p of guiaReal.productos) {
      expect(TIPOS_PRODUCTO_LOCTP.some((t) => t.valor === p.tipoProducto)).toBe(true);
    }
  });

  it("y su forma de presentación también", () => {
    for (const p of guiaReal.productos) {
      expect(PRESENTACIONES_LOCTP).toContain(p.presentacion as never);
    }
  });
});

describe("Tipos de producto", () => {
  it("separa lo que ENTRA de lo que SALE del aserradero", () => {
    // "Madera en rollo" es materia prima: ofrecerla como producto terminado
    // dejaría registrar una salida de trozas como si fuera producción.
    expect(TIPOS_PRODUCTO_SALIDA.some((t) => t.valor === "MADERA EN ROLLO")).toBe(false);
    expect(TIPOS_PRODUCTO_SALIDA.length).toBeGreaterThan(15);
  });

  it("no hay valores repetidos", () => {
    const vals = TIPOS_PRODUCTO_LOCTP.map((t) => t.valor);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it("siempre deja una salida para lo que no está listado", () => {
    expect(TIPOS_PRODUCTO_SALIDA.some((t) => t.valor === "OTRO")).toBe(true);
  });
});

describe("Presentación sugerida", () => {
  it("la paquetería va en paquetes y las tablillas en tablillas", () => {
    expect(presentacionSugerida("MADERA ASERRADA (PAQUETERIA LARGA)")).toBe("PAQUETES");
    expect(presentacionSugerida("MADERA ASERRADA (TABLILLAS)")).toBe("TABLILLAS");
    expect(presentacionSugerida("MADERA EN ROLLO")).toBe("TROZAS");
  });

  it("cuando no es inequívoca no adivina", () => {
    expect(presentacionSugerida("MADERA ASERRADA")).toBeNull();
    expect(presentacionSugerida(null)).toBeNull();
  });

  it("lo que sale atado va en PAQUETES y lo que se cuenta suelto, en PIEZAS", () => {
    // La regla del aserradero (Brandon, 2026-08-08): el producto ya dice qué es,
    // la presentación dice cómo viene. Listones sueltos son PIEZAS, no LISTONES.
    for (const p of ["PAQUETERIA CORTA", "PAQUETERIA LARGA"]) {
      expect(presentacionSugerida(`MADERA ASERRADA (${p})`)).toBe("PAQUETES");
    }
    for (const p of ["COMERCIAL", "TABLA", "CORTA", "LARGA ANGOSTA", "BLOQUES", "LISTONES", "POSTE"]) {
      expect(presentacionSugerida(`MADERA ASERRADA (${p})`)).toBe("PIEZAS");
    }
  });

  it("toda sugerencia existe en el catálogo", () => {
    for (const t of TIPOS_PRODUCTO_LOCTP) {
      const p = presentacionSugerida(t.valor);
      if (p) expect(PRESENTACIONES_LOCTP).toContain(p);
    }
  });
});

describe("Líneas de producción", () => {
  it("LP y LRE conservan su código: el Cuadro Resumen 3 agrupa por él", () => {
    // Renombrarlos partiría en dos las corridas ya registradas.
    expect(LINEAS_PRODUCCION[0]!.valor).toBe("LP");
    expect(LINEAS_PRODUCCION[1]!.valor).toBe("LRE");
    expect(esLineaProduccion("LP")).toBe(true);
    expect(esLineaProduccion("LRE")).toBe(true);
  });

  it("suma las dos que faltaban, con código propio", () => {
    expect(esLineaProduccion("LREM")).toBe(true);
    expect(esLineaProduccion("LPC")).toBe(true);
    expect(esLineaProduccion("XX")).toBe(false);
  });
});

describe("Rendimiento contra la meta", () => {
  it("recibe PORCENTAJE, sin adivinar la unidad", () => {
    // Aceptar fracción y porcentaje a la vez es indecidible: con 1.2 no hay
    // forma de saber si son 1.2% o 120%.
    expect(juzgarRendimiento(60)).toBe("bueno");
    expect(juzgarRendimiento(40)).toBe("bajo");
    expect(juzgarRendimiento(1.2)).toBe("bajo");
  });

  it("la frontera es la meta, incluida", () => {
    expect(juzgarRendimiento(RENDIMIENTO_META * 100)).toBe("bueno");
    expect(juzgarRendimiento(RENDIMIENTO_META * 100 - 0.01)).toBe("bajo");
  });

  it("por encima de 100% no es excelente: es imposible", () => {
    // De 1 m³ de troza no salen 1.2 m³ de tabla. Casi siempre es dato mal cargado.
    expect(juzgarRendimiento(120)).toBe("sospechoso");
  });

  it("sin dato no se juzga", () => {
    expect(juzgarRendimiento(null)).toBeNull();
    expect(juzgarRendimiento(0)).toBeNull();
    expect(juzgarRendimiento(NaN)).toBeNull();
  });
});

describe("Pie tablar", () => {
  it("convierte para mostrar, con el factor peruano", () => {
    expect(aPieTablar(1)).toBe(424);
    expect(aPieTablar(3.268)).toBeCloseTo(1385.6, 1);
  });

  it("sin volumen no inventa", () => {
    expect(aPieTablar(null)).toBeNull();
    expect(aPieTablar(NaN)).toBeNull();
  });
});

/**
 * Código de paquete sugerido (ADR-314 · port de AppForestal `produccion`).
 *
 * Es una SUGERENCIA y no un correlativo del sistema: el código lo pinta una
 * persona en el atado y muchas plantas ya tienen su forma de numerarlo. Imponer
 * un formato obligaría a que el papel y la pantalla digan cosas distintas.
 */
describe("sugerirCodigoPaquete", () => {
  it("lleva la línea y la fecha del turno", () => {
    const c = sugerirCodigoPaquete("2026-08-01T00:00:00.000Z", "LP");
    expect(c).toMatch(/^LP-260801-\d{4}$/);
  });

  it("distingue la línea de recuperación", () => {
    expect(sugerirCodigoPaquete("2026-08-01T00:00:00.000Z", "LRE")).toMatch(/^LRE-260801-/);
  });

  it("sin línea asume la principal", () => {
    expect(sugerirCodigoPaquete("2026-08-01T00:00:00.000Z", null)).toMatch(/^LP-/);
  });

  it("una fecha inválida no rompe el alta: cae a hoy", () => {
    expect(sugerirCodigoPaquete("no-es-fecha", "LP")).toMatch(/^LP-\d{6}-\d{4}$/);
  });
});

describe("productoDelTipoComercial · del patio al catálogo (ADR-373)", () => {
  it("traduce los tipos del cubicador al nombre del libro", () => {
    expect(productoDelTipoComercial("Comercial")).toBe("MADERA ASERRADA (COMERCIAL)");
    expect(productoDelTipoComercial("Paquetería corta")).toBe("MADERA ASERRADA (PAQUETERIA CORTA)");
    expect(productoDelTipoComercial("larga angosta")).toBe("MADERA ASERRADA (LARGA ANGOSTA)");
  });

  it("lo traducido tiene presentación; el nombre del patio no", () => {
    /* Éste es el bug que motivó el mapeo: el paquete entraba sin presentación. */
    expect(presentacionSugerida("Comercial")).toBeNull();
    expect(presentacionSugerida(productoDelTipoComercial("Comercial")!)).toBe("PIEZAS");
    expect(presentacionSugerida(productoDelTipoComercial("Paquetería larga")!)).toBe("PAQUETES");
  });

  it("«Otro» y lo desconocido no inventan un producto", () => {
    expect(productoDelTipoComercial("Otro")).toBeNull();
    expect(productoDelTipoComercial("cualquier cosa")).toBeNull();
    expect(productoDelTipoComercial(null)).toBeNull();
  });
});
