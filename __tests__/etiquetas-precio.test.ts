// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  EAN_G,
  EAN_L,
  EAN_PARIDAD,
  EAN_R,
  codigoDeBarras,
  digitoVerificadorEan13,
  esEan13Valido,
  modulosCode128,
  modulosEan13,
  modulosTotales,
  tramosDeBarras,
  valoresCode128,
} from "@/lib/etiquetas/codigo-barras";
import {
  CANTIDAD_MAX_POR_PRODUCTO,
  ETIQUETAS_MAX,
  armarEtiqueta,
  armarTanda,
  cambioEsDeHoy,
  cambioEsDeLaSemana,
  diaLima,
  etiquetasPedidas,
  hojasNecesarias,
  medidaDeBarras,
  montoTexto,
  nombreCorto,
  posicionEnHoja,
  precioAnteriorVigente,
  unidadTexto,
  type ProductoEtiquetable,
} from "@/lib/etiquetas/precio";
import { pdfDeEtiquetas } from "@/lib/etiquetas/precio-pdf";

/** Decodifica 95 módulos de EAN-13 con las tablas de la norma: el encoder no se prueba contra sí mismo. */
function decodificarEan13(bits: string): string {
  expect(bits.slice(0, 3)).toBe("101");
  expect(bits.slice(45, 50)).toBe("01010");
  expect(bits.slice(92)).toBe("101");
  let paridad = "";
  let izq = "";
  for (let i = 0; i < 6; i++) {
    const t = bits.slice(3 + i * 7, 10 + i * 7);
    const l = EAN_L.indexOf(t);
    const g = EAN_G.indexOf(t);
    expect(l >= 0 || g >= 0, `símbolo izquierdo ${i}: ${t}`).toBe(true);
    paridad += l >= 0 ? "L" : "G";
    izq += String(l >= 0 ? l : g);
  }
  let der = "";
  for (let i = 0; i < 6; i++) der += String(EAN_R.indexOf(bits.slice(50 + i * 7, 57 + i * 7)));
  return `${EAN_PARIDAD.indexOf(paridad)}${izq}${der}`;
}

describe("EAN-13", () => {
  it("dígito verificador: ejemplos de la norma y un 775 peruano", () => {
    expect(digitoVerificadorEan13("400638133393")).toBe(1);
    expect(digitoVerificadorEan13("590123412345")).toBe(7);
    expect(digitoVerificadorEan13("775100000123")).toBe(0);
    expect(esEan13Valido("4006381333931")).toBe(true);
    expect(esEan13Valido("4006381333932")).toBe(false);
    expect(esEan13Valido("400638133393")).toBe(false);
    expect(() => digitoVerificadorEan13("12ab")).toThrow();
  });

  it("tablas: L de la norma, R = complemento de L, G = R al revés", () => {
    expect(EAN_L[0]).toBe("0001101");
    expect(EAN_R[0]).toBe("1110010");
    expect(EAN_G[0]).toBe("0100111");
    expect(EAN_G[4]).toBe("0011101");
    expect(new Set([...EAN_L, ...EAN_G, ...EAN_R]).size).toBe(30);
  });

  it("5901234123457 sale con paridad LGGLLG y los patrones exactos", () => {
    const esperado =
      "101" +
      ["0001011", "0100111", "0110011", "0010011", "0111101", "0011101"].join("") +
      "01010" +
      ["1100110", "1101100", "1000010", "1011100", "1001110", "1000100"].join("") +
      "101";
    expect(modulosEan13("5901234123457")).toBe(esperado);
    expect(esperado).toHaveLength(95);
  });

  it("ida y vuelta: 200 códigos con todos los primeros dígitos", () => {
    for (let n = 0; n < 200; n++) {
      const doce = String(n * 4999 + 100000000000 * (n % 10)).padStart(12, "0").slice(-12);
      const codigo = doce + digitoVerificadorEan13(doce);
      expect(decodificarEan13(modulosEan13(codigo))).toBe(codigo);
    }
  });
});

