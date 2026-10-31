import { describe, expect, it } from "vitest";
import {
  MINIMO_USO,
  esOrdenDeFabrica,
  hayOrdenManual,
  ordenarBarra,
  rubrosActivos,
  rubrosQueSuben,
  tabsPorUso,
} from "@/lib/admin/orden-barra";
import { TAB_CATEGORIES } from "@/app/admin/_lib/tab-categories";

const FABRICA = [
  { id: "inicio", tabs: ["vendor-dashboard"] },
  { id: "ventas", tabs: ["ventas-caja"] },
  { id: "compras", tabs: ["compras-abastecimiento"] },
  { id: "camaras", tabs: ["camaras"] },
  { id: "clientes", tabs: ["clientes"] },
  { id: "forestal", tabs: ["ctp-libro-operaciones", "loth-libro-operaciones", "forestal-herramientas"] },
  { id: "agricultura", tabs: ["cacao-acopio"] },
  { id: "config", tabs: ["config"] },
] as const;
const ids = (cats: readonly { id: string }[]) => cats.map((c) => c.id);
const IDS_FABRICA = ids(FABRICA);
/* Un aserradero de verdad: el Libro CTP se abre más que Ventas (Blas 28-10: 204 contra 0). */
const USO_FORESTAL = { "ctp-libro-operaciones": 20, "ventas-caja": 2 };

describe("ordenarBarra: el rubro arriba", () => {
  it("sin rubro ni orden a mano queda el de fábrica (mismos objetos)", () => {
    const out = ordenarBarra(FABRICA);
    expect(ids(out)).toEqual(IDS_FABRICA);
    out.forEach((c, i) => expect(c).toBe(FABRICA[i]));
  });

  it("forestal sube detrás de Inicio y se lleva a Cámaras con él", () => {
    expect(ids(ordenarBarra(FABRICA, { rubros: ["forestal"], uso: USO_FORESTAL }))).toEqual([
      "inicio", "forestal", "camaras", "ventas", "compras", "clientes", "agricultura", "config",
    ]);
  });

  it("tener la especialización prendida no basta: sin uso, o si Ventas se abre más, queda el de fábrica", () => {
    /* `main` (la bodega) tiene forestal prendido para QA: no debe ponerlo arriba de Ventas. */
    expect(ids(ordenarBarra(FABRICA, { rubros: ["forestal"] }))).toEqual(IDS_FABRICA);
    expect(ids(ordenarBarra(FABRICA, { rubros: ["forestal"], uso: { "ctp-libro-operaciones": 5, "ventas-caja": 9 } }))).toEqual(IDS_FABRICA);
    expect(rubrosQueSuben(FABRICA, ["forestal"], { "ctp-libro-operaciones": MINIMO_USO - 1 })).toEqual([]);
    /* Cámaras cuenta para el bloque forestal: un aserradero que sólo mira el patio también sube. */
    expect(rubrosQueSuben(FABRICA, ["forestal"], { camaras: 5 })).toEqual(["forestal"]);
  });

  it("con el TAB_CATEGORIES real: Forestal pasa al puesto 2 (era el 10)", () => {
    const antes = ids(TAB_CATEGORIES).indexOf("forestal");
    const uso = { "ctp-libro-operaciones": 20 };
    const despues = ids(ordenarBarra(TAB_CATEGORIES, { rubros: ["forestal"], uso })).indexOf("forestal");
    expect(antes).toBeGreaterThan(5);
    expect(despues).toBe(1);
    /* Nada se borra: las mismas categorías, en otro orden. */
    expect(ids(ordenarBarra(TAB_CATEGORIES, { rubros: ["forestal"], uso })).sort()).toEqual(ids(TAB_CATEGORIES).sort());
  });

  it("rubrosActivos: sólo los que tienen alguna pestaña prendida en el negocio", () => {
    expect(rubrosActivos(FABRICA, new Set(["ctp-libro-operaciones", "ventas-caja"]))).toEqual(["forestal"]);
    expect(rubrosActivos(FABRICA, new Set(["ventas-caja"]))).toEqual([]);
    expect(rubrosActivos(FABRICA, new Set(["cacao-acopio", "loth-libro-operaciones"]))).toEqual(["forestal", "agricultura"]);
  });
});

