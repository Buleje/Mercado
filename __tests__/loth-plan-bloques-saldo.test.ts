/**
 * Saldo por bloque (Brandon 25-10): autorizado del reparto − lo registrado cuyo
 * bloque se sabe (por su GTF preliminar) − lo preliminar pendiente; se pasa con
 * `excedeTechoM3` (3 decimales, como el freno); la anulada no cuenta; lo del
 * libro sin preliminar queda «sin bloque asignado» (nunca se reparte a ojo).
 */
import { describe, it, expect } from "vitest";
import {
  previsualizarBloques,
  saldoPorBloques,
  SIN_BLOQUES,
  textoDeExceso,
  type BloqueAutorizado,
  type EspecieConUsos,
} from "@/lib/forestal/loth-plan-bloques-saldo";
import { delLibroDeLaGuia, faltaPorRegistrar, type GtfPreliminarVista } from "@/lib/forestal/loth-plan-preliminares";

type P = Pick<GtfPreliminarVista, "id" | "numeroGtf" | "numerosLt" | "estado" | "cuenta" | "faltan" | "lineas" | "gtfId">;

const REPARTO: BloqueAutorizado[] = [
  { nombre: "Bloque 1", especies: [{ speciesCommon: "Tornillo", volumenM3: 50 }] },
  { nombre: "Bloque 2", especies: [{ speciesCommon: "Tornillo", volumenM3: 30 }, { speciesCommon: "Capirona", volumenM3: 5 }] },
];

const especie = (usadoM3: number, guias: EspecieConUsos["guias"]): EspecieConUsos => ({
  clave: "tornillo",
  especie: "Tornillo (Cedrelinga catenaeformis)",
  autorizadoM3: 80,
  usadoM3,
  quedaM3: 80 - usadoM3,
  guias,
});

const pre = (id: string, numeroGtf: string, estado: P["estado"], cuenta: boolean, lineas: P["lineas"], faltan: P["faltan"] = cuenta ? lineas : []): P => ({
  id, numeroGtf, numerosLt: ["19-000002"], estado, cuenta, faltan, lineas, gtfId: null,
});
const linea = (bloque: string | null, m3: number, trozas = 10, esp = "Tornillo (Cedrelinga catenaeformis)") => ({ especie: esp, trozas, m3, bloque });