describe("Code 128", () => {
  it("solo dígitos y par → subconjunto C: 123456 = START C, 12, 34, 56, checksum 44", () => {
    // 105 + 12·1 + 34·2 + 56·3 = 353 → 353 mod 103 = 44
    expect(valoresCode128("123456")).toEqual([105, 12, 34, 56, 44]);
  });

  it("dígitos impares → C y el último tras CODE B: 12345", () => {
    // 105 + 12·1 + 34·2 + 100·3 + 21·4 = 569 → 569 mod 103 = 54
    expect(valoresCode128("12345")).toEqual([105, 12, 34, 100, 21, 54]);
  });

  it("alfanumérico → subconjunto B: ABC = 104, 33, 34, 35, 1", () => {
    // 104 + 33 + 34·2 + 35·3 = 310 → 310 mod 103 = 1
    expect(valoresCode128("ABC")).toEqual([104, 33, 34, 35, 1]);
    expect(valoresCode128("PJJ123C")).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55]); // ejemplo de la norma
  });

  it("módulos: arranca con START C, termina con STOP y mide 11 por símbolo + 13", () => {
    const bits = modulosCode128("123456");
    expect(bits.startsWith("11010011100")).toBe(true);
    expect(bits.endsWith("1100011101011")).toBe(true);
    expect(bits).toHaveLength(5 * 11 + 13);
  });

  it("un número de 12 dígitos ocupa ~60 % de lo que ocuparía en B (101 vs 167 módulos)", () => {
    expect(modulosCode128("123456789012")).toHaveLength(101);
    expect(modulosCode128("ABCDEFGHIJKL")).toHaveLength(167);
  });
});

describe("codigoDeBarras: qué se imprime", () => {
  it("EAN-13 válido → ean13; 13 dígitos con verificador malo → code128 tal cual", () => {
    expect(codigoDeBarras("7751000001230")?.tipo).toBe("ean13");
    const malo = codigoDeBarras("7751000001231");
    expect(malo?.tipo).toBe("code128");
    expect(malo?.valor).toBe("7751000001231");
  });

  it("vacío o larguísimo → sin barras", () => {
    expect(codigoDeBarras(null)).toBeNull();
    expect(codigoDeBarras("   ")).toBeNull();
    expect(codigoDeBarras("X".repeat(30))).toBeNull();
  });

  it("tramos: «0111001» = dos barras", () => {
    expect(tramosDeBarras("0111001")).toEqual([[1, 3], [6, 1]]);
  });
});

const AHORA = new Date("2026-10-10T15:00:00Z"); // sábado 10/10, 10:00 en Lima
const P: ProductoEtiquetable = {
  id: 7, nombre: "Arroz Costeño Extra 5 kg", categoria: "Abarrotes", precio: 24.5, unidad: "kg", barcode: "7751000001230", sku: "ARR-5",
};

