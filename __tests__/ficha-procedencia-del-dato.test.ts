/**
 * La ficha distingue lo que dice el papel de lo que escribió una persona.
 *
 * ADR-392. Un fiscalizador de OSINFOR pregunta de dónde sale cada número, y
 * «lo dice la guía» no es lo mismo que «lo transcribió el almacenero». Hasta
 * ahora la pantalla los mostraba idénticos.
 *
 * La regla que no se puede romper: `manual` ausente significa **no se sabe**,
 * nunca «vino del documento». Los 166 ingresos que existían antes de esta
 * decisión no declaran procedencia, y la ficha no se la inventa.
 */

import { describe, it, expect } from "vitest";
import { seccionesDeGuia } from "@/lib/forestal/guia-ficha";

const linea = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  libroNro: 82,
  gtfNumber: "019-001-0000011",
  gtfSeries: null,
  docType: "GTF",
  gtfDate: null,
  serforNumeroRegistro: null,
  providerName: "Existencia de apertura (inventario)",
  providerDocument: null,
  originType: "otro",
  originCode: "19-SEC/REG-PLT-2018-020",
  originSourceNumber: null,
  ctpProductCode: null,
  originRegion: null,
  originDistrict: null,
  speciesCommonName: "TORNILLO",
  speciesScientificName: "Cedrelinga cateniformis",
  speciesCites: false,
  productType: "rolliza",
  volumeM3: 24.429,
  pieces: 0,
  status: "validado",
  gtfDatos: null,
  ...over,
});

const guia = (over: Record<string, unknown> = {}) =>
  ({
    gtfNumber: "019-001-0000011",
    gtfSeries: null,
    docType: "GTF",
    gtfDate: null,
    lineas: [linea(over)],
    ...(over.gtfSeries !== undefined ? { gtfSeries: over.gtfSeries } : {}),
  }) as unknown as Parameters<typeof seccionesDeGuia>[0];

const campo = (secciones: ReturnType<typeof seccionesDeGuia>, label: string) =>
  secciones.flatMap((s) => s.campos).find((c) => c.label === label);

describe("procedencia de cada casillero", () => {
  it("sin registro de procedencia, ningún campo se declara escrito a mano", () => {
    const s = seccionesDeGuia(guia());
    expect(s.flatMap((x) => x.campos).some((c) => c.manual)).toBe(false);
  });

  it("un campo con procedencia trae quién y cuándo", () => {
    const s = seccionesDeGuia(
      guia({
        serforNumeroRegistro: "1-19-0313629",
        camposManuales: { serforNumeroRegistro: { por: "qaadmin", el: "2026-09-06T22:20:34.054Z" } },
      }),
    );
    const c = campo(s, "N° de registro SNIFFS");
    expect(c?.valor).toBe("1-19-0313629");
    expect(c?.manual?.por).toBe("qaadmin");
    expect(c?.manual?.el).toBe("2026-09-06T22:20:34.054Z");
  });

  it("sólo se marca el campo tocado, no sus vecinos", () => {
    const s = seccionesDeGuia(
      guia({
        serforNumeroRegistro: "1-19-0313629",
        camposManuales: { serforNumeroRegistro: { por: "qaadmin", el: "2026-09-06T22:20:34.054Z" } },
      }),
    );
    expect(campo(s, "Título habilitante")?.manual).toBeUndefined();
    expect(campo(s, "N° de guía")?.manual).toBeUndefined();
  });

  it("la procedencia no inventa un valor donde no lo hay", () => {
    const s = seccionesDeGuia(guia({ camposManuales: { gtfSeries: { por: "qaadmin", el: "2026-09-06T00:00:00Z" } } }));
    const c = campo(s, "Serie");
    expect(c?.valor).toBeNull(); // el casillero sigue vacío
    expect(c?.manual?.por).toBe("qaadmin"); // pero se sabe quién lo tocó
  });

  it("un `camposManuales` corrupto no rompe la ficha", () => {
    for (const basura of ["texto", 42, [], { serforNumeroRegistro: "no-es-objeto" }]) {
      const s = seccionesDeGuia(guia({ camposManuales: basura }));
      expect(s.length).toBeGreaterThan(0);
      expect(campo(s, "N° de registro SNIFFS")?.manual).toBeUndefined();
    }
  });

  it("la procedencia de un campo vecino no se contagia", () => {
    const s = seccionesDeGuia(
      guia({
        originRegion: "Ucayali",
        camposManuales: { originRegion: { por: "almacen", el: "2026-09-06T00:00:00Z" } },
      }),
    );
    expect(campo(s, "Procedencia")?.manual?.por).toBe("almacen");
    expect(campo(s, "Tipo de origen")?.manual).toBeUndefined();
  });
});
