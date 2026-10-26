import { describe, expect, it } from "vitest";
import { filaVacia } from "@/lib/forestal/cubicacion-pegar";
import { clasificarCelda, fraseResumen, resumirTipos } from "@/components/admin/forestal/cubicador-pegar-tipo-dato";

describe("clasificarCelda", () => {
  it.each(["2,5", "2.5", "1/2", "2 1/2", '2"', "8"])("número «%s» en Espesor = ok", (v) => {
    expect(clasificarCelda("espesor", v).tipo).toBe("ok");
  });
  it("letras en una columna numérica = error con motivo", () => {
    const r = clasificarCelda("espesor", "abc");
    expect(r.tipo).toBe("error");
    expect(r.motivo).toBe("Espesor espera un número; dice «abc»");
    expect(clasificarCelda("cantidad", '"').tipo).toBe("error");
  });
  it("vacío no se marca", () => {
    expect(clasificarCelda("largo", "  ").tipo).toBe("vacio");
    expect(clasificarCelda("especie", "").tipo).toBe("vacio");
  });
  it("especie y dueño: nombre ok, sólo número = aviso", () => {
    expect(clasificarCelda("especie", "Tornillo").tipo).toBe("ok");
    expect(clasificarCelda("especie", "12").tipo).toBe("aviso");
    expect(clasificarCelda("especie", "2.5").tipo).toBe("aviso");
    expect(clasificarCelda("dueno", "45").tipo).toBe("aviso");
    expect(clasificarCelda("dueno", "Juan 2").tipo).toBe("ok");
  });
  it("observación acepta cualquier cosa", () => {
    expect(clasificarCelda("observacion", "12").tipo).toBe("ok");
  });
});

describe("resumirTipos", () => {
  const fila = (o: Partial<ReturnType<typeof filaVacia>>) => ({ ...filaVacia(), ...o });
  it("cuenta rojas, ámbar y halla la primera", () => {
    const r = resumirTipos([
      fila({ cantidad: "2", espesor: "abc", especie: "Tornillo" }),
      fila({ cantidad: "3", espesor: "2", especie: "45" }),
      fila({ cantidad: "x" }),
    ]);
    expect(r).toMatchObject({ rojas: 2, ambar: 1, primera: { fila: 0, col: 1 } });
    expect(fraseResumen(r)).toBe("2 celdas en rojo y 1 en ámbar no corresponden a su columna");
  });
  it("columna entera mal = corrida", () => {
    const r = resumirTipos([fila({ espesor: "abc", especie: "12" }), fila({ espesor: "de", especie: "34" })]);
    expect(r.corridas).toEqual(["espesor", "especie"]);
  });
  it("todo bien = sin frase", () => {
    const r = resumirTipos([fila({ cantidad: "1", espesor: "2,5", especie: "Cedro" })]);
    expect(fraseResumen(r)).toBeNull();
    expect(r.primera).toBeNull();
  });
});
