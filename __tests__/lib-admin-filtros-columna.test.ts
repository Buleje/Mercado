/**
 * lib/admin/filtros-columna — el autofiltro tipo Excel genérico (Fase 1 del
 * frente «Filtros en la cabecera, para todo el admin», 2026-09-22).
 *
 * Trae los casos que ya estaban probados en `lib/forestal/ctp-secciones-filtro`
 * (Brandon 2026-09-03/10) sobre datos genéricos, más los casos nuevos de la
 * versión de 4 tipos de columna (texto/multi/rango/fecha).
 */
import { describe, expect, it } from "vitest";
import {
  aplicarFacetas,
  coincideFiltro,
  columnasOcultasConFiltro,
  columnaTieneAutofiltro,
  contarFacetas,
  enRango,
  facetasPuestas,
  filtroActivo,
  opcionesDeColumna,
  rangoActivo,
  textoDeRango,
  valoresDe,
  type ColumnaFiltro,
} from "@/lib/admin/filtros-columna";

interface Fila {
  id: string;
  especie: string | null;
  permisos: string[];
  cantidad: number | null;
  fecha: string | null;
}

const fila = (over: Partial<Fila> = {}): Fila => ({
  id: "x",
  especie: "Tornillo",
  permisos: [],
  cantidad: 10,
  fecha: "2026-05-26",
  ...over,
});

const claveEspecie = (v: string) => v.trim().toLocaleUpperCase("es-PE");

const colEspecie: ColumnaFiltro<Fila> = {
  id: "especie",
  label: "Especie",
  tipo: "texto",
  valor: (f) => f.especie,
  clave: claveEspecie,
};

const colPermisos: ColumnaFiltro<Fila> = {
  id: "permisos",
  label: "Permiso",
  tipo: "multi",
  valor: (f) => f.permisos,
};

const colCantidad: ColumnaFiltro<Fila> = {
  id: "cantidad",
  label: "Cantidad",
  tipo: "rango",
  numero: (f) => f.cantidad,
  unidad: "m³",
};

const colFecha: ColumnaFiltro<Fila> = {
  id: "fecha",
  label: "Fecha",
  tipo: "fecha",
  numero: (f) => f.fecha,
};

describe("filtroActivo / valoresDe", () => {
  it("una lista vacía o un rango sin topes no filtra nada", () => {
    expect(filtroActivo(undefined)).toBe(false);
    expect(filtroActivo([])).toBe(false);
    expect(filtroActivo({ min: null, max: null })).toBe(false);
    expect(filtroActivo(["Tornillo"])).toBe(true);
    expect(filtroActivo({ min: 5, max: null })).toBe(true);
  });

  it("valoresDe sólo lee listas — un rango no es una lista de valores", () => {
    expect(valoresDe(["a", "b"])).toEqual(["a", "b"]);
    expect(valoresDe({ min: 1, max: null })).toEqual([]);
  });
});

describe("coincideFiltro", () => {
  it("sin elegidos entra todo; con elegidos, OR entre ellos", () => {
    expect(coincideFiltro([], "Tornillo")).toBe(true);
    expect(coincideFiltro(["Tornillo", "Cachimbo"], "Cachimbo")).toBe(true);
    expect(coincideFiltro(["Tornillo"], "Shihuahuaco")).toBe(false);
  });

  it("respeta la clave de normalización — dos grafías, un valor", () => {
    expect(coincideFiltro(["tornillo"], "TORNILLO", claveEspecie)).toBe(true);
  });
});

describe("enRango / rangoActivo / textoDeRango", () => {
  it("sin topes no filtra nada", () => {
    expect(rangoActivo(undefined)).toBe(false);
    expect(rangoActivo({ min: null, max: null })).toBe(false);
    expect(enRango(5, undefined)).toBe(true);
  });

  it("respeta cada tope, inclusive en los bordes", () => {
    expect(enRango(5, { min: 5, max: null })).toBe(true);
    expect(enRango(4.99, { min: 5, max: null })).toBe(false);
    expect(enRango(5, { min: null, max: 5 })).toBe(true);
    expect(enRango(5.01, { min: null, max: 5 })).toBe(false);
  });

  it("un valor AUSENTE no entra en un rango pedido", () => {
    expect(enRango(null, { min: 50, max: null })).toBe(false);
    expect(enRango(Number.NaN, { min: 50, max: null })).toBe(false);
  });

  it("funciona igual con fechas ISO — comparan lexicográficamente como números", () => {
    expect(enRango("2026-05-10", { min: "2026-05-01", max: "2026-05-31" })).toBe(true);
    expect(enRango("2026-06-01", { min: "2026-05-01", max: "2026-05-31" })).toBe(false);
    expect(enRango(null, { min: "2026-05-01", max: null })).toBe(false);
  });

  it("se lee como se habla", () => {
    expect(textoDeRango("Cantidad", { min: 0.5, max: null }, { unidad: "m³" })).toBe("Cantidad ≥ 0.5 m³");
    expect(textoDeRango("Fecha", { min: null, max: "2026-05-31" }, { formatear: (v) => v })).toBe(
      "Fecha ≤ 2026-05-31",
    );
    expect(textoDeRango("Piezas", { min: 10, max: 20 })).toBe("Piezas 10 – 20");
  });
});

