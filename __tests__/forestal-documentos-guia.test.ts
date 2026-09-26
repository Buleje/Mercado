import { describe, expect, it } from "vitest";
import {
  CASILLEROS_GUIA,
  agruparPorCasillero,
  carpetaGuiaPorFecha,
  casilleroDeDocumento,
  casillerosLlenos,
  esPdfPorFirma,
  etiquetasDeBusqueda,
  etiquetasDeDocumentoGuia,
  llenosPorGuia,
  nombreDeDocumentoGuia,
} from "@/lib/forestal/documentos-guia";

const G = "019-0000003";

describe("casilleros de la guía (ADR-438)", () => {
  it("son los 6 pedidos, en orden", () => {
    expect(CASILLEROS_GUIA.map((c) => c.clave)).toEqual([
      "factura",
      "guia_remitente",
      "guia_transportista",
      "lista_trozas",
      "gtf",
      "otros",
    ]);
  });

  it("un documento subido cae en su casillero por sus etiquetas", () => {
    expect(casilleroDeDocumento(etiquetasDeDocumentoGuia(G, "factura"), G)).toBe("factura");
    expect(casilleroDeDocumento(etiquetasDeDocumentoGuia(G, "guia_transportista"), G)).toBe(
      "guia_transportista",
    );
  });

  it("no es de otra guía", () => {
    expect(casilleroDeDocumento(etiquetasDeDocumentoGuia(G, "factura"), "019-0000004")).toBeNull();
  });

  it("sobrevive al «renombrar etiqueta» del Drive (baja a minúscula)", () => {
    const tags = etiquetasDeDocumentoGuia("QA-B1-437", "gtf").map((t) => t.toLowerCase());
    expect(casilleroDeDocumento(tags, "QA-B1-437")).toBe("gtf");
  });

  it("con gtf: y un casillero mal escrito va a «otros», no se esconde", () => {
    expect(casilleroDeDocumento([`gtf:${G}`, "casillero:facturita"], G)).toBe("otros");
  });

  it("reconoce lo archivado antes desde «Documento de la guía» (legado)", () => {
    expect(casilleroDeDocumento(["forestal", "GTF", G, "COMUNIDAD X", "Sapotillo"], G)).toBe("gtf");
    expect(casilleroDeDocumento(["forestal", "lista de trozas", G], G)).toBe("lista_trozas");
  });

  it("la GTF de SALIDA y el legajo NO son papeles del ingreso", () => {
    expect(casilleroDeDocumento(["forestal", "GTF", "salida", G], G)).toBeNull();
    expect(casilleroDeDocumento(["forestal", "legajo", "GTF", G], G)).toBeNull();
    expect(casilleroDeDocumento(["GTF", G], G)).toBeNull();
  });

  it("agrupa y cuenta casilleros llenos (varios archivos en uno cuentan una vez)", () => {
    const docs = [
      { id: "a", tags: etiquetasDeDocumentoGuia(G, "factura") },
      { id: "b", tags: etiquetasDeDocumentoGuia(G, "factura") },
      { id: "c", tags: ["forestal", "GTF", G] },
      { id: "d", tags: etiquetasDeDocumentoGuia("otra", "otros") },
    ];
    const g = agruparPorCasillero(docs, G);
    expect(g.factura.map((d) => d.id)).toEqual(["a", "b"]);
    expect(g.gtf.map((d) => d.id)).toEqual(["c"]);
    expect(casillerosLlenos(g)).toBe(2);
    expect(llenosPorGuia(docs, [G, "otra", "sin-nada"])).toEqual({
      [G]: 2,
      otra: 1,
      "sin-nada": 0,
    });
  });

  it("busca por la etiqueta de máquina (tal cual y en minúscula) y por el N° solo", () => {
    expect(etiquetasDeBusqueda(["QA-1", " "])).toEqual(["gtf:QA-1", "gtf:qa-1", "QA-1"]);
  });

  it("carpeta por año/mes del ingreso; sin fecha, la raíz de las guías", () => {
    expect(carpetaGuiaPorFecha("2026-09-24T00:00:00.000Z")).toEqual([
      "Guías forestales (GTF)",
      "2026",
      "09",
    ]);
    expect(carpetaGuiaPorFecha(null)).toEqual(["Guías forestales (GTF)"]);
  });

  it("el nombre dice qué es y de qué guía, sin caracteres que rompan el archivo", () => {
    expect(nombreDeDocumentoGuia("guia_remitente", G, "foto:1/2.JPG", "webp")).toBe(
      "Guía de remisión del remitente — GTF 019-0000003 (foto 1 2).webp",
    );
  });
});

describe("esPdfPorFirma", () => {
  const b = (s: string) => new TextEncoder().encode(s);
  it("acepta %PDF- al inicio o dentro del primer KB", () => {
    expect(esPdfPorFirma(b("%PDF-1.7\n..."))).toBe(true);
    expect(esPdfPorFirma(b(`${" ".repeat(500)}%PDF-1.4`))).toBe(true);
  });
  it("rechaza lo que sólo SE LLAMA pdf", () => {
    expect(esPdfPorFirma(b("<html><script>alert(1)</script>"))).toBe(false);
    expect(esPdfPorFirma(b(`${" ".repeat(1100)}%PDF-1.4`))).toBe(false);
    expect(esPdfPorFirma(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
  });
});