describe("saldoPorBloques", () => {
  it("sin reparto no hay bloques: el saldo es el del plan", () => {
    expect(saldoPorBloques([], [especie(10, [])], [])).toBe(SIN_BLOQUES);
  });

  it("lo registrado va al bloque de su preliminar; lo que no tiene preliminar queda sin bloque", () => {
    const especies = [
      especie(30, [
        { gtfNumber: "19-000015", m3: 20, trozas: 30, sinPlan: false },
        { gtfNumber: "19-000016", m3: 10, trozas: 12, sinPlan: false },
      ]),
    ];
    const r = saldoPorBloques(REPARTO, especies, [pre("a", "19-000015", "registrada", false, [linea("Bloque 1", 19.5, 30)])]);
    const b1 = r.bloques[0]!.especies.find((e) => e.clave === "tornillo")!;
    // El m³ es el del LIBRO (20), no el que se escribió en la preliminar (19,5).
    expect(b1).toMatchObject({ autorizadoM3: 50, usadoM3: 20, usadoTrozas: 30, quedaM3: 30, quedaSiSeRegistranM3: 30, excede: false });
    expect(r.bloques[0]!.guias).toMatchObject([{ numeroGtf: "19-000015", estado: "registrada", m3: 20, preliminarId: "a" }]);
    expect(r.sinBloque.usadoM3).toBe(10);
    expect(r.sinBloque.especies[0]!.guias).toMatchObject([{ numeroGtf: "19-000016", motivo: "sin_preliminar", m3: 10 }]);
  });

  it("se pasa: usado + pendiente > autorizado del bloque, con su cifra y las preliminares a corregir", () => {
    const especies = [especie(0, [])];
    const r = saldoPorBloques(REPARTO, especies, [pre("c", "19-000020", "pendiente", true, [linea("Bloque 2", 43.261, 40)])]);
    const b2 = r.bloques[1]!.especies.find((e) => e.clave === "tornillo")!;
    expect(b2).toMatchObject({ pendienteM3: 43.261, quedaM3: 30, quedaSiSeRegistranM3: -13.261, excede: true, excedeHoy: false, pasaPorM3: 13.261 });
    expect(r.excesos).toMatchObject([{ bloque: "Bloque 2", clave: "tornillo", pasaPorM3: 13.261, preliminarIds: ["c"], enElReparto: true }]);
    expect(textoDeExceso(r.excesos[0]!)).toBe("Bloque 2 · Tornillo (Cedrelinga catenaeformis) se pasa por 13.261 m³ — revisa y corrige");
    expect(r.bloques[1]!.excede).toBe(true);
    expect(r.bloques[0]!.excede).toBe(false);
  });

  it("no se pasa en el borde: 30,0004 contra 30 es igual a 3 decimales (excedeTechoM3)", () => {
    const r = saldoPorBloques(REPARTO, [especie(0, [])], [pre("c", "19-000020", "pendiente", true, [linea("Bloque 2", 30.0004)])]);
    expect(r.bloques[1]!.especies.find((e) => e.clave === "tornillo")!.excede).toBe(false);
    expect(r.excesos).toHaveLength(0);
  });

  it("la preliminar anulada no cuenta ni aparece en las guías del bloque", () => {
    const r = saldoPorBloques(REPARTO, [especie(0, [])], [pre("d", "19-000030", "anulada", false, [linea("Bloque 1", 99)])]);
    expect(r.bloques[0]!.especies[0]).toMatchObject({ pendienteM3: 0, excede: false });
    expect(r.bloques[0]!.guias).toHaveLength(0);
    expect(r.excesos).toHaveLength(0);
  });

  it("varios bloques en una guía: se parte sólo si los m³ del libro son los de la preliminar", () => {
    const lineas = [linea("Bloque 1", 5, 6), linea("Bloque 2", 7, 8)];
    const igual = saldoPorBloques(REPARTO, [especie(12, [{ gtfNumber: "1-15", m3: 12, trozas: 14, sinPlan: false }])], [pre("v", "001-0000015", "registrada", false, lineas)]);
    expect(igual.bloques.map((b) => b.especies.find((e) => e.clave === "tornillo")!.usadoM3)).toEqual([5, 7]);
    expect(igual.sinBloque.usadoM3).toBe(0);
    const distinto = saldoPorBloques(REPARTO, [especie(12.5, [{ gtfNumber: "1-15", m3: 12.5, trozas: 14, sinPlan: false }])], [pre("v", "001-0000015", "registrada", false, lineas)]);
    expect(distinto.bloques.map((b) => b.especies.find((e) => e.clave === "tornillo")!.usadoM3)).toEqual([0, 0]);
    expect(distinto.sinBloque.especies[0]!.guias[0]!.motivo).toBe("varios_bloques");
    expect(distinto.sinBloque.usadoM3).toBe(12.5);
  });

  it("varios bloques con m³ distintos: la guía sale UNA vez, sin bloque, y no también «sin descontar» en cada bloque", () => {
    const r = saldoPorBloques(REPARTO, [especie(15, [{ gtfNumber: "19-000120", m3: 15, trozas: 5, sinPlan: false }])], [
      pre("v", "19-000120", "registrada", false, [linea("Bloque 1", 10), linea("Bloque 2", 10)]),
    ]);
    expect(r.bloques.flatMap((b) => b.guias)).toEqual([]);
    expect(r.sinBloque.especies[0]!.guias).toMatchObject([{ numeroGtf: "19-000120", motivo: "varios_bloques", m3: 15 }]);
    expect(r.sinBloque.usadoM3).toBe(15);
  });

  it("una especie que el bloque no tiene: autorizado 0 y aviso propio", () => {
    const cap = (m3: number) => linea("Bloque 1", m3, 2, "Capirona");
    const r = saldoPorBloques(REPARTO, [especie(0, [])], [pre("k", "19-000040", "pendiente", true, [cap(2)])]);
    expect(r.excesos).toMatchObject([{ bloque: "Bloque 1", clave: "capirona", enElReparto: false, pasaPorM3: 2 }]);
    expect(textoDeExceso(r.excesos[0]!)).toMatch(/Capirona no está en ese bloque/);
  });

  it("registrada sin despacho en el libro: se lista, no descuenta", () => {
    const r = saldoPorBloques(REPARTO, [especie(0, [])], [pre("s", "19-000050", "registrada", false, [linea("Bloque 1", 8)])]);
    expect(r.bloques[0]!.especies[0]!.usadoM3).toBe(0);
    expect(r.bloques[0]!.guias).toMatchObject([{ numeroGtf: "19-000050", estado: "sin_descontar", m3: 8 }]);
  });
});