describe("opcionesDeColumna", () => {
  it("agrupa por clave y cuenta líneas cuando no hay peso", () => {
    const filas = [
      fila({ id: "a", especie: "Tornillo" }),
      fila({ id: "b", especie: "TORNILLO" }),
      fila({ id: "c", especie: "Shihuahuaco" }),
    ];
    const opts = opcionesDeColumna(filas, colEspecie);
    expect(opts).toHaveLength(2);
    const tornillo = opts.find((o) => o.value.toLowerCase() === "tornillo");
    expect(tornillo).toMatchObject({ count: 2 });
  });

  it("no inventa una opción vacía cuando el campo viene null", () => {
    const filas = [fila({ especie: null }), fila({ id: "b", especie: "  " })];
    expect(opcionesDeColumna(filas, colEspecie)).toEqual([]);
  });

  it("una columna multi cuenta una vez por cada valor propio, no reparte el peso", () => {
    const filas = [
      fila({ id: "p1", permisos: ["CONC-1"] }),
      fila({ id: "p2", permisos: ["CONC-1", "CONC-2"] }),
    ];
    const opts = opcionesDeColumna(filas, colPermisos);
    expect(opts.find((o) => o.value === "CONC-1")?.count).toBe(2);
    expect(opts.find((o) => o.value === "CONC-2")?.count).toBe(1);
  });

  it("rango y fecha no tienen opciones discretas", () => {
    expect(opcionesDeColumna([fila()], colCantidad)).toEqual([]);
    expect(opcionesDeColumna([fila()], colFecha)).toEqual([]);
  });

  it("con peso, ordena por peso y no por cantidad de líneas", () => {
    const conPeso: ColumnaFiltro<Fila> = { ...colEspecie, peso: (f) => f.cantidad ?? 0 };
    const filas = [
      fila({ id: "a", especie: "Tornillo", cantidad: 1 }),
      fila({ id: "b", especie: "Tornillo", cantidad: 1 }),
      fila({ id: "c", especie: "Cachimbo", cantidad: 30 }),
    ];
    const opts = opcionesDeColumna(filas, conPeso);
    expect(opts[0]).toMatchObject({ value: "Cachimbo", peso: 30 });
    expect(opts[1]).toMatchObject({ value: "Tornillo", count: 2, peso: 2 });
  });
});

describe("columnaTieneAutofiltro", () => {
  it("por defecto siempre aparece (el embudo de Excel en un libro paginado)", () => {
    expect(columnaTieneAutofiltro([fila({ especie: "Tornillo" })], colEspecie)).toBe(true);
  });

  it("con soloConVarios, sólo si hay 2+ valores distintos (listas chicas y fijas)", () => {
    const col: ColumnaFiltro<Fila> = { ...colEspecie, soloConVarios: true };
    expect(columnaTieneAutofiltro([fila({ especie: "Tornillo" })], col)).toBe(false);
    expect(
      columnaTieneAutofiltro([fila({ especie: "Tornillo" }), fila({ id: "b", especie: "Cachimbo" })], col),
    ).toBe(true);
  });

  it("rango y fecha siempre aparecen, soloConVarios no les aplica", () => {
    expect(columnaTieneAutofiltro([fila()], { ...colCantidad, soloConVarios: true })).toBe(true);
  });
});

