import { describe, expect, it } from "vitest";
import { planearTitulo, type IngresoParaTitulo } from "@/lib/forestal/titulo-de-guia";

const ingreso = (o: Partial<IngresoParaTitulo> = {}): IngresoParaTitulo => ({
  id: o.id ?? "e1",
  especie: "Ana Caspi",
  status: "validado",
  anulado: false,
  originCode: null,
  originSourceNumber: null,
  contratoId: null,
  periodoCerrado: null,
  ...o,
});
const pedido = { originCode: "CONC-25-001", originSourceNumber: "R.D. 123-2025", contratoId: "ctr1" };

describe("planearTitulo — llenar el hueco del título, nunca pisar", () => {
  it("un ingreso validado sin título recibe código, resolución y permiso", () => {
    const [p] = planearTitulo([ingreso()], pedido);
    expect(p.escribir).toEqual({ originCode: "CONC-25-001", originSourceNumber: "R.D. 123-2025", contratoId: "ctr1" });
    expect(p.motivo).toBeNull();
  });
  it("un código en blanco (espacios) cuenta como vacío", () => {
    expect(planearTitulo([ingreso({ originCode: "   " })], pedido)[0].escribir?.originCode).toBe("CONC-25-001");
  });
  it("otro título ya declarado no se pisa y se dice cuál", () => {
    const [p] = planearTitulo([ingreso({ originCode: "PMFI-9" })], pedido);
    expect(p.escribir).toBeNull();
    expect(p.motivo).toBe("ya declara PMFI-9: no se pisa");
  });
  it("el mismo título (otra grafía) sólo completa lo que falta", () => {
    const [p] = planearTitulo([ingreso({ originCode: "conc-25-001", originSourceNumber: "R.D. 9" })], pedido);
    expect(p.escribir).toEqual({ contratoId: "ctr1" });
  });
  it("mes cerrado y anulado no se tocan", () => {
    const r = planearTitulo(
      [ingreso({ id: "a", periodoCerrado: "setiembre 2026" }), ingreso({ id: "b", status: "anulado" }), ingreso({ id: "c", anulado: true })],
      pedido,
    );
    expect(r.map((p) => p.motivo)).toEqual(["mes cerrado (setiembre 2026)", "está anulado", "está anulado"]);
    expect(r.every((p) => p.escribir == null)).toBe(true);
  });
  it("nada que escribir = «ya tenía ese título»", () => {
    const [p] = planearTitulo([ingreso({ originCode: "CONC-25-001", originSourceNumber: "x", contratoId: "ctr1" })], pedido);
    expect(p.escribir).toBeNull();
    expect(p.motivo).toBe("ya tenía ese título");
  });
  it("una guía con dos especies: cada ingreso por su cuenta", () => {
    const r = planearTitulo([ingreso({ id: "a" }), ingreso({ id: "b", especie: "Cumala", originCode: "OTRO" })], pedido);
    expect(r[0].escribir).not.toBeNull();
    expect(r[1].escribir).toBeNull();
  });
});