describe("previsualizarBloques (la ventana)", () => {
  it("lo escrito se suma como pendiente y la que se corrige no cuenta dos veces", () => {
    const base = saldoPorBloques(REPARTO, [especie(0, [])], [pre("c", "19-000020", "pendiente", true, [linea("Bloque 2", 25)])]);
    const { antes, con } = previsualizarBloques(base, [especie(0, [])], [pre("c", "19-000020", "pendiente", true, [linea("Bloque 2", 25)])], {
      numeroGtf: "19-000020",
      numerosLt: ["19-000002"],
      lineas: [linea("Bloque 2", 31)],
    }, "c");
    expect(antes.bloques[1]!.especies.find((e) => e.clave === "tornillo")!.pendienteM3).toBe(0);
    expect(con.bloques[1]!.especies.find((e) => e.clave === "tornillo")).toMatchObject({ pendienteM3: 31, excede: true, pasaPorM3: 1 });
  });

  it("con el N.º ya en el libro no descuenta otra vez: ata lo del libro al bloque, como el servidor al guardarla", () => {
    const libro = [especie(12, [{ gtfNumber: "19-000016", m3: 12, trozas: 4, sinPlan: false }])];
    const { con } = previsualizarBloques({ reparto: REPARTO }, libro, [], { numeroGtf: "19-16", numerosLt: [], lineas: [linea("Bloque 2", 12)] });
    const guardada = saldoPorBloques(REPARTO, libro, [pre("n", "19-16", "registrada", false, [linea("Bloque 2", 12)])]);
    const b2 = (r: typeof con) => r.bloques[1]!.especies.find((e) => e.clave === "tornillo")!;
    expect(b2(con)).toMatchObject({ usadoM3: 12, pendienteM3: 0 });
    expect(con.sinBloque.usadoM3).toBe(0);
    expect(b2(con)).toMatchObject({ usadoM3: b2(guardada).usadoM3, pendienteM3: b2(guardada).pendienteM3, quedaM3: b2(guardada).quedaM3 });
  });

  it("con un solo bloque, lo escrito sin bloque va a ése", () => {
    const uno: BloqueAutorizado[] = [{ nombre: "Único", especies: [{ speciesCommon: "Tornillo", volumenM3: 10 }] }];
    const { con } = previsualizarBloques({ reparto: uno }, [especie(0, [])], [], { numeroGtf: "", numerosLt: [], lineas: [linea(null, 4)] });
    expect(con.bloques[0]!.especies[0]).toMatchObject({ pendienteM3: 4, quedaSiSeRegistranM3: 6 });
    expect(con.sinBloque.pendienteM3).toBe(0);
  });
});

