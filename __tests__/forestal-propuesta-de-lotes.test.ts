/**
 * «Lotes que puedes armar» — la agrupación pura, con la forma del patio de Blas.
 *
 * Medido el 2026-09-27 en `inversiones-agroforestales-blas-sociedad-anonima`
 * (id `cmpxiv6p4000bohvzwl6bnfpv`, sólo lectura):
 *
 * | Lo medido                                                | Valor            |
 * |----------------------------------------------------------|------------------|
 * | trozas en el patio, sin lote                              | 84 · 178,819 m³  |
 * | …que se pueden aserrar hoy (guía recibida)                | 46 · 135,587 m³  |
 * | …todas del permiso 10-HUA-PUE/PER-FMP-2026-007            | 11 especies      |
 * | …que esperan su guía (2 guías pendientes)                 | 38 · 43,232 m³   |
 * | la mayor propuesta                                        | Cachimbo 12 · 28,947 m³ |
 */
import { describe, expect, it } from "vitest";

import {
  claveDePropuesta,
  proponerLotes,
  type TrozaParaPropuesta,
} from "@/lib/forestal/propuesta-de-lotes";

const FMP = "10-HUA-PUE/PER-FMP-2026-007";
const PLT_2021 = "19-SEC/REG-PLT-2021-017";
const PLT_2018 = "19-SEC/REG-PLT-2018-020";

let n = 0;
const troza = (p: Partial<TrozaParaPropuesta> = {}): TrozaParaPropuesta => ({
  id: `t${++n}`,
  especieComun: "Copal",
  especieCientifica: null,
  permiso: FMP,
  titular: "SANTOS MUÑOZ JOSE HORD",
  volumenM3: 2.5,
  gtfNumber: "019-001-0000010",
  estado: "elegible",
  ...p,
});

describe("proponerLotes — un lote por especie + permiso", () => {
  it("junta las elegibles de la misma especie y permiso en UNA propuesta", () => {
    const r = proponerLotes([troza(), troza(), troza({ volumenM3: 3.537 })]);
    expect(r.propuestas).toHaveLength(1);
    const [p] = r.propuestas;
    expect(p).toMatchObject({ especie: "Copal", permiso: FMP, titular: "SANTOS MUÑOZ JOSE HORD", trozas: 3, m3: 8.537 });
    expect(p.trozaIds).toHaveLength(3);
  });

  it("el mismo Tornillo de DOS permisos son DOS lotes (ADR-393)", () => {
    const r = proponerLotes([
      troza({ especieComun: "Tornillo", permiso: PLT_2021 }),
      troza({ especieComun: "Tornillo", permiso: PLT_2018 }),
      troza({ especieComun: "Tornillo", permiso: PLT_2018 }),
    ]);
    expect(r.propuestas.map((p) => [p.permiso, p.trozas])).toEqual([
      [PLT_2018, 2],
      [PLT_2021, 1],
    ]);
  });

  it("«Tornillo» y «TORNILLO» son la misma especie; el lote nace con la grafía más usada", () => {
    const r = proponerLotes([
      troza({ especieComun: "TORNILLO" }),
      troza({ especieComun: "Tornillo" }),
      troza({ especieComun: "Tornillo" }),
    ]);
    expect(r.propuestas).toHaveLength(1);
    expect(r.propuestas[0].especie).toBe("Tornillo");
  });

  it("el permiso se compara como lo compara el escritor: tal cual, sólo sin espacios en las puntas", () => {
    /* Juntar grafías distintas armaría un lote que `agregarTrozas` rechaza a la mitad. */
    const r = proponerLotes([troza({ permiso: ` ${FMP} ` }), troza({ permiso: FMP.toLowerCase() })]);
    expect(r.propuestas).toHaveLength(2);
    expect(r.propuestas.map((p) => p.permiso).sort()).toEqual([FMP, FMP.toLowerCase()].sort());
  });

  it("sin permiso NO se propone: un lote sin permiso aceptaría trozas de cualquier título; se cuenta aparte", () => {
    const r = proponerLotes([troza({ permiso: null, volumenM3: 1.5 }), troza({ permiso: "  ", volumenM3: 2 })]);
    expect(r.propuestas).toHaveLength(0);
    expect(r.sinPermiso).toEqual({ trozas: 2, m3: 3.5 });
  });

  it("ordena por volumen: primero el lote que más madera mueve", () => {
    const r = proponerLotes([
      troza({ especieComun: "Copal", volumenM3: 13.537 }),
      troza({ especieComun: "Cachimbo", volumenM3: 28.947 }),
      troza({ especieComun: "Panguana", volumenM3: 20.718 }),
    ]);
    expect(r.propuestas.map((p) => p.especie)).toEqual(["Cachimbo", "Panguana", "Copal"]);
  });

  it("el pie tablar es el ASERRABLE al 56 % (rolliza), no m³ × 424", () => {
    const r = proponerLotes([troza({ especieComun: "Cachimbo", volumenM3: 28.947 })]);
    expect(r.propuestas[0].ptAserrable).toBe(Math.round(28.947 * 0.56 * 424));
    expect(r.propuestas[0].ptAserrable).not.toBe(Math.round(28.947 * 424));
  });

  it("especie científica y titular: el más repetido del grupo", () => {
    const r = proponerLotes([
      troza({ especieCientifica: "Dacryodes sp.", titular: "A" }),
      troza({ especieCientifica: "Dacryodes sp.", titular: "B" }),
      troza({ especieCientifica: null, titular: "B" }),
    ]);
    expect(r.propuestas[0]).toMatchObject({ especieCientifica: "Dacryodes sp.", titular: "B" });
  });
});

