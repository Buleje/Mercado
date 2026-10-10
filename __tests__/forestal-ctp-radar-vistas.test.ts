/**
 * Vistas guardadas del radar.
 *
 * Lo que se blinda: que guardar dos veces con el mismo nombre actualice la
 * vista en vez de dejar dos gemelas, y que una vista guardada por una versión
 * anterior no vuelva con medidas imposibles — un `zoom: 900` o un ancho de
 * bloque de cinco cifras dibujan un lienzo que cuelga la pestaña.
 */
import { describe, expect, it } from "vitest";
import { APARIENCIA_DEFAULT } from "@/components/admin/forestal/ctp-radar-apariencia";
import {
  borrarDeLista,
  guardarEnLista,
  idDeNombre,
  MAX_VISTAS,
  normalizarNombre,
  sanearLista,
  type EstadoVista,
} from "@/components/admin/forestal/ctp-radar-vistas";

const estado: EstadoVista = {
  apariencia: APARIENCIA_DEFAULT,
  orden: "linea",
  foco: "todos",
  agruparManual: null,
  zoom: 1,
};

describe("nombre de la vista", () => {
  it("recorta, colapsa espacios y limita el largo", () => {
    expect(normalizarNombre("   Cierre   de    mes  ")).toBe("Cierre de mes");
    expect(normalizarNombre("x".repeat(80))).toHaveLength(40);
  });

  it("el id ignora mayúsculas y espacios de más", () => {
    expect(idDeNombre("  Cierre   DE Mes ")).toBe(idDeNombre("cierre de mes"));
  });
});

describe("lista de vistas", () => {
  it("guardar dos veces el mismo nombre actualiza, no duplica", () => {
    const a = guardarEnLista([], "Cierre de mes", estado);
    const b = guardarEnLista(a, "  cierre DE mes ", { ...estado, zoom: 0.5 });
    expect(b).toHaveLength(1);
    expect(b[0].zoom).toBe(0.5);
    expect(b[0].nombre).toBe("cierre DE mes");
  });

  it("la última guardada queda primera", () => {
    let l = guardarEnLista([], "A", estado);
    l = guardarEnLista(l, "B", estado);
    l = guardarEnLista(l, "C", estado);
    expect(l.map((v) => v.nombre)).toEqual(["C", "B", "A"]);
  });

  it("un nombre vacío no crea nada", () => {
    expect(guardarEnLista([], "   ", estado)).toEqual([]);
  });

  it("no pasa del tope y descarta la más vieja", () => {
    let l: ReturnType<typeof guardarEnLista> = [];
    for (let i = 0; i < MAX_VISTAS + 5; i++) l = guardarEnLista(l, `V${i}`, estado);
    expect(l).toHaveLength(MAX_VISTAS);
    expect(l[0].nombre).toBe(`V${MAX_VISTAS + 4}`);
    expect(l.some((v) => v.nombre === "V0")).toBe(false);
  });

  it("borrar saca sólo la pedida", () => {
    let l = guardarEnLista([], "A", estado);
    l = guardarEnLista(l, "B", estado);
    const r = borrarDeLista(l, idDeNombre("A"));
    expect(r.map((v) => v.nombre)).toEqual(["B"]);
  });

  it("guardar no muta la lista que recibe", () => {
    const original = guardarEnLista([], "A", estado);
    const copia = [...original];
    guardarEnLista(original, "B", estado);
    expect(original).toEqual(copia);
  });
});

describe("saneado de lo guardado", () => {
  const cruda = (extra: Record<string, unknown> = {}) => [{
    id: "v", nombre: "V",
    apariencia: { dims: { w: 196, h: 62, gapY: 14, gapX: 104 }, colores: {}, etiquetasArista: true },
    orden: "linea", foco: "todos", agruparManual: null, zoom: 1,
    ...extra,
  }];

  it("acepta una vista bien formada", () => {
    const r = sanearLista(cruda());
    expect(r).toHaveLength(1);
    expect(r[0].apariencia.dims.w).toBe(196);
  });

  it("recorta medidas imposibles a los límites vigentes", () => {
    const r = sanearLista([{ ...cruda()[0], apariencia: { dims: { w: 99999, h: -5, gapY: 1e9, gapX: 0 }, colores: {}, etiquetasArista: true } }]);
    expect(r[0].apariencia.dims.w).toBe(340);
    expect(r[0].apariencia.dims.h).toBe(46);
    expect(r[0].apariencia.dims.gapY).toBe(44);
    expect(r[0].apariencia.dims.gapX).toBe(60);
  });

  it("acota el zoom guardado", () => {
    expect(sanearLista(cruda({ zoom: 900 }))[0].zoom).toBe(3);
    expect(sanearLista(cruda({ zoom: 0.001 }))[0].zoom).toBe(0.25);
  });

  it("un zoom corrupto NO tira la vista entera: vuelve al 100%", () => {
    // `JSON.stringify(NaN)` deja `null`, así que este es el caso que llega de verdad.
    for (const malo of [Number.NaN, null, "mucho", undefined]) {
      const r = sanearLista(cruda({ zoom: malo }));
      expect(r).toHaveLength(1);
      expect(r[0].zoom).toBe(1);
      expect(r[0].nombre).toBe("V");
    }
  });

  it("una vista de una versión vieja (sin los campos nuevos) sigue cargando", () => {
    const r = sanearLista(cruda());
    expect(r[0].apariencia.altoPorCantidad).toBe(APARIENCIA_DEFAULT.altoPorCantidad);
    expect(r[0].apariencia.columnaTitulo).toBe(APARIENCIA_DEFAULT.columnaTitulo);
  });

  it("descarta colores que no son de una columna conocida", () => {
    const r = sanearLista(cruda({
      apariencia: { dims: { w: 196, h: 62, gapY: 14, gapX: 104 }, colores: { ingreso: "#ff0000", inventado: "#00ff00" }, etiquetasArista: true },
    }));
    expect(r[0].apariencia.colores).toEqual({ ingreso: "#ff0000" });
  });

  it("basura devuelve lista vacía en vez de reventar", () => {
    expect(sanearLista(null)).toEqual([]);
    expect(sanearLista("no soy json")).toEqual([]);
    expect(sanearLista([{ nombre: "sin lo demás" }])).toEqual([]);
    expect(sanearLista(cruda({ orden: "inventado" }))).toEqual([]);
  });

  it("nunca devuelve más del tope aunque el storage traiga de más", () => {
    const muchas = Array.from({ length: 50 }, (_, i) => ({ ...cruda()[0], id: `v${i}`, nombre: `V${i}` }));
    expect(sanearLista(muchas)).toHaveLength(MAX_VISTAS);
  });
});
