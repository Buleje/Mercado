/**
 * «¿Se retiró?» (Brandon 20-10): quién lleva 14 días o más sin venir.
 */
import { describe, expect, it } from "vitest";
import { DIAS_SIN_VENIR, noVienenHace } from "@/components/admin/rrhh/rrhh-ui";

const p = (id: string, x: { eventual?: boolean; fechaIngreso?: string | null } = {}) => ({ id, eventual: x.eventual ?? false, fechaIngreso: x.fechaIngreso ?? null });

describe("noVienenHace", () => {
  it("cuenta desde el último día que vino, desde 14 días", () => {
    const r = noVienenHace([p("a"), p("b"), p("c")], { a: "2026-10-06", b: "2026-10-07", c: "2026-10-19" }, "2026-10-20");
    expect(DIAS_SIN_VENIR).toBe(14);
    expect(r).toEqual([{ id: "a", desde: "2026-10-06", dias: 14, nunca: false }]);
  });

  it("si nunca vino cuenta desde su ingreso; sin ingreso ni marcas no se pregunta", () => {
    const r = noVienenHace([p("nuevo", { fechaIngreso: "2026-09-01" }), p("reciente", { fechaIngreso: "2026-10-15" }), p("sin-datos")], {}, "2026-10-20");
    expect(r).toEqual([{ id: "nuevo", desde: "2026-09-01", dias: 49, nunca: true }]);
  });

  it("los eventuales no entran y el más ausente va primero", () => {
    const r = noVienenHace([p("ev", { eventual: true }), p("x"), p("y")], { ev: "2026-08-01", x: "2026-10-01", y: "2026-09-01" }, "2026-10-20");
    expect(r.map((z) => z.id)).toEqual(["y", "x"]);
  });
});