describe("ordenarBarra: por uso dentro del rubro", () => {
  it("las pestañas forestales van por aperturas de 30 días", () => {
    const out = ordenarBarra(FABRICA, {
      rubros: ["forestal"],
      uso: { "loth-libro-operaciones": 89, "ctp-libro-operaciones": 204, "forestal-herramientas": 0 },
    });
    expect(out.find((c) => c.id === "forestal")?.tabs).toEqual([
      "ctp-libro-operaciones", "loth-libro-operaciones", "forestal-herramientas",
    ]);
    const invertido = ordenarBarra(FABRICA, {
      rubros: ["forestal"],
      uso: { "forestal-herramientas": 40, "loth-libro-operaciones": 9 },
    });
    expect(invertido.find((c) => c.id === "forestal")?.tabs).toEqual([
      "forestal-herramientas", "loth-libro-operaciones", "ctp-libro-operaciones",
    ]);
  });

  it(`con menos de ${MINIMO_USO} aperturas no se mueve nada (ruido de un día)`, () => {
    expect(tabsPorUso(["a", "b", "c"], { c: MINIMO_USO - 1 })).toEqual(["a", "b", "c"]);
    expect(tabsPorUso(["a", "b", "c"], { c: MINIMO_USO })).toEqual(["c", "a", "b"]);
  });

  it("empates quedan en el orden de fábrica", () => {
    expect(tabsPorUso(["a", "b", "c"], { a: 2, b: 5, c: 2 })).toEqual(["b", "a", "c"]);
  });

  it("fuera del rubro el uso no reordena (sólo forestal se mueve por dentro)", () => {
    const cats = [{ id: "inicio", tabs: ["x", "y"] }, { id: "forestal", tabs: ["f1", "f2"] }];
    const out = ordenarBarra(cats, { rubros: ["forestal"], uso: { y: 50, f2: 9 } });
    expect(out[0]).toBe(cats[0]);
    expect(out[1].tabs).toEqual(["f2", "f1"]);
  });
});

describe("ordenarBarra: el orden a mano manda", () => {
  it("un orden fijado a mano gana al rubro", () => {
    const manual = ["clientes", "ventas", "inicio", "config", "forestal", "compras", "camaras", "agricultura"];
    expect(ids(ordenarBarra(FABRICA, { ordenManual: manual, rubros: ["forestal"] }))).toEqual(manual);
  });

  it("las categorías nuevas que no estaban al guardar van al final", () => {
    const out = ids(ordenarBarra(FABRICA, { ordenManual: ["clientes", "inicio"], rubros: ["forestal"] }));
    expect(out.slice(0, 2)).toEqual(["clientes", "inicio"]);
    expect(out.slice(2)).toEqual(["ventas", "compras", "camaras", "forestal", "agricultura", "config"]);
  });

  it("con orden a mano, adentro de Forestal igual va por uso (nadie fija ese orden)", () => {
    const out = ordenarBarra(FABRICA, {
      ordenManual: ["clientes", "inicio", "forestal"],
      rubros: ["forestal"],
      uso: { "forestal-herramientas": 10 },
    });
    expect(out.find((c) => c.id === "forestal")?.tabs[0]).toBe("forestal-herramientas");
  });

  it("un orden guardado igual al de fábrica (lápiz que sólo cambió el color) no tapa el rubro", () => {
    expect(esOrdenDeFabrica(IDS_FABRICA, IDS_FABRICA)).toBe(true);
    expect(hayOrdenManual(IDS_FABRICA, IDS_FABRICA)).toBe(false);
    expect(ids(ordenarBarra(FABRICA, { ordenManual: [...IDS_FABRICA], rubros: ["forestal"], uso: USO_FORESTAL }))[1]).toBe("forestal");
  });

  it("un orden viejo con ids que ya no existen se mira por lo que conoce", () => {
    expect(esOrdenDeFabrica(["inicio", "operaciones", "ventas", "config"], IDS_FABRICA)).toBe(true);
    expect(esOrdenDeFabrica(["ventas", "inicio"], IDS_FABRICA)).toBe(false);
    /* Con una sola conocida no hay orden que leer: cuenta como a mano (no se pierde lo guardado). */
    expect(hayOrdenManual(["finanzas"], IDS_FABRICA)).toBe(true);
    expect(hayOrdenManual([], IDS_FABRICA)).toBe(false);
  });
});
