/**
 * La columna del título habilitante del radar.
 *
 * Lo que se blinda: el título habilitante es el origen LEGAL de la madera —lo
 * que pregunta OSINFOR y lo que exige EUDR—. Si la cobertura miente, el libro
 * se ve trazado hasta el monte cuando en realidad la mitad del volumen no dice
 * de qué predio salió. Y si el nodo «sin título» se ordena como un origen más,
 * el pendiente se disimula entre los buenos.
 */
import { describe, expect, it } from "vitest";
import {
  analizarTitulos,
  esTitulo,
  ID_SIN_TITULO,
  nombreTipoOrigen,
  PREFIJO_TITULO,
  type IngresoConOrigen,
} from "@/lib/forestal/ctp-radar-titulos";

const ing = (
  id: string,
  volumeM3: number,
  originCode?: string | null,
  extra: Partial<IngresoConOrigen & { cites: boolean }> = {},
) => ({ id, volumeM3, originCode, ...extra });

describe("agrupación por título habilitante", () => {
  it("junta los ingresos del mismo título y suma su volumen", () => {
    const r = analizarTitulos([
      ing("w1", 10, "CON-25-UCA-0142"),
      ing("w2", 5.5, "CON-25-UCA-0142"),
      ing("w3", 3, "CON-25-PAS-0033"),
    ]);
    expect(r.titulos).toHaveLength(2);
    const uca = r.titulos.find((t) => t.codigo === "CON-25-UCA-0142");
    expect(uca?.volumeM3).toBe(15.5);
    expect(uca?.ingresos).toEqual(["w1", "w2"]);
  });

  it("una arista por ingreso, con el volumen de ESE ingreso", () => {
    const r = analizarTitulos([ing("w1", 10, "T1"), ing("w2", 5, "T1")]);
    expect(r.aristas).toEqual([
      { from: `${PREFIJO_TITULO}T1`, to: "w1", valor: 10 },
      { from: `${PREFIJO_TITULO}T1`, to: "w2", valor: 5 },
    ]);
  });

  it("los que no declaran título caen en un solo nodo aparte", () => {
    const r = analizarTitulos([ing("w1", 10, null), ing("w2", 4), ing("w3", 6, "  ")]);
    expect(r.titulos).toHaveLength(1);
    expect(r.titulos[0].id).toBe(ID_SIN_TITULO);
    expect(r.titulos[0].codigo).toBeNull();
    expect(r.titulos[0].volumeM3).toBe(20);
    expect(r.ingresosSinTitulo).toBe(3);
  });

  it("un código en blanco NO es un título (no se cuenta como cubierto)", () => {
    const r = analizarTitulos([ing("w1", 8, "   ")]);
    expect(r.conTituloM3).toBe(0);
    expect(r.sinTituloM3).toBe(8);
    expect(r.cobertura).toBe(0);
  });

  it("la cobertura es el volumen con título sobre el total", () => {
    const r = analizarTitulos([ing("w1", 30, "T1"), ing("w2", 10, null)]);
    expect(r.conTituloM3).toBe(30);
    expect(r.sinTituloM3).toBe(10);
    expect(r.cobertura).toBe(75);
  });

  it("sin ingresos la cobertura es null, no 0 (0% se leería como «nada trazado»)", () => {
    const r = analizarTitulos([]);
    expect(r.cobertura).toBeNull();
    expect(r.titulos).toEqual([]);
    expect(r.hayDatos).toBe(false);
  });

  it("«sin título» va SIEMPRE último aunque sea el más pesado", () => {
    const r = analizarTitulos([
      ing("w1", 1000, null),
      ing("w2", 5, "T-chico"),
      ing("w3", 50, "T-grande"),
    ]);
    expect(r.titulos.map((t) => t.codigo)).toEqual(["T-grande", "T-chico", null]);
  });

  it("los títulos se ordenan por volumen descendente", () => {
    const r = analizarTitulos([ing("a", 1, "A"), ing("b", 9, "B"), ing("c", 5, "C")]);
    expect(r.titulos.map((t) => t.codigo)).toEqual(["B", "C", "A"]);
  });

  it("el tipo se toma del primer ingreso que lo traiga cargado", () => {
    const r = analizarTitulos([
      ing("w1", 1, "T1", { originType: null }),
      ing("w2", 1, "T1", { originType: "concesion" }),
    ]);
    expect(r.titulos[0].tipo).toBe("Concesión forestal");
  });

  it("un tipo desconocido no se inventa: queda en null", () => {
    const r = analizarTitulos([ing("w1", 1, "T1", { originType: "marciano" })]);
    expect(r.titulos[0].tipo).toBeNull();
    expect(nombreTipoOrigen("marciano")).toBeNull();
    expect(nombreTipoOrigen(null)).toBeNull();
  });

  it("el título hereda el CITES de cualquiera de sus ingresos", () => {
    const r = analizarTitulos([
      ing("w1", 1, "T1", { cites: false }),
      ing("w2", 1, "T1", { cites: true }),
      ing("w3", 1, "T2", { cites: false }),
    ]);
    expect(r.titulos.find((t) => t.codigo === "T1")?.cites).toBe(true);
    expect(r.titulos.find((t) => t.codigo === "T2")?.cites).toBe(false);
  });

  it("hayDatos es false si NINGUNO declara título (la columna no aportaría nada)", () => {
    expect(analizarTitulos([ing("w1", 5, null), ing("w2", 3)]).hayDatos).toBe(false);
    expect(analizarTitulos([ing("w1", 5, "T1"), ing("w2", 3)]).hayDatos).toBe(true);
  });

  it("un volumen no numérico cuenta como 0 y no ensucia la suma", () => {
    const r = analizarTitulos([
      ing("w1", Number.NaN, "T1"),
      ing("w2", 4, "T1"),
      ing("w3", Number.POSITIVE_INFINITY, "T1"),
    ]);
    expect(r.titulos[0].volumeM3).toBe(4);
    expect(r.conTituloM3).toBe(4);
  });

  it("los decimales no arrastran error de coma flotante", () => {
    const r = analizarTitulos([ing("w1", 0.1, "T1"), ing("w2", 0.2, "T1")]);
    expect(r.titulos[0].volumeM3).toBe(0.3);
  });

  it("esTitulo distingue los ids de la columna nueva", () => {
    expect(esTitulo(`${PREFIJO_TITULO}CON-1`)).toBe(true);
    expect(esTitulo(ID_SIN_TITULO)).toBe(true);
    expect(esTitulo("w1")).toBe(false);
    expect(esTitulo("grp:ing:Tornillo")).toBe(false);
  });
});
