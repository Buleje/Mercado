import { describe, expect, it } from "vitest";
import {
  algunDato,
  hayDatosEnSerie,
  hayFilas,
  hayTendencia,
  kpiSinDato,
  modoRanking,
  numeroDe,
} from "@/lib/admin/inicio/hay-datos";
import {
  cantidad,
  fechaConDia,
  fechaCorta,
  porcentaje,
  soles,
  solesEje,
} from "@/lib/admin/inicio/formato-tablero";

describe("hay-datos", () => {
  const dias = [
    { d: "2026-10-01", ventas: 0, gastos: null },
    { d: "2026-10-02", ventas: 40, gastos: 0 },
    { d: "2026-10-03", ventas: 0, gastos: "12.50" },
  ];

  it("numeroDe acepta números y strings numéricos (Decimal), nada más", () => {
    expect(numeroDe(3)).toBe(3);
    expect(numeroDe("12.50")).toBe(12.5);
    expect(numeroDe("")).toBeNull();
    expect(numeroDe(Number.NaN)).toBeNull();
    expect(numeroDe(true)).toBeNull();
    expect(numeroDe(undefined)).toBeNull();
  });

  it("una serie con un solo valor tiene dato para barras pero no es tendencia", () => {
    expect(hayDatosEnSerie(dias, ["ventas"])).toBe(true);
    expect(hayDatosEnSerie(dias, ["ventas"], { minPuntos: 2 })).toBe(false);
    expect(hayTendencia(dias, ["ventas"])).toBe(false);
  });

  it("basta con que UNA clave tenga dato; el string numérico cuenta", () => {
    expect(hayDatosEnSerie(dias, ["gastos"])).toBe(true);
    expect(hayTendencia([...dias, { d: "2026-10-04", ventas: 5, gastos: 0 }], ["gastos", "ventas"])).toBe(true);
  });

  it("todo en cero, vacío o null → sin dato", () => {
    expect(hayDatosEnSerie([{ v: 0 }, { v: null }], ["v"])).toBe(false);
    expect(hayDatosEnSerie([], ["v" as never])).toBe(false);
    expect(hayDatosEnSerie(null, ["v" as never])).toBe(false);
  });

  it("hayFilas y modoRanking: 0 oculto, 1-2 lista, 3+ gráfico", () => {
    expect(hayFilas([])).toBe(false);
    expect(hayFilas([1])).toBe(true);
    expect(hayFilas([1, 2], 3)).toBe(false);
    expect(modoRanking([])).toBe("oculto");
    expect(modoRanking([{ t: 1 }])).toBe("lista");
    expect(modoRanking([{ t: 1 }, { t: 2 }, { t: 3 }])).toBe("grafico");
    expect(modoRanking([{ t: 9 }, { t: 0 }, { t: 0 }], "t")).toBe("lista");
    expect(modoRanking([{ t: 0 }, { t: null }], "t")).toBe("oculto");
  });

  it("kpiSinDato: el 0 es «—» salvo que el cero sea la noticia", () => {
    expect(kpiSinDato(0)).toBe(true);
    expect(kpiSinDato(null)).toBe(true);
    expect(kpiSinDato(0, { ceroEsDato: true })).toBe(false);
    expect(kpiSinDato(12)).toBe(false);
  });

  it("algunDato mezcla números y booleanos ya calculados", () => {
    expect(algunDato([0, null, false])).toBe(false);
    expect(algunDato([0, true])).toBe(true);
    expect(algunDato(["3"])).toBe(true);
  });
});

describe("formato-tablero", () => {
  it("plata con el canon del repo y «—» sin dato", () => {
    expect(soles(1234.5)).toBe("S/ 1,234.50");
    expect(soles(null)).toBe("—");
  });

  it("ejes compactos con el mismo separador decimal", () => {
    expect(solesEje(850)).toBe("S/ 850");
    expect(solesEje(1500)).toBe("S/ 1.5 mil");
    expect(solesEje(2_300_000)).toBe("S/ 2.3 M");
    expect(solesEje(-120)).toBe("-S/ 120");
    expect(solesEje(999_960)).toBe("S/ 1 M");
  });

  it("cantidades y porcentajes", () => {
    expect(cantidad(1234)).toBe("1,234");
    expect(porcentaje(12.34)).toBe("12%");
    expect(porcentaje(12.34, 1)).toBe("12.3%");
    expect(porcentaje(undefined)).toBe("—");
  });

  it("fechas con meses a mano y sin correr el día", () => {
    expect(fechaCorta("2026-10-01")).toBe("01 oct");
    expect(fechaCorta("2026-09-22")).toBe("22 set");
    // 03:00 UTC del 2 = 22:00 del 1 en Lima.
    expect(fechaCorta(new Date("2026-10-02T03:00:00Z"))).toBe("01 oct");
    expect(fechaConDia("2026-09-10")).toBe("jueves 10/09");
    expect(fechaCorta("no es fecha")).toBe("—");
  });
});