describe("aplicarFacetas — AND entre columnas, OR adentro de cada una", () => {
  const filas = [
    fila({ id: "a", especie: "Tornillo", permisos: ["CONC-1"], cantidad: 5, fecha: "2026-05-01" }),
    fila({ id: "b", especie: "Cachimbo", permisos: ["CONC-2"], cantidad: 15, fecha: "2026-05-15" }),
    fila({ id: "c", especie: "Tornillo", permisos: ["CONC-2"], cantidad: 25, fecha: null }),
  ];
  const columnas = [colEspecie, colPermisos, colCantidad, colFecha];

  it("sin facetas devuelve todo", () => {
    expect(aplicarFacetas(filas, columnas, {})).toHaveLength(3);
  });

  it("una lista con varios valores es OR", () => {
    expect(aplicarFacetas(filas, columnas, { especie: ["Tornillo", "Cachimbo"] }).map((f) => f.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("dos columnas se cruzan con AND", () => {
    expect(
      aplicarFacetas(filas, columnas, { especie: ["Tornillo"], permisos: ["CONC-2"] }).map((f) => f.id),
    ).toEqual(["c"]);
  });

  it("una lista vacía no filtra — no es «ninguno»", () => {
    expect(aplicarFacetas(filas, columnas, { especie: [] })).toHaveLength(3);
  });

  it("respeta la clave de normalización dentro del filtro", () => {
    const conGrafia = [...filas, fila({ id: "d", especie: "TORNILLO" })];
    expect(aplicarFacetas(conGrafia, columnas, { especie: ["tornillo"] }).map((f) => f.id)).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("un rango numérico deja afuera lo que no entra, y lo sin dato queda afuera de un rango pedido", () => {
    expect(aplicarFacetas(filas, columnas, { cantidad: { min: 10, max: null } }).map((f) => f.id)).toEqual([
      "b",
      "c",
    ]);
    const conNulo = [...filas, fila({ id: "z", cantidad: null })];
    expect(aplicarFacetas(conNulo, columnas, { cantidad: { min: 0, max: null } }).map((f) => f.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("un rango de fecha excluye la fila sin fecha", () => {
    expect(
      aplicarFacetas(filas, columnas, { fecha: { min: "2026-05-01", max: "2026-05-31" } }).map((f) => f.id),
    ).toEqual(["a", "b"]);
  });

  it("una columna multi sin dato no entra en un filtro puesto", () => {
    const sinPermiso = [...filas, fila({ id: "e", permisos: [] })];
    expect(aplicarFacetas(sinPermiso, columnas, { permisos: ["CONC-1"] }).map((f) => f.id)).toEqual(["a"]);
  });
});

describe("contarFacetas / facetasPuestas / columnasOcultasConFiltro", () => {
  const columnas = [colEspecie, colPermisos, colCantidad];

  it("cuenta columnas acotadas, no valores tildados", () => {
    expect(contarFacetas({})).toBe(0);
    expect(contarFacetas({ especie: ["Tornillo", "Cachimbo", "Shihuahuaco"] })).toBe(1);
    expect(contarFacetas({ especie: ["Tornillo"], cantidad: { min: 5, max: null } })).toBe(2);
  });

  it("los chips describen un valor solo, una lista, y un rango con su unidad", () => {
    const chips = facetasPuestas(columnas, {
      especie: ["Tornillo"],
      permisos: ["CONC-1", "CONC-2"],
      cantidad: { min: 5, max: null },
    });
    expect(chips.find((c) => c.id === "especie")?.texto).toBe("Tornillo");
    expect(chips.find((c) => c.id === "permisos")?.texto).toBe("Permiso: 2 elegidos");
    expect(chips.find((c) => c.id === "cantidad")?.texto).toBe("Cantidad ≥ 5 m³");
  });

  it("un rango sin topes no genera chip", () => {
    expect(facetasPuestas(columnas, { cantidad: { min: null, max: null } })).toEqual([]);
  });

  it("el filtro huérfano: una columna oculta con filtro puesto se sigue listando", () => {
    const ocultaEspecie = { ...colEspecie, visible: false };
    expect(
      columnasOcultasConFiltro([ocultaEspecie, colPermisos], { especie: ["Tornillo"] }).map((c) => c.id),
    ).toEqual(["especie"]);
    // Oculta pero SIN filtro puesto: no hay nada que rescatar.
    expect(columnasOcultasConFiltro([ocultaEspecie, colPermisos], {})).toEqual([]);
    // Visible: aunque tenga filtro, ya se ve en su cabecera — no es huérfano.
    expect(columnasOcultasConFiltro([colEspecie, colPermisos], { especie: ["Tornillo"] })).toEqual([]);
  });
});