describe("proponerLotes — lo que queda afuera se cuenta, no se esconde", () => {
  it("la madera de guías sin recibir no entra y se cuenta aparte, con cuántas guías", () => {
    const r = proponerLotes([
      troza({ especieComun: "Copal" }),
      ...Array.from({ length: 31 }, () =>
        troza({ especieComun: "TORNILLO", permiso: PLT_2021, volumenM3: 0.647, estado: "espera-guia", gtfNumber: "019-001-0000004" }),
      ),
      ...Array.from({ length: 7 }, () =>
        troza({ especieComun: "Copaiba", permiso: "19-SEC/PER-FMC-2024-008", estado: "espera-guia", gtfNumber: "019-0000001" }),
      ),
    ]);
    expect(r.propuestas.map((p) => p.especie)).toEqual(["Copal"]);
    expect(r.esperanGuia.trozas).toBe(38);
    expect(r.esperanGuia.guias).toBe(2);
  });

  it("una elegible sin especie no arma lote: se cuenta como «sin especie»", () => {
    const r = proponerLotes([troza({ especieComun: null, volumenM3: 1.2 }), troza({ especieComun: " (Cedrela) " })]);
    expect(r.propuestas).toEqual([]);
    expect(r.sinEspecie).toEqual({ trozas: 2, m3: 3.7 });
  });

  it("las que están fuera (mixto, no llegó, madre) ni se proponen ni se cuentan", () => {
    const r = proponerLotes([troza({ estado: "fuera" }), troza({ estado: "fuera" })]);
    expect(r).toEqual({
      propuestas: [],
      esperanGuia: { trozas: 0, m3: 0, guias: 0 },
      sinEspecie: { trozas: 0, m3: 0 },
      sinPermiso: { trozas: 0, m3: 0 },
    });
  });
});

describe("claveDePropuesta — la usan el GET y el POST", () => {
  it("normaliza la especie como el escritor y el permiso sólo con trim", () => {
    expect(claveDePropuesta(" Copal ", ` ${FMP} `)).toBe(claveDePropuesta("COPAL", FMP));
    expect(claveDePropuesta("Copal", null)).toBe(claveDePropuesta("copal", "  "));
    expect(claveDePropuesta("Copal", FMP)).not.toBe(claveDePropuesta("Copal", FMP.toLowerCase()));
  });

  it("la clave de cada propuesta es la que el POST recalcula con su especie y su permiso", () => {
    const r = proponerLotes([troza({ especieComun: "TORNILLO" }), troza({ especieComun: "Tornillo" }), troza({ especieComun: "Tornillo" })]);
    const p = r.propuestas[0];
    expect(claveDePropuesta(p.especie, p.permiso)).toBe(p.clave);
  });
});
