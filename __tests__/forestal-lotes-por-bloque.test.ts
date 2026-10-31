/**
 * «Crear lotes sugeridos» (ADR-464), la regla pura: UN lote por bloque con
 * EXACTAMENTE sus trozas, todo o nada, y el motivo exacto cuando no se puede.
 *
 * Fixtures con la forma de Blas: Tornillo del permiso 19-SEC/REG-PLT-2021-017
 * y una guía sin permiso (los 7 ingresos de Blas al 2026-10-03).
 */
import { describe, expect, it } from "vitest";
import {
  avisosDelBloque,
  estadoLocalDelBloque,
  lotesPorBloque,
  type TrozaDelBloque,
} from "@/lib/forestal/lotes-por-bloque";

const PERMISO = "19-SEC/REG-PLT-2021-017";
const t = (id: string, over: Partial<TrozaDelBloque> = {}): TrozaDelBloque => ({
  id,
  especieComun: "Tornillo",
  especieCientifica: "Cedrelinga cateniformis",
  permiso: PERMISO,
  titular: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
  volumenM3: 1.25,
  gtfNumber: "019-001-0000004",
  estado: "elegible",
  enLote: null,
  motivo: null,
  ...over,
});

describe("lotesPorBloque — un lote por bloque", () => {
  it("las trozas del bloque forman UN lote con exactamente esas piezas", () => {
    const [r] = lotesPorBloque([{ bloqueId: "b1", etiqueta: "019-001-0000004", trozaIds: ["a", "b"] }], [t("a"), t("b"), t("c")]);
    expect(r).toMatchObject({ bloqueId: "b1", listo: true, especie: "Tornillo", permiso: PERMISO, trozas: 2, m3: 2.5 });
    expect(r.listo && r.trozaIds.sort()).toEqual(["a", "b"]);
  });

  it("dos guías de la MISMA especie y permiso son dos lotes, no uno (no agrupa por especie+permiso)", () => {
    const r = lotesPorBloque(
      [
        { bloqueId: "b1", trozaIds: ["a"] },
        { bloqueId: "b2", trozaIds: ["b"] },
      ],
      [t("a"), t("b", { gtfNumber: "019-001-0000005" })],
    );
    expect(r.map((x) => x.listo)).toEqual([true, true]);
    expect(r.map((x) => (x.listo ? x.trozaIds : []))).toEqual([["a"], ["b"]]);
  });

  it("una troza no puede ir en dos bloques: el segundo se apaga con su motivo", () => {
    const r = lotesPorBloque(
      [
        { bloqueId: "b1", etiqueta: "Guía 4", trozaIds: ["a", "b"] },
        { bloqueId: "b2", etiqueta: "Guía 4 copia", trozaIds: ["b"] },
      ],
      [t("a"), t("b")],
    );
    expect(r[0].listo).toBe(true);
    expect(r[1]).toEqual({ bloqueId: "b2", listo: false, motivo: "Comparte 1 troza con el bloque «Guía 4»: un lote por bloque, sin repetir piezas." });
  });

  it("todo o nada: si UNA troza ya no puede, el bloque no se arma (nunca un lote con menos piezas)", () => {
    const [r] = lotesPorBloque(
      [{ bloqueId: "b1", trozaIds: ["a", "b", "c"] }],
      [t("a"), t("b"), t("c", { motivo: "ya entró a una corrida" })],
    );
    expect(r).toEqual({ bloqueId: "b1", listo: false, motivo: "1 de 3 trozas no pueden ir a un lote: ya entró a una corrida." });
  });
});

