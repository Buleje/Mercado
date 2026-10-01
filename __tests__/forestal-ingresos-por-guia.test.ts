import { describe, expect, it } from "vitest";
import {
  claveDeGuia,
  resumirGuia,
  type LineaDeGuia,
} from "@/lib/forestal/ingresos-por-guia";

function linea(over: Partial<LineaDeGuia> = {}): LineaDeGuia {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    entryDate: "2026-08-01T00:00:00.000Z",
    gtfNumber: "001-0000201",
    gtfSeries: null,
    providerName: "Comunidad San Luis",
    speciesCommonName: "Tornillo",
    productType: "rolliza",
    volumeM3: "3.0000",
    pieces: 4,
    status: "pendiente",
    ...over,
  };
}

describe("claveDeGuia", () => {
  it("la serie forma parte de la identidad del documento", () => {
    expect(claveDeGuia({ gtfNumber: "001", gtfSeries: "A" })).not.toBe(
      claveDeGuia({ gtfNumber: "001", gtfSeries: "B" }),
    );
    // Sin serie, el número solo alcanza.
    expect(claveDeGuia({ gtfNumber: "001", gtfSeries: null })).toBe(
      claveDeGuia({ gtfNumber: "001", gtfSeries: "  " }),
    );
  });
});

describe("resumirGuia", () => {
  it("junta las especies de una misma guía y suma su madera", () => {
    const g = resumirGuia([
      linea({ id: "a", speciesCommonName: "Tornillo", volumeM3: "3.0000", pieces: 4, libroNro: 12 }),
      linea({ id: "b", speciesCommonName: "Capirona", volumeM3: "1.5000", pieces: 2, libroNro: 13 }),
    ]);
    expect(g.especies.map((e) => e.comun)).toEqual(["Tornillo", "Capirona"]);
    expect(g.volumenM3).toBe(4.5);
    expect(g.piezas).toBe(6);
    expect(g.libroDesde).toBe(12);
    expect(g.libroHasta).toBe(13);
    expect(g.lineas).toHaveLength(2);
  });

  it("ordena las especies por volumen, no por orden de carga", () => {
    const g = resumirGuia([
      linea({ speciesCommonName: "Bolaina", volumeM3: "0.5000" }),
      linea({ speciesCommonName: "Shihuahuaco", volumeM3: "9.0000" }),
    ]);
    expect(g.especies[0].comun).toBe("Shihuahuaco");
  });

  it("una especie declarada en dos asientos se cuenta una vez", () => {
    const g = resumirGuia([
      linea({ speciesCommonName: "Tornillo", volumeM3: "2.0000", pieces: 3 }),
      linea({ speciesCommonName: "tornillo", volumeM3: "1.0000", pieces: 1 }),
    ]);
    expect(g.especies).toHaveLength(1);
    expect(g.especies[0]).toMatchObject({ volumenM3: 3, piezas: 4, lineas: 2 });
  });

  it("la fecha y el proveedor salen del asiento más viejo", () => {
    const g = resumirGuia([
      linea({ entryDate: "2026-08-05T00:00:00.000Z", providerName: "Segundo" }),
      linea({ entryDate: "2026-08-01T00:00:00.000Z", providerName: "Primero" }),
    ]);
    expect(g.entryDate).toBe("2026-08-01T00:00:00.000Z");
    expect(g.providerName).toBe("Primero");
  });

  it("estados distintos dan «mixto», nunca el del primero", () => {
    const g = resumirGuia([
      linea({ status: "validado" }),
      linea({ status: "rechazado" }),
    ]);
    expect(g.status).toBe("mixto");
    expect(g.statusMixto).toBe(true);
    expect(g.porEstado).toEqual({ validado: 1, rechazado: 1 });
  });

  it("con un solo estado, ése es el de la guía", () => {
    const g = resumirGuia([linea({ status: "validado" }), linea({ status: "validado" })]);
    expect(g.status).toBe("validado");
    expect(g.statusMixto).toBe(false);
  });

  it("CITES si CUALQUIER asiento lo declara", () => {
    const g = resumirGuia([linea({ speciesCites: false }), linea({ speciesCites: true })]);
    expect(g.cites).toBe(true);
  });

  it("sin volumen en las piezas, el total es null y no 0", () => {
    const sinDato = resumirGuia([linea({ trozasCount: 3 }), linea({ trozasCount: 1 })]);
    expect(sinDato.trozasM3).toBeNull();
    expect(sinDato.trozasCount).toBe(4);

    const conDato = resumirGuia([linea({ trozasM3: 2.5 }), linea({ trozasM3: null })]);
    expect(conDato.trozasM3).toBe(2.5);
  });

  it("suma las piezas ya decididas de todos sus asientos", () => {
    const g = resumirGuia([
      linea({ trozasCount: 4, trozasDecididas: 4 }),
      linea({ trozasCount: 2, trozasDecididas: 0 }),
    ]);
    expect(g.trozasCount).toBe(6);
    expect(g.trozasDecididas).toBe(4);
  });

  it("una guía sin asientos no existe", () => {
    expect(() => resumirGuia([])).toThrow();
  });
});