describe("arreglos del revisor (r2)", () => {
  const T = "Tornillo (Cedrelinga catenaeformis)";
  const libro120 = [especie(2.761, [{ gtfNumber: "001-0000120", m3: 2.761, trozas: 3, sinPlan: false }])];
  /* Como `delPlan`: pendiente, su N.º ya en el libro (no `cuenta`) y lo que falta por `faltaPorRegistrar`. */
  const parcial = (lineas: P["lineas"], especies = libro120) => pre("p", "1-120", "pendiente", false, lineas, faltaPorRegistrar(lineas, delLibroDeLaGuia("1-120", especies)));

  it("1 · preliminar con parte en el libro: lo que falta (43,261 − 2,761) sigue en su bloque y vuelve el aviso", () => {
    const r = saldoPorBloques(REPARTO, libro120, [parcial([linea("Bloque 2", 43.261, 40)])]);
    const b2 = r.bloques[1]!;
    expect(b2.especies.find((e) => e.clave === "tornillo")).toMatchObject({ usadoM3: 2.761, pendienteM3: 40.5, pendienteTrozas: 37, excede: true, pasaPorM3: 13.261 });
    expect(b2.guias.map((g) => [g.estado, g.m3])).toEqual([["pendiente", 40.5], ["registrada", 2.761]]);
    expect(r.excesos).toMatchObject([{ bloque: "Bloque 2", pasaPorM3: 13.261, preliminarIds: ["p"] }]);
    expect(r.sinBloque.especies).toEqual([]);
  });

  it("1 · nunca negativo: con el libro en lo declarado o más, no queda nada pendiente", () => {
    const lleno = [especie(50, [{ gtfNumber: "001-0000120", m3: 50, trozas: 50, sinPlan: false }])];
    expect(faltaPorRegistrar([linea("Bloque 2", 43.261)], delLibroDeLaGuia("1-120", lleno))).toEqual([]);
    const r = saldoPorBloques(REPARTO, lleno, [parcial([linea("Bloque 2", 43.261)], lleno)]);
    expect(r.bloques[1]!.especies.find((e) => e.clave === "tornillo")).toMatchObject({ usadoM3: 50, pendienteM3: 0 });
  });

  it("1 · repartida en varios bloques con parte en el libro: lo que falta va sin bloque, no se parte a ojo", () => {
    const r = saldoPorBloques(REPARTO, [especie(5, [{ gtfNumber: "001-0000120", m3: 5, trozas: 2, sinPlan: false }])], [
      parcial([linea("Bloque 1", 10), linea("Bloque 2", 10)], [especie(5, [{ gtfNumber: "001-0000120", m3: 5, trozas: 2, sinPlan: false }])]),
    ]);
    expect(r.bloques.flatMap((b) => b.especies).every((e) => e.pendienteM3 === 0 && e.usadoM3 === 0)).toBe(true);
    expect(r.sinBloque).toMatchObject({ usadoM3: 5, pendienteM3: 15 });
    expect(r.sinBloque.especies[0]!.guias.map((g) => [g.estado, g.m3, g.motivo])).toEqual([["pendiente", 15, "varios_bloques"], ["registrada", 5, "varios_bloques"]]);
  });

  it("1 · la ventana descuenta sólo lo que falta del N.º que ya está en el libro", () => {
    const { con } = previsualizarBloques({ reparto: REPARTO }, libro120, [], { numeroGtf: "001-0000120", numerosLt: [], lineas: [linea("Bloque 2", 43.261, 40)] });
    expect(con.bloques[1]!.especies.find((e) => e.clave === "tornillo")).toMatchObject({ usadoM3: 2.761, pendienteM3: 40.5, excede: true });
  });

  it("3 · total del bloque: lo que se pasa una especie no lo tapa lo libre de otra", () => {
    const r = saldoPorBloques(REPARTO, [especie(0, [])], [pre("t", "19-000030", "pendiente", true, [linea("Bloque 2", 43.261, 40, T)])]);
    expect(r.bloques[1]!.total).toMatchObject({ autorizadoM3: 35, quedaSiSeRegistranM3: -8.261, disponibleM3: 5, seExcedeM3: 13.261 });
    expect(r.bloques[0]!.total).toMatchObject({ disponibleM3: 50, seExcedeM3: 0 });
  });

  it("4 · las guías suman más que lo que mide el libro: «no cuadra», no se descarta", () => {
    const g = (n: string, m3: number) => ({ gtfNumber: n, m3, trozas: 1, sinPlan: false });
    expect(saldoPorBloques(REPARTO, [especie(10, [g("19-1", 8), g("19-2", 7)])], []).noCuadra).toEqual([{ clave: "tornillo", especie: T, usadoM3: 10, guiasM3: 15 }]);
    expect(saldoPorBloques(REPARTO, [especie(15, [g("19-1", 8), g("19-2", 7)])], []).noCuadra).toEqual([]);
  });

  it("5 · anotada sin bloque: su motivo es «se anotó sin bloque»; con un solo bloque va a ése", () => {
    const sin = saldoPorBloques(REPARTO, [especie(0, [])], [pre("s", "19-000050", "pendiente", true, [linea(null, 4)])]);
    expect(sin.sinBloque.especies[0]!.guias).toMatchObject([{ motivo: "sin_bloque", m3: 4 }]);
    const uno: BloqueAutorizado[] = [{ nombre: "Único", especies: [{ speciesCommon: "Tornillo", volumenM3: 10 }] }];
    const r = saldoPorBloques(uno, [especie(0, [])], [pre("s", "19-000050", "pendiente", true, [linea(null, 4)])]);
    expect(r.bloques[0]!.especies[0]).toMatchObject({ pendienteM3: 4 });
    expect(r.sinBloque.especies).toEqual([]);
  });
});
