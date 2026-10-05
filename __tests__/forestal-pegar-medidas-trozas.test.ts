import { describe, expect, it } from "vitest";
import { leerMedidasPegadas, pareceTablaPegada } from "@/lib/forestal/pegar-medidas-trozas";

const piezas = [
  { id: "a", codificacion: "62B", codigoPlanta: null },
  { id: "b", codificacion: "T-10/1", codigoPlanta: "P7" },
  { id: "c", codificacion: "63", codigoPlanta: null },
];

describe("leerMedidasPegadas", () => {
  it("lee tab, coma decimal y 4+ columnas", () => {
    const r = leerMedidasPegadas("62B\t76\t74\n63\t75,5\t70\t7,75\t3,4", piezas);
    expect(r.asignadas.get("a")).toEqual({ d1: 76, d2: 74 });
    expect(r.asignadas.get("c")).toEqual({ d1: 75.5, d2: 70 });
  });
  it("ignora el encabezado y acepta ; y espacios", () => {
    const r = leerMedidasPegadas("Código D1 D2\n62b;76;74\np7 60 61", piezas);
    expect(r.asignadas.size).toBe(2);
    expect(r.asignadas.get("b")).toEqual({ d1: 60, d2: 61 });
    expect(r.sinPieza).toEqual([]);
  });
  it("match flojo sin guiones/barras/espacios", () => {
    const r = leerMedidasPegadas("T101\t50\t51", piezas);
    expect(r.asignadas.get("b")).toEqual({ d1: 50, d2: 51 });
  });
  it("separa sin pieza, repetidos e inválidas", () => {
    const r = leerMedidasPegadas("99X\t50\t50\n62B\t50\t50\n62B\t60\t60\n63\t0\t50\n63\t450\t50", piezas);
    expect(r.sinPieza).toEqual(["99X"]);
    expect(r.repetidos).toEqual(["62B"]);
    expect(r.invalidas).toEqual(["63"]);
    expect(r.asignadas.has("c")).toBe(false);
  });
  it("pareceTablaPegada", () => {
    expect(pareceTablaPegada("76")).toBe(false);
    expect(pareceTablaPegada("62B\t76\t74")).toBe(true);
    expect(pareceTablaPegada("1\n2")).toBe(true);
  });
});