describe("armado de la etiqueta", () => {
  it("monto es-PE con punto decimal y coma de miles", () => {
    expect(montoTexto(24.5)).toBe("24.50");
    expect(montoTexto(1234.5)).toBe("1,234.50");
  });

  it("unidad: c/u, el kg, por paquete, tilde en porción", () => {
    expect(unidadTexto("unidad")).toBe("c/u");
    expect(unidadTexto("")).toBe("c/u");
    expect(unidadTexto("KG")).toBe("el kg");
    expect(unidadTexto("litro")).toBe("el litro");
    expect(unidadTexto("paquete")).toBe("por paquete");
    expect(unidadTexto("porcion")).toBe("por porción");
  });

  it("nombre corto: corta en palabra con «…» y limpia espacios", () => {
    expect(nombreCorto("  Leche   Gloria  ")).toBe("Leche Gloria");
    const largo = nombreCorto("Detergente en polvo Bolívar Active Care Floral bolsa de 2,6 kilogramos", 40);
    expect(largo.length).toBeLessThanOrEqual(40);
    expect(largo.endsWith("…")).toBe(true);
    expect(largo).not.toMatch(/\s…$/);
  });

  it("día de Lima: a las 22:00 de Lima el UTC ya es mañana", () => {
    expect(diaLima("2026-10-10T03:04:30Z")).toBe("2026-10-09");
    expect(cambioEsDeHoy({ antes: 1, ahora: 2, cuando: "2026-10-10T05:30:00Z" }, AHORA)).toBe(true);
    expect(cambioEsDeHoy({ antes: 1, ahora: 2, cuando: "2026-10-10T04:30:00Z" }, AHORA)).toBe(false);
    expect(cambioEsDeLaSemana({ antes: 1, ahora: 2, cuando: "2026-10-04T15:00:00Z" }, AHORA)).toBe(true);
    expect(cambioEsDeLaSemana({ antes: 1, ahora: 2, cuando: "2026-10-03T15:00:00Z" }, AHORA)).toBe(false);
  });

  it("precio anterior: sólo una BAJA reciente que dejó el precio de hoy", () => {
    const baja = { antes: 28, ahora: 24.5, cuando: "2026-10-01T15:00:00Z" };
    expect(precioAnteriorVigente(24.5, baja, AHORA)).toBe(28);
    expect(precioAnteriorVigente(24.5, { ...baja, antes: 20 }, AHORA)).toBeNull(); // subió
    expect(precioAnteriorVigente(26, baja, AHORA)).toBeNull(); // lo cambiaron después sin historial
    expect(precioAnteriorVigente(24.5, { ...baja, cuando: "2026-08-01T15:00:00Z" }, AHORA)).toBeNull(); // viejo
    expect(precioAnteriorVigente(24.5, undefined, AHORA)).toBeNull();
  });

  it("precio anterior: un «antes» que rigió menos de un día (Deshacer) no es rebaja", () => {
    const deshacer = { antes: 12.5, ahora: 11.9, cuando: "2026-10-10T01:31:28Z", antesDesde: "2026-10-10T01:31:00Z" };
    expect(precioAnteriorVigente(11.9, deshacer, AHORA)).toBeNull();
    expect(precioAnteriorVigente(11.9, { ...deshacer, antesDesde: "2026-10-09T01:31:29Z" }, AHORA)).toBeNull(); // 1 s menos de un día
    expect(precioAnteriorVigente(11.9, { ...deshacer, antesDesde: "2026-10-09T01:31:28Z" }, AHORA)).toBe(12.5); // un día justo
    expect(precioAnteriorVigente(11.9, { ...deshacer, antesDesde: null }, AHORA)).toBe(12.5); // regía desde antes de la ventana
  });

  it("etiqueta: precio base, EAN del producto y el «antes» tachado", () => {
    const e = armarEtiqueta(P, { antes: 28, ahora: 24.5, cuando: "2026-10-10T14:00:00Z" }, AHORA);
    expect(e).toMatchObject({ precio: 24.5, precioTexto: "24.50", moneda: "S/", unidadTexto: "el kg", precioAnteriorTexto: "S/ 28.00", origenCodigo: "barcode" });
    expect(e.codigo?.tipo).toBe("ean13");
  });

  it("sin barcode usa el SKU; sin ninguno, sin barras", () => {
    expect(armarEtiqueta({ ...P, barcode: null }, undefined, AHORA)).toMatchObject({ origenCodigo: "sku", codigo: { tipo: "code128", valor: "ARR-5" } });
    expect(armarEtiqueta({ ...P, barcode: "", sku: null }, undefined, AHORA)).toMatchObject({ origenCodigo: null, codigo: null });
  });

  it("tanda: repite por cantidad, salta lo borrado, respeta topes", () => {
    const q: ProductoEtiquetable = { ...P, id: 8, nombre: "Azúcar" };
    const t = armarTanda([P, q], [{ productoId: 8, cantidad: 2 }, { productoId: 99, cantidad: 5 }, { productoId: 7, cantidad: 1 }], {}, AHORA);
    expect(t.map((e) => e.productoId)).toEqual([8, 8, 7]);
    expect(armarTanda([P], [{ productoId: 7, cantidad: 10_000 }], {}, AHORA)).toHaveLength(CANTIDAD_MAX_POR_PRODUCTO);
    const muchos = Array.from({ length: 20 }, (_, i) => ({ ...P, id: i }));
    expect(armarTanda(muchos, muchos.map((p) => ({ productoId: p.id, cantidad: 200 })), {}, AHORA)).toHaveLength(ETIQUETAS_MAX);
  });

  it("pedidas: cuenta lo pedido antes del tope para avisar «Se imprimen 2000 de N»", () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({ ...P, id: i }));
    expect(etiquetasPedidas(muchos, muchos.map((p) => ({ productoId: p.id, cantidad: 200 })))).toBe(4000);
    expect(etiquetasPedidas([P], [{ productoId: 7, cantidad: 3 }, { productoId: 99, cantidad: 5 }, { productoId: 7, cantidad: 10_000 }])).toBe(3 + CANTIDAD_MAX_POR_PRODUCTO);
  });
});

