import { describe, expect, it } from "vitest";
import { cobrosDigitalesParaRevisar, type MovimientoParaRevisar } from "@/lib/caja/cobros-para-revisar";

const mov = (id: string, over: Partial<MovimientoParaRevisar>): MovimientoParaRevisar => ({
  id,
  type: "venta",
  amount: 20,
  method: "yape",
  description: "",
  createdAt: "2026-10-17T15:00:00.000Z",
  ...over,
});

describe("cobros digitales para revisar (M29)", () => {
  it("la misma venta anotada dos veces por Yape se marca; ventas distintas del mismo monto NO", () => {
    const r = cobrosDigitalesParaRevisar([
      mov("a", { saleId: "s1" }),
      mov("b", { saleId: "s1", createdAt: "2026-10-17T15:00:02.000Z" }),
      mov("c", { saleId: "s2" }),
      mov("d", { saleId: "s3" }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ motivo: "misma-venta", medio: "yape", monto: 20 });
    expect(r[0].movimientos.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("ingreso a mano repetido (mismo medio, monto y descripción en 30 min) se marca; a la hora siguiente no", () => {
    const r = cobrosDigitalesParaRevisar([
      mov("i1", { type: "ingreso", amount: 50, method: "plin", description: "Pago de Rosa" }),
      mov("i2", { type: "ingreso", amount: 50, method: "plin", description: "pago de rosa ", createdAt: "2026-10-17T15:10:00.000Z" }),
      mov("i3", { type: "ingreso", amount: 50, method: "plin", description: "Pago de Rosa", createdAt: "2026-10-17T16:30:00.000Z" }),
      mov("i4", { type: "ingreso", amount: 50, method: "yape", description: "Pago de Rosa", createdAt: "2026-10-17T15:05:00.000Z" }),
    ]);
    expect(r.map((x) => [x.motivo, x.medio, x.movimientos.map((m) => m.id)])).toEqual([["ingreso-repetido", "plin", ["i1", "i2"]]]);
  });

  it("el efectivo no entra (se revisa contando el cajón) y se puede pedir un solo medio", () => {
    const movs = [
      mov("e1", { method: "efectivo", saleId: "s1" }),
      mov("e2", { method: "efectivo", saleId: "s1" }),
      mov("y1", { saleId: "s9" }),
      mov("y2", { saleId: "s9" }),
    ];
    expect(cobrosDigitalesParaRevisar(movs).map((x) => x.clave)).toEqual(["venta:s9"]);
    expect(cobrosDigitalesParaRevisar(movs, "plin")).toEqual([]);
  });
});
