import { describe, expect, it } from "vitest";
import { egresosQueBajanElEsperado } from "@/components/admin/caja/esperado-negativo";
import type { CashMovement } from "@/components/admin/caja/tipos";

const mov = (id: string, type: string, amount: number, method = "efectivo"): CashMovement => ({
  id,
  cashRegisterId: "c1",
  type,
  amount,
  method,
  description: `Mov ${id}`,
  createdAt: "2026-06-11T15:00:00.000Z",
});

// La caja de Blas medida el 28-09: 100 + 120 + 1 230 − 7 874 = −6 424.
const movimientos = [
  mov("a", "egreso", 3642),
  mov("b", "venta", 1230),
  mov("c", "egreso", 3217),
  mov("d", "egreso", 1000),
  mov("e", "egreso", 15),
  mov("f", "egreso", 5000, "yape"),
  mov("g", "ingreso", 120),
];

describe("caja · esperado negativo (M26)", () => {
  it("lista los egresos en efectivo más grandes, del mayor al menor", () => {
    const r = egresosQueBajanElEsperado(movimientos, -6424);
    expect(r.map((e) => e.mov.id)).toEqual(["a", "c", "d"]);
  });

  it("un egreso por Yape no baja el esperado: no aparece", () => {
    expect(egresosQueBajanElEsperado(movimientos, -6424, 10).some((e) => e.mov.id === "f")).toBe(false);
  });

  it("la vista previa suma de vuelta sólo ese egreso", () => {
    const [mayor] = egresosQueBajanElEsperado(movimientos, -6424);
    expect(mayor.esperadoSinEl).toBe(-2782);
  });

  it("sin egresos en efectivo no hay nada que mostrar", () => {
    expect(egresosQueBajanElEsperado([mov("x", "venta", 10)], -5)).toEqual([]);
  });
});