describe("hoja y barras por formato", () => {
  it("posiciones en A4 3×8 y página siguiente", () => {
    expect(posicionEnHoja(0, "a4-3x8")).toEqual({ pagina: 0, x: 0, y: 0.5 });
    expect(posicionEnHoja(4, "a4-3x8")).toEqual({ pagina: 0, x: 70, y: 37.5 });
    expect(posicionEnHoja(24, "a4-3x8")).toEqual({ pagina: 1, x: 0, y: 0.5 });
    expect(posicionEnHoja(29, "a4-3x10")).toEqual({ pagina: 0, x: 140, y: 267.3 });
    expect(hojasNecesarias(25, "a4-3x8")).toBe(2);
    expect(hojasNecesarias(30, "a4-3x10")).toBe(1);
    expect(hojasNecesarias(7, "rollo-50x25")).toBe(7);
    expect(hojasNecesarias(0, "a4-3x8")).toBe(0);
  });

  it("EAN-13 entra legible en los 3 formatos; un SKU largo no entra en el rollo", () => {
    const ean = codigoDeBarras("7751000001230")!;
    expect(modulosTotales(ean)).toBe(113);
    for (const f of ["a4-3x8", "a4-3x10", "rollo-50x25"] as const) expect(medidaDeBarras(ean, f).legible).toBe(true);
    expect(medidaDeBarras(ean, "a4-3x8").moduloMm).toBeGreaterThanOrEqual(0.28);
    const largo = codigoDeBarras("ABCD-EFGH-IJ")!; // 12 caracteres en B: 187 módulos
    expect(medidaDeBarras(largo, "rollo-50x25").legible).toBe(false);
    expect(medidaDeBarras(largo, "a4-3x8").legible).toBe(true);
  });
});

describe("PDF", () => {
  it("30 etiquetas en A4 3×8 = 2 páginas; en el rollo = 30", async () => {
    const tanda = armarTanda([P], [{ productoId: 7, cantidad: 30 }], {}, AHORA);
    const a4 = await pdfDeEtiquetas(tanda, "a4-3x8");
    expect(a4.getNumberOfPages()).toBe(2);
    expect(Math.round(a4.internal.pageSize.getWidth())).toBe(210);
    const rollo = await pdfDeEtiquetas(tanda, "rollo-50x25");
    expect(rollo.getNumberOfPages()).toBe(30);
    expect([Math.round(rollo.internal.pageSize.getWidth()), Math.round(rollo.internal.pageSize.getHeight())]).toEqual([50, 25]);
    expect(new TextDecoder().decode(new Uint8Array(rollo.output("arraybuffer")).slice(0, 5))).toBe("%PDF-");
  });
});

describe("rollo térmico: barras de puntos enteros", () => {
  it("el módulo es 2 puntos de 203 dpi; el EAN-13 va al costado y un Code 128 de 13 dígitos, abajo", () => {
    const dosPuntos = (2 * 25.4) / 203;
    const ean = medidaDeBarras(codigoDeBarras("7751000001230")!, "rollo-50x25");
    expect(ean.moduloMm).toBeCloseTo(dosPuntos, 9);
    expect(ean).toMatchObject({ legible: true, abajo: false });
    const c128 = medidaDeBarras(codigoDeBarras("7751271001003")!, "rollo-50x25"); // verificador malo → Code 128
    expect(c128.moduloMm).toBeCloseTo(dosPuntos, 9);
    expect(c128).toMatchObject({ legible: true, abajo: true });
    expect(medidaDeBarras(codigoDeBarras("ABCD-EFGH-IJ")!, "a4-3x8").abajo).toBe(false); // en A4 nunca va abajo
  });
});
