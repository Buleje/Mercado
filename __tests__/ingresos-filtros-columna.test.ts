import { describe, expect, it } from "vitest";
import {
  aplicarFiltrosColumna,
  hayFiltroDeColumna,
  textosDeFiltrosColumna,
} from "@/lib/forestal/ingresos-filtros-columna";

describe("aplicarFiltrosColumna", () => {
  it("sin filtros no agrega nada", () => {
    expect(aplicarFiltrosColumna(new URLSearchParams(), undefined).toString()).toBe("");
    expect(aplicarFiltrosColumna(new URLSearchParams(), {}).toString()).toBe("");
  });

  it("textos recortados, vacíos no viajan", () => {
    const p = aplicarFiltrosColumna(new URLSearchParams(), { doc: "  QA-435 ", sniffs: "   ", registro: "ana" });
    expect(p.get("doc")).toBe("QA-435");
    expect(p.has("sniffs")).toBe(false);
    expect(p.get("registro")).toBe("ana");
  });

  it("rangos: un tope null no viaja; el 0 sí", () => {
    const p = aplicarFiltrosColumna(new URLSearchParams(), {
      cantidad: { min: 0, max: null },
      fecha: { min: "2026-09-01", max: "2026-09-01" },
      piezas: { min: null, max: 10 },
    });
    expect(p.get("vol_min")).toBe("0");
    expect(p.has("vol_max")).toBe(false);
    expect(p.get("fecha_desde")).toBe("2026-09-01");
    expect(p.get("fecha_hasta")).toBe("2026-09-01");
    expect(p.has("pz_min")).toBe(false);
    expect(p.get("pz_max")).toBe("10");
  });

  it("trozas y precio", () => {
    const p = aplicarFiltrosColumna(new URLSearchParams(), { trozas: "sin", conCosto: true });
    expect(p.get("trozas")).toBe("sin");
    expect(p.get("con_costo")).toBe("1");
  });
});

describe("textosDeFiltrosColumna", () => {
  it("nombra lo puesto, para el vacío", () => {
    expect(
      textosDeFiltrosColumna({
        doc: "123",
        fecha: { min: "2026-09-05", max: "2026-09-05" },
        cantidad: { min: 2, max: null },
        trozas: "con",
      }),
    ).toEqual(["documento «123»", "fecha 05/09/26", "cantidad (m³) ≥ 2", "con trozas"]);
  });

  it("un rango sin topes no cuenta como filtro", () => {
    expect(hayFiltroDeColumna({ cantidad: { min: null, max: null } })).toBe(false);
    expect(hayFiltroDeColumna({ doc: "  " })).toBe(false);
    expect(hayFiltroDeColumna({ sniffs: "9" })).toBe(true);
  });
});
