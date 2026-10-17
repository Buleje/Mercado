/**
 * La especie de los indicadores de Saldos viaja en la URL (2026-09-24).
 *
 * Vivía en un `useState` y se perdía al recargar: el operador filtraba los KPIs
 * por TORNILLO, apretaba F5 y volvía a ver toda la planta sin aviso. Va en un
 * parámetro PROPIO (`especieKpi`) porque `especie` ya es el recorte de la
 * capacidad, que es multi y del cliente: compartir la clave haría que uno
 * pisara al otro.
 */

import { describe, expect, it } from "vitest";
import { escribirParams, leerParams, PARAM_ESPECIE_KPI } from "@/hooks/use-params-de-saldos";
import { PARAMS_DE_VISTA } from "@/hooks/use-vista-modulo";

const SECCIONES = ["estado", "capacidad"] as const;

describe("especieKpi en la URL", () => {
  it("se lee aparte del recorte de la capacidad", () => {
    const r = leerParams("?seccion=estado&especie=CAPIRONA&especieKpi=TORNILLO", SECCIONES);
    expect(r.especieKpi).toBe("TORNILLO");
    expect(r.filtros.especie).toEqual(["CAPIRONA"]);
  });

  it("vacío o ausente = todas", () => {
    expect(leerParams("?seccion=estado", SECCIONES).especieKpi).toBe("");
    expect(leerParams("?especieKpi=%20", SECCIONES).especieKpi).toBe("");
  });

  it("se escribe y se borra; sin argumento no se toca", () => {
    const url = new URL("http://x/admin?tab=ctp&especieKpi=VIEJA");
    expect(escribirParams(new URL(url), "estado", {}).searchParams.get(PARAM_ESPECIE_KPI)).toBe(
      "VIEJA",
    );
    expect(
      escribirParams(new URL(url), "estado", {}, "TORNILLO").searchParams.get(PARAM_ESPECIE_KPI),
    ).toBe("TORNILLO");
    expect(escribirParams(new URL(url), "estado", {}, "").searchParams.has(PARAM_ESPECIE_KPI)).toBe(
      false,
    );
  });

  it("se limpia al cambiar de módulo, como los otros de Saldos", () => {
    expect(PARAMS_DE_VISTA).toContain(PARAM_ESPECIE_KPI);
  });
});
