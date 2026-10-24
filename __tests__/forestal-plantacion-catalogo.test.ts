import { describe, expect, it } from "vitest";
import {
  buscarEnCatalogo,
  CATALOGO_ESPECIES,
  catalogoConLaBase,
  sugerirEspecies,
} from "@/lib/forestal/plantacion-catalogo";

describe("especies de plantación: la base primero, la lista fija de respaldo", () => {
  it("la base va primero con su grafía; la fija completa lo que la base no trae", () => {
    const lista = catalogoConLaBase([
      { nombre: "Ana Caspi", cientifico: "Apuleia leiocarpa" },
      { nombre: "cedro", cientifico: null },
      { nombre: "Tornillo", cientifico: "" },
      { nombre: "  " },
    ]);
    expect(lista.slice(0, 3).map((e) => e.comun)).toEqual(["Ana Caspi", "cedro", "Tornillo"]);
    // Sin científico en la base, el de la lista fija; CITES sólo de la fija (verificado).
    expect(lista[1]).toEqual({ comun: "cedro", cientifico: "Cedrela odorata", cites: true });
    expect(lista[2]).toEqual({ comun: "Tornillo", cientifico: "Cedrelinga cateniformis" });
    expect(lista[0].cites).toBeUndefined();
    // Las de plantación que la base no tiene siguen, una sola vez.
    expect(lista.some((e) => e.comun === "Bolaina blanca")).toBe(true);
    expect(lista.filter((e) => e.comun.toLowerCase() === "cedro")).toHaveLength(1);
    expect(lista).toHaveLength(1 + CATALOGO_ESPECIES.length);
  });

  it("sugerir y buscar leen la lista que se les pasa; sin ella, la fija", () => {
    const lista = catalogoConLaBase([{ nombre: "Ana Caspi", cientifico: "Apuleia leiocarpa" }]);
    expect(sugerirEspecies("ana", 8, lista).map((e) => e.comun)).toEqual(["Ana Caspi"]);
    expect(sugerirEspecies("", 1, lista)[0].comun).toBe("Ana Caspi");
    expect(buscarEnCatalogo("ANA CASPI", lista)?.cientifico).toBe("Apuleia leiocarpa");
    expect(buscarEnCatalogo("Ana Caspi")).toBeUndefined();
    expect(catalogoConLaBase([])).toEqual(CATALOGO_ESPECIES);
  });
});
