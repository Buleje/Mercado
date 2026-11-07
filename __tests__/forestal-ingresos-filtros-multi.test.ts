/**
 * El `where` de la bandeja de Ingresos con VARIOS valores por columna
 * (Brandon, 2026-09-10: «poder seleccionar dos o más opciones de filtros»).
 *
 * Lo que se protege es la forma del filtro, que es lo que decide qué guías ve
 * un fiscalizador: **OR adentro de una columna, AND entre columnas**. Y que un
 * filtro con varios valores NO pise el `OR` de la búsqueda libre — ese bug
 * devolvería, con un texto buscado y una especie puesta, cualquier cosa.
 */

import { describe, expect, it } from "vitest";
import { buildListWhere } from "@/lib/db/wood-entries.db";

const T = "tenant-1";

describe("buildListWhere — una columna con varios valores", () => {
  it("un valor solo va derecho al campo (sin AND de más)", () => {
    const w = buildListWhere(T, { speciesCommonName: "Tornillo" });
    expect(w.speciesCommonName).toEqual({ contains: "Tornillo", mode: "insensitive" });
    expect(w.AND).toBeUndefined();
  });

  it("dos valores son un OR adentro de un AND", () => {
    const w = buildListWhere(T, { speciesCommonName: ["Tornillo", "Cachimbo"] });
    expect(w.speciesCommonName).toBeUndefined();
    expect(w.AND).toEqual([
      {
        OR: [
          { speciesCommonName: { contains: "Tornillo", mode: "insensitive" } },
          { speciesCommonName: { contains: "Cachimbo", mode: "insensitive" } },
        ],
      },
    ]);
  });

  it("dos columnas con varios valores son dos AND: se cruzan", () => {
    const w = buildListWhere(T, {
      speciesCommonName: ["Tornillo", "Cachimbo"],
      originCode: ["CONC-1", "CONC-2"],
    });
    expect(Array.isArray(w.AND) && w.AND).toHaveLength(2);
  });

  it("el producto usa `in` — es igualdad exacta, no `contains`", () => {
    const w = buildListWhere(T, { productType: ["rolliza", "aserrada"] });
    expect(w.productType).toEqual({ in: ["rolliza", "aserrada"] });
  });

  it("una lista vacía no filtra nada", () => {
    const w = buildListWhere(T, { speciesCommonName: [], providerName: [] });
    expect(w.speciesCommonName).toBeUndefined();
    expect(w.providerName).toBeUndefined();
    expect(w.AND).toBeUndefined();
  });

  /**
   * El bug que este test previene: `where.OR` es de la búsqueda libre. Si el
   * filtro de varias especies lo usara, buscar «QA» + dos especies devolvería
   * la unión de las dos cosas en vez de la intersección.
   */
  it("NO pisa el OR de la búsqueda libre", () => {
    const w = buildListWhere(T, { search: "QA", speciesCommonName: ["Tornillo", "Cachimbo"] });
    expect(Array.isArray(w.OR) && w.OR.length).toBeGreaterThan(1);
    expect(w.OR?.[0]).toHaveProperty("gtfNumber");
    expect(Array.isArray(w.AND) && w.AND).toHaveLength(1);
  });

  it("«sin código de origen» convive con el filtro de varias especies", () => {
    const w = buildListWhere(T, { speciesCommonName: ["Tornillo", "Cachimbo"], sinOrigenCode: true });
    const and = Array.isArray(w.AND) ? w.AND : [];
    expect(and).toHaveLength(2);
    expect(and.at(-1)).toEqual({ OR: [{ originCode: null }, { originCode: "" }] });
  });

  it("el permiso compara sin distinguir mayúsculas, uno o varios", () => {
    expect(buildListWhere(T, { originCode: "conc-1" }).originCode).toEqual({
      equals: "conc-1",
      mode: "insensitive",
    });
    const varios = buildListWhere(T, { originCode: ["conc-1", "CONC-2"] });
    expect(varios.AND).toEqual([
      {
        OR: [
          { originCode: { equals: "conc-1", mode: "insensitive" } },
          { originCode: { equals: "CONC-2", mode: "insensitive" } },
        ],
      },
    ]);
  });
});
