import { describe, expect, it } from "vitest";
import {
  documentoGtfDesdeLibro,
  insumosDesdeLibro,
  lineasDesdeLibro,
  trozasDesdeLibro,
  type GuiaConLineas,
  type LineaLibro,
} from "@/lib/forestal/ctp-gtf-desde-libro";

function linea(over: Partial<LineaLibro> = {}): LineaLibro {
  return {
    speciesCommonName: "Tornillo",
    speciesScientificName: "Cedrelinga cateniformis",
    productType: "rolliza",
    unit: "m3",
    volumeM3: "6.7795",
    pieces: 5,
    providerName: "Maderera El Aguajal SAC",
    providerDocument: "20601234567",
    providerDocumentType: "RUC",
    originType: "concesion",
    originCode: "CON-25-UCA-0142",
    originRegion: "Ucayali",
    originDistrict: "Coronel Portillo",
    ...over,
  };
}

function guia(lineas: LineaLibro[], over: Partial<GuiaConLineas> = {}): GuiaConLineas {
  return {
    gtfNumber: "001-0000201",
    gtfSeries: null,
    entryDate: "2026-08-01T00:00:00.000Z",
    gtfDate: "2026-07-06T00:00:00.000Z",
    lineas,
    ...over,
  };
}

describe("insumosDesdeLibro", () => {
  it("el emisor del papel es el PROVEEDOR, no el aserradero", () => {
    const { ficha } = insumosDesdeLibro(guia([linea()]));
    expect(ficha.razonSocial).toBe("Maderera El Aguajal SAC");
    expect(ficha.titulos?.[0]?.codigo).toBe("CON-25-UCA-0142");
  });

  it("el RUC sólo se copia si el documento ES un RUC", () => {
    expect(insumosDesdeLibro(guia([linea()])).ficha.ruc).toBe("20601234567");
    const conDni = insumosDesdeLibro(
      guia([linea({ providerDocumentType: "DNI", providerDocument: "12345678" })]),
    );
    expect(conDni.ficha.ruc).toBe("");
  });

  it("la ARFFS va vacía: el ingreso no la guarda y deducirla es inventarla", () => {
    expect(insumosDesdeLibro(guia([linea()])).ficha.arffs).toBe("");
  });
});

describe("lineasDesdeLibro", () => {
  it("una línea del detalle (37) por asiento — no agrupa especies", () => {
    const l = lineasDesdeLibro(
      guia([
        linea({ speciesCommonName: "Tornillo", volumeM3: "3.0000", pieces: 2 }),
        linea({ speciesCommonName: "Tornillo", volumeM3: "1.5000", pieces: 1 }),
      ]),
    );
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ comun: "Tornillo", total: 3, cantidad: 2, presentacion: "Trozas" });
  });

  it("sin piezas declaradas, la presentación queda vacía y no dice «0 trozas»", () => {
    const [l] = lineasDesdeLibro(guia([linea({ pieces: null })]));
    expect(l.presentacion).toBe("");
    expect(l.cantidad).toBe(0);
  });

  it("el volumen se lee igual venga como string, número o Decimal", () => {
    const comoDecimal = { toString: () => "2.5000" };
    const l = lineasDesdeLibro(
      guia([linea({ volumeM3: "2.5000" }), linea({ volumeM3: 2.5 }), linea({ volumeM3: comoDecimal })]),
    );
    expect(l.map((x) => x.total)).toEqual([2.5, 2.5, 2.5]);
  });
});

describe("trozasDesdeLibro", () => {
  it("manda la codificación del bosque; la del patio es el respaldo", () => {
    const [conAmbas] = trozasDesdeLibro([{ codificacion: "95/B", codigoPlanta: "P-01" }]);
    expect(conAmbas.codificacion).toBe("95/B");
    const [soloPatio] = trozasDesdeLibro([{ codificacion: null, codigoPlanta: "P-01" }]);
    expect(soloPatio.codificacion).toBe("P-01");
  });

  it("sin volumen, `null` — no cero", () => {
    const [t] = trozasDesdeLibro([{ codificacion: "1", volumenM3: null }]);
    expect(t.volumenM3).toBeNull();
  });
});

describe("documentoGtfDesdeLibro", () => {
  const html = documentoGtfDesdeLibro(guia([linea()]));

  it("declara que es una reconstrucción del libro, no del SNIFFS", () => {
    expect(html).toContain("Reconstrucción");
    expect(html.replace(/<[^>]+>/g, "")).toMatch(/no se consultó en el registro público del SNIFFS/i);
  });

  it("NO estampa «REGISTRADA»: Buleje no registra ante la autoridad", () => {
    expect(html).not.toMatch(/REGISTRADA/);
  });

  it("(3) lleva la fecha de la GUÍA, nunca la del asiento", () => {
    expect(html).toContain("06.07.2026");
    expect(html).not.toContain("01.08.2026");
    // Y sin fecha de guía, el casillero queda vacío.
    const sinFecha = documentoGtfDesdeLibro(guia([linea()], { gtfDate: null }));
    expect(sinFecha).not.toContain("06.07.2026");
  });
});
