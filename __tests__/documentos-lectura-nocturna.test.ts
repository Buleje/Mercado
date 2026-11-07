import { describe, it, expect } from "vitest";
import {
  ORIGEN_LECTURA_NOCHE,
  cuantosEnEsenciales,
  ordenarParaLeer,
  presupuestoDeTienda,
  sugerenciaDelTextoLeido,
  textoDelPapel,
} from "@/lib/documentos/lectura-nocturna";
import { TAG_ESENCIAL } from "@/lib/documentos/esenciales";
import { MARCA_DESC_PROPIA, construirTextoBuscable } from "@/lib/documents/texto-buscable";

const carpetas = [
  { id: "ese", name: "Papeles del negocio", parentId: null, tags: [TAG_ESENCIAL] },
  { id: "ese-hija", name: "Licencias", parentId: "ese", tags: [] },
  { id: "otra", name: "Fotos varias", parentId: null, tags: [] },
];

describe("ordenarParaLeer", () => {
  it("Esenciales (y sus subcarpetas) primero, después menos intentos, después lo más nuevo", () => {
    const docs = [
      { id: "suelto-nuevo", folderId: null, uploadedAt: "2026-10-20T00:00:00Z", intentos: 0 },
      { id: "otra-viejo", folderId: "otra", uploadedAt: "2026-01-01T00:00:00Z", intentos: 0 },
      { id: "hija-fallo", folderId: "ese-hija", uploadedAt: "2026-10-23T00:00:00Z", intentos: 2 },
      { id: "ese-viejo", folderId: "ese", uploadedAt: "2025-05-01T00:00:00Z", intentos: 0 },
      { id: "suelto-fallo", folderId: null, uploadedAt: "2026-10-22T00:00:00Z", intentos: 1 },
    ];
    expect(ordenarParaLeer(docs, carpetas).map((d) => d.id)).toEqual([
      "ese-viejo",
      "hija-fallo",
      "suelto-nuevo",
      "otra-viejo",
      "suelto-fallo",
    ]);
    expect(cuantosEnEsenciales(docs, carpetas)).toBe(2);
  });

  it("sin carpetas Esenciales queda el orden por intentos y fecha", () => {
    const docs = [
      { id: "a", folderId: "x", uploadedAt: new Date("2026-01-01"), intentos: 0 },
      { id: "b", folderId: "x", uploadedAt: new Date("2026-02-01"), intentos: 0 },
    ];
    expect(ordenarParaLeer(docs, []).map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("textoDelPapel", () => {
  it("saca lo que agregó la IA y lo que escribió una persona", () => {
    const buscable = construirTextoBuscable({
      texto: "LICENCIA Emitida: 15/01/2026",
      descripcion: "Licencia que vence el 15/01/2030",
      keyFacts: ["vence 15/01/2030"],
      descripcionPropia: "válida hasta 01/01/2031",
    });
    expect(buscable).toContain(MARCA_DESC_PROPIA.trim());
    expect(textoDelPapel(buscable)).toBe("LICENCIA Emitida: 15/01/2026");
  });

  it("sin bloques agregados devuelve el texto entero", () => {
    expect(textoDelPapel("Valida Hasta: 15/01/2027")).toBe("Valida Hasta: 15/01/2027");
    expect(textoDelPapel(null)).toBe("");
  });
});

describe("sugerenciaDelTextoLeido", () => {
  it("sugiere la fecha escrita aunque la IA no la haya visto", () => {
    const sug = sugerenciaDelTextoLeido({
      ocrText: "MUNICIPALIDAD LICENCIA DE FUNCIONAMIENTO Emitida: 15/01/2026 Valida Hasta: 15/01/2027",
      ocrMetadata: { sugerencias: { folderId: "f1" }, vencimientoLeido: null },
    });
    expect(sug?.expiresAt.slice(0, 10)).toBe("2027-01-15");
    expect(sug?.vencimientoLeido).toMatchObject({ regla: "etiqueta", anotado: false, origen: ORIGEN_LECTURA_NOCHE });
  });

  it("corrige la sugerencia equivocada de la IA (casillero de la GTF)", () => {
    const sug = sugerenciaDelTextoLeido({
      ocrText: "GUIA DE TRANSPORTE FORESTAL Fecha de vencimiento (20 108 1 26)",
      ocrMetadata: { sugerencias: { expiresAt: "2021-08-26T12:00:00.000Z" } },
    });
    expect(sug?.expiresAt.slice(0, 10)).toBe("2026-08-20");
  });

  it("no reescribe si ya estaba sugerida la misma fecha", () => {
    expect(
      sugerenciaDelTextoLeido({
        ocrText: "Valida Hasta: 15/01/2027",
        ocrMetadata: { sugerencias: { expiresAt: "2027-01-15T12:00:00.000Z" } },
      }),
    ).toBeNull();
  });

  it("no inventa: sin fecha de vencimiento escrita no hay sugerencia (aunque la IA la mencione)", () => {
    expect(sugerenciaDelTextoLeido({ ocrText: "Carta de la comunidad. Pucallpa, 3 de mayo de 2026", ocrMetadata: null })).toBeNull();
    expect(
      sugerenciaDelTextoLeido({
        ocrText: construirTextoBuscable({ texto: "Solicitud de permiso", descripcion: "Permiso que vence el 01/01/2030" }),
        ocrMetadata: {},
      }),
    ).toBeNull();
  });

  it("en un comprobante no sugiere: su «vencimiento» es la fecha de pagar", () => {
    expect(
      sugerenciaDelTextoLeido({
        ocrText: "FACTURA ELECTRÓNICA F001-00012 Fecha de emisión 01/10/2026 Fecha de vencimiento 31/10/2026 Total S/ 1,200.00",
        ocrMetadata: { structured: { docType: "factura" } },
      }),
    ).toBeNull();
  });
});

describe("presupuestoDeTienda", () => {
  it("reparte lo que queda entre las tiendas que faltan, con piso", () => {
    expect(presupuestoDeTienda(240_000, 4)).toBe(60_000);
    expect(presupuestoDeTienda(240_000, 40)).toBe(20_000);
    expect(presupuestoDeTienda(10_000, 3)).toBe(10_000);
    expect(presupuestoDeTienda(0, 3)).toBe(0);
  });
});
