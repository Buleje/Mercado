import { describe, it, expect } from "vitest";
import { monthIngresos } from "@/components/admin/finanzas/shared";

describe("monthIngresos — Order + Sale (consolidación)", () => {
  const sales = [
    { createdAt: "2026-06-10", total: 100 }, // cuenta
    { createdAt: "2026-05-10", total: 999 }, // otro mes
  ];
  const orders = [
    { createdAt: "2026-06-12", total: 50, status: "entregado" }, // cuenta
    { createdAt: "2026-06-15", total: 30, status: "confirmado" }, // cuenta
    { createdAt: "2026-06-20", total: 999, status: "pendiente" }, // NO (status)
    { createdAt: "2026-07-01", total: 999, status: "entregado" }, // otro mes
  ];

  it("suma Sale + Order(concretada) del mes", () => {
    expect(monthIngresos("2026-06", sales, orders)).toBe(180); // 100 + 50 + 30
  });
  it("sin órdenes = solo Sale (compatible)", () => {
    expect(monthIngresos("2026-06", sales, [])).toBe(100);
  });
  it("mes sin actividad = 0", () => {
    expect(monthIngresos("2026-01", sales, orders)).toBe(0);
  });
});
