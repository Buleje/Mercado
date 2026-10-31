import { describe, expect, it } from "vitest";
import {
  CONFIANZA_MINIMA,
  clasificarDocumento,
  esConfiable,
  nombreDeArchivo,
} from "@/lib/forestal/documento-clasificar";

describe("clasificarDocumento — qué papel es el que subieron", () => {
  it("una foto sin nombre útil no se etiqueta a la fuerza", () => {
    const c = clasificarDocumento("IMG_20260808_121314.jpg");
    expect(c.tipo).toBe("Otro");
    expect(esConfiable(c)).toBe(false);
  });

  it("el CONTENIDO manda sobre el nombre", () => {
    // El archivo se llama «factura» pero adentro dice que es una GTF.
    const c = clasificarDocumento("factura escaneada.pdf", "GUÍA DE TRANSPORTE FORESTAL · GTF N° 001-0000025");
    expect(c.tipo).toBe("GTF");
    expect(c.confianza).toBeGreaterThanOrEqual(85);
  });

  it("nombre + contenido coincidiendo es casi certeza", () => {
    const c = clasificarDocumento("GTF-001-0000025.pdf", "Guía de Transporte Forestal — declaración jurada");
    expect(c.tipo).toBe("GTF");
    expect(c.confianza).toBeGreaterThanOrEqual(95);
  });

  it("sólo el nombre alcanza para proponer, no para dar por hecho", () => {
    const c = clasificarDocumento("guia-remision-remitente.pdf");
    expect(c.tipo).toBe("Guía de Remisión Remitente");
    expect(esConfiable(c)).toBe(false); // 55 < 60: la pantalla pide confirmar
  });

  it("distingue remitente de transportista, que es el error clásico", () => {
    expect(clasificarDocumento("x.pdf", "GUIA DE REMISION - TRANSPORTISTA").tipo).toBe("Guía de Remisión Transportista");
    expect(clasificarDocumento("x.pdf", "GUIA DE REMISION - REMITENTE").tipo).toBe("Guía de Remisión Remitente");
  });

  it("reconoce la lista de productos por su anexo", () => {
    expect(clasificarDocumento("anexo04.pdf").tipo).toBe("Lista de Productos");
    expect(clasificarDocumento("x.pdf", "ANEXO N° 04 · Lista de productos transformados").tipo).toBe("Lista de Productos");
  });

  it("una resolución y un registro de plantación caen en el mismo cajón", () => {
    expect(clasificarDocumento("x.pdf", "RESOLUCIÓN DIRECTORAL N° 0142-2025").tipo).toBe("Resolución o Registro de Plantación");
    expect(clasificarDocumento("registro-plantacion-2025.pdf").tipo).toBe("Resolución o Registro de Plantación");
    expect(clasificarDocumento("x.pdf", "CONTRATO DE CONCESIÓN FORESTAL").tipo).toBe("Resolución o Registro de Plantación");
  });

  it("saca el número del comprobante cuando el texto lo canta", () => {
    const c = clasificarDocumento("x.pdf", "FACTURA ELECTRÓNICA F001-00001234 · IGV 18%");
    expect(c.tipo).toBe("Factura");
    expect(c.numero).toBe("F001-00001234");
  });

  it("la guía de origen no se confunde con la GTF", () => {
    expect(clasificarDocumento("x.pdf", "GUÍA DE ORIGEN del recurso forestal").tipo).toBe("Guía de Origen");
  });

  it("el umbral de confianza es explícito, no un número suelto", () => {
    expect(CONFIANZA_MINIMA).toBe(60);
  });
});

describe("nombreDeArchivo — que se pueda encontrar dentro de seis meses", () => {
  it("arma nombre con guía, tipo y número, conservando la extensión", () => {
    const c = clasificarDocumento("x.pdf", "FACTURA ELECTRÓNICA F001-00001234");
    expect(nombreDeArchivo(c, "001-0000025", "IMG_9912.pdf")).toBe(
      "GTF 001-0000025 · Factura · F001-00001234.pdf",
    );
  });

  it("sin guía sigue diciendo qué es", () => {
    const c = clasificarDocumento("boleta.pdf");
    expect(nombreDeArchivo(c, null, "escaneo.jpg")).toBe("Boleta.jpg");
  });
});