describe("lotesPorBloque — el motivo exacto", () => {
  const motivo = (trozaIds: string[], trozas: TrozaDelBloque[]) => {
    const [r] = lotesPorBloque([{ bloqueId: "b", trozaIds }], trozas);
    return r.listo ? null : r.motivo;
  };

  it("sin trozas → «tráelo del Libro»", () => {
    expect(motivo([], [])).toBe("No sabe de qué trozas sale: tráelo del Libro.");
  });

  it("una troza de otro negocio (o borrada) no vuelve del servidor: «ya no existen en este negocio»", () => {
    expect(motivo(["a", "ajena"], [t("a")])).toBe("1 de 2 trozas ya no existen en este negocio: vuelve a traer el bloque del Libro.");
  });

  it("todas en el mismo lote → lo dice con su código; repartidas → lista los lotes", () => {
    expect(motivo(["a", "b"], [t("a", { enLote: "LA-2026-011" }), t("b", { enLote: "LA-2026-011" })])).toBe(
      "Sus trozas ya están en el lote LA-2026-011: no se arma otro.",
    );
    expect(motivo(["a", "b", "c"], [t("a", { enLote: "LA-1" }), t("b", { enLote: "LA-2" }), t("c")])).toBe(
      "2 de 3 trozas ya están en los lotes LA-1, LA-2: un lote por bloque, sin repetir piezas.",
    );
  });

  it("guía sin recibir: el motivo del escritor dice el camino", () => {
    const m = "la guía 019-001-0000004 todavía no se recibió en el patio: recepciónala en Ingresos";
    expect(motivo(["a"], [t("a", { motivo: m, estado: "espera-guia" })])).toBe(`Sus trozas no pueden ir a un lote: ${m}.`);
  });

  it("el ingreso sin permiso (Blas hoy) → «El ingreso no tiene permiso: corrígelo en Ingresos»", () => {
    expect(motivo(["a"], [t("a", { permiso: null, gtfNumber: "010-001-0000009" })])).toBe(
      "El ingreso no tiene permiso: corrígelo en Ingresos (guía 010-001-0000009).",
    );
  });

  it("sin especie → se corrige en Ingresos", () => {
    expect(motivo(["a"], [t("a", { especieComun: "  " })])).toBe("Sus trozas no tienen especie: corrígelas en Ingresos.");
  });

  it("mezcla especies o permisos → un lote es de una sola especie y un solo permiso", () => {
    expect(motivo(["a", "b"], [t("a"), t("b", { especieComun: "Copal" })])).toBe(
      "Mezcla 2 especies (Tornillo, Copal): un lote es de una sola especie.",
    );
    expect(motivo(["a", "b"], [t("a"), t("b", { permiso: "19-SEC/REG-PLT-2018-020" })])).toBe(
      `Sus trozas son de 2 permisos (${PERMISO}, 19-SEC/REG-PLT-2018-020): un lote lleva un solo permiso.`,
    );
  });

  it("«TORNILLO» y «Tornillo» son la misma especie (claveEspecie, como el escritor)", () => {
    expect(motivo(["a", "b"], [t("a"), t("b", { especieComun: "TORNILLO" })])).toBeNull();
  });
});

describe("estadoLocalDelBloque — qué se le pregunta al servidor", () => {
  it("con lote → «Ya tiene lote» (doble consumo); aserrada → no lleva lote; a mano → «Tráelo del Libro»", () => {
    expect(estadoLocalDelBloque({ loteId: "L1", trozaIds: ["a"] })).toBe("ya-tiene-lote");
    expect(estadoLocalDelBloque({ tipo: "aserrada", trozaIds: null })).toBe("aserrada");
    expect(estadoLocalDelBloque({ trozaIds: null })).toBe("manual");
    expect(estadoLocalDelBloque({ trozaIds: [] })).toBe("manual");
    expect(estadoLocalDelBloque({ tipo: "rolliza", trozaIds: ["a"] })).toBe("pedible");
  });
});

describe("avisosDelBloque — lo que el bloque dice y sus trozas no", () => {
  it("especie, permiso o m³ editados en la tabla se avisan; el lote nace con lo de las trozas", () => {
    const lote = { especie: "Tornillo", permiso: PERMISO, m3: 2.5 };
    expect(avisosDelBloque({ especie: "TORNILLO", permiso: PERMISO, m3: 2.5004 }, lote)).toEqual([]);
    const avisos = avisosDelBloque({ especie: "Copal", permiso: "OTRO", m3: 3 }, lote);
    expect(avisos).toHaveLength(3);
    expect(avisos[0]).toContain("el lote nace de Tornillo");
  });
});
