/**
 * «Lote para la madera suelta» (Brandon 30-10): qué troza cuenta como madera
 * en patio sin lote y cómo sale el aviso del libro.
 */
import { describe, expect, it } from "vitest";
import { maderaSinLoteDe, pendientesDelLibro, type DatosPendientes } from "@/lib/forestal/ctp-pendientes";
import { proponerLotes, type TrozaParaPropuesta } from "@/lib/forestal/propuesta-de-lotes";

const VACIO: DatosPendientes = {
  ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0,
  despachosSinGtf: 0, despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
};

let n = 0;
function troza(p: Partial<TrozaParaPropuesta>): TrozaParaPropuesta {
  n += 1;
  return {
    id: `t${n}`,
    especieComun: "Tornillo",
    especieCientifica: "Cedrelinga cateniformis",
    permiso: "PLT-2025-096",
    titular: "Blas",
    volumenM3: 1,
    gtfNumber: "019-001-0000008",
    estado: "elegible",
    ...p,
  };
}

describe("qué troza cuenta como madera en patio sin lote", () => {
  it("cuenta sólo la elegible con especie y permiso; la que espera guía o está fuera, no", () => {
    const patio = proponerLotes([
      troza({ volumenM3: 2.5 }),
      troza({ volumenM3: 1.25 }),
      troza({ estado: "espera-guia", volumenM3: 9 }),
      troza({ estado: "fuera", volumenM3: 7 }),
      troza({ especieComun: null, volumenM3: 0.5 }),
      troza({ permiso: null, volumenM3: 0.75 }),
    ]);
    const m = maderaSinLoteDe(patio);
    expect(m.trozas).toBe(2);
    expect(m.m3).toBe(3.75);
    expect(m.grupos).toEqual([{ especie: "Tornillo", permiso: "PLT-2025-096", trozas: 2, m3: 3.75 }]);
    /* No se pueden armar, pero tampoco tienen lote: se dicen aparte. */
    expect(m.sinDato).toEqual({ trozas: 2, m3: 1.25 });
  });

  it("un grupo por especie y permiso (un lote no mezcla permisos), el más grande primero", () => {
    const m = maderaSinLoteDe(
      proponerLotes([
        troza({ permiso: "PLT-2021-017", volumenM3: 0.6 }),
        troza({ permiso: "PLT-2025-096", volumenM3: 15.6 }),
        troza({ permiso: "PLT-2025-096", volumenM3: 15.5 }),
        troza({ especieComun: "Copaiba", permiso: "PLT-2021-017", volumenM3: 4 }),
      ]),
    );
    expect(m.grupos.map((g) => `${g.especie}|${g.permiso}|${g.trozas}`)).toEqual([
      "Tornillo|PLT-2025-096|2",
      "Copaiba|PLT-2021-017|1",
      "Tornillo|PLT-2021-017|1",
    ]);
    expect(m.m3).toBe(35.7);
  });

  it("sin respuesta del servidor no inventa madera", () => {
    expect(maderaSinLoteDe(null)).toEqual({ trozas: 0, m3: 0, grupos: [], sinDato: { trozas: 0, m3: 0 } });
  });
});

describe("el aviso del libro", () => {
  it("dice los m³, nombra cada grupo y lleva a Lotes", () => {
    const maderaSinLote = maderaSinLoteDe(
      proponerLotes([
        troza({ volumenM3: 15.637 }),
        troza({ volumenM3: 15.455 }),
        troza({ permiso: "PLT-2025-167", volumenM3: 15.201 }),
      ]),
    );
    const [p] = pendientesDelLibro({ ...VACIO, maderaSinLote });
    expect(p).toMatchObject({ clave: "madera-sin-lote", urgencia: "pendiente", cantidad: 3, vista: "lotes" });
    expect(p!.titulo).toBe("Madera en patio sin lote · 46.29 m³");
    expect(p!.detalle).toContain("Tornillo · PLT-2025-096: 31.09 m³ (2 trozas)");
    expect(p!.detalle).toContain("Tornillo · PLT-2025-167: 15.20 m³ (1 troza)");
  });

  it("con todo en su lote no avisa", () => {
    expect(pendientesDelLibro({ ...VACIO, maderaSinLote: maderaSinLoteDe(proponerLotes([])) })).toEqual([]);
  });
});
