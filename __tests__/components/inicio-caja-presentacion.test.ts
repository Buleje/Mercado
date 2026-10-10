import { describe, expect, it } from "vitest";
import {
  colorDeMetodo,
  coloresFijos,
  COLOR_METODO_OTRO,
  ejeSoles,
  margenLegible,
} from "@/components/admin/inicio/caja-presentacion";

// Pestaña Caja del Inicio (2026-10-09): sólo presentación, las cuentas no cambian.

describe("margenLegible", () => {
  it("el margen absurdo de main (S/ 0.10 vendidos, S/ 5,400 comprados) sale «—»", () => {
    expect(margenLegible(-5_418_190, 0.1)).toBe(false);
  });
  it("sin ventas no hay margen", () => {
    expect(margenLegible(0, 0)).toBe(false);
  });
  it("un margen normal (positivo o negativo) se muestra", () => {
    expect(margenLegible(18.5, 1200)).toBe(true);
    expect(margenLegible(-40, 1200)).toBe(true);
    expect(margenLegible(999, 10)).toBe(true);
    expect(margenLegible(1000, 10)).toBe(false);
  });
});

describe("colorDeMetodo", () => {
  it("rotulado o crudo da el mismo token; nunca un hex", () => {
    expect(colorDeMetodo("Yape")).toBe(colorDeMetodo("yape"));
    expect(colorDeMetodo("Efectivo")).toBe("var(--data-5)");
    expect(colorDeMetodo("cripto")).toBe(COLOR_METODO_OTRO);
  });
});

describe("coloresFijos", () => {
  it("pisa las ranuras --section-* que DraggableSections rota", () => {
    expect(coloresFijos({ primary: "var(--data-5)", amber: "var(--data-7)" })).toEqual({
      "--section-primary": "var(--data-5)",
      "--section-amber": "var(--data-7)",
    });
  });
});

describe("ejeSoles", () => {
  it("compacto, sin «S/» (no entra en los 60 px del eje) y sin espacios que Recharts parta", () => {
    expect(ejeSoles(16000)).toBe("16 mil");
    expect(ejeSoles(-4500)).toBe("-4.5 mil");
    expect(ejeSoles(600)).toBe("600");
    expect(ejeSoles(16000)).not.toContain(" ");
  });
});
