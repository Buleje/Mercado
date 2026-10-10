/**
 * Resumen de Plata en ≤2,5 pantallas (2026-10-09): bloques plegables y
 * recordados que plegados dicen su cifra en una línea.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BloquePlegable, { PREFIJO_PLEGADO } from "@/components/admin/unified/finanzas/resumen/BloquePlegable";
import {
  etiquetaSalud,
  lineaDeudores,
  lineaFlujo,
  lineaFugas,
  lineaGastosYPagos,
} from "@/components/admin/unified/finanzas/resumen/lineas-plegadas";

describe("líneas de los bloques plegados", () => {
  it("gastos e ingresos: dice qué falta sin hablar de ventas en el lado de gastos", () => {
    expect(lineaGastosYPagos(0, 0, false, false)).toBe("sin gastos ni ventas este mes");
    expect(lineaGastosYPagos(0, 150, false, true)).toMatch(/^sin gastos · ingresos S\/\s?150$/);
    expect(lineaGastosYPagos(63, 0, true, false)).toMatch(/^gastos S\/\s?63 · sin ventas$/);
  });

  it("flujo: cuenta los días con algo, no suma montos", () => {
    const dia = (ingresos: number, gastos: number) => ({ dia: "1/10", ingresos, gastos, balance: ingresos - gastos });
    expect(lineaFlujo([dia(0, 0), dia(10, 0), dia(0, 5)])).toBe("2 de 3 días con movimiento");
  });

  it("deudores y salud: plurales y los mismos cortes del bloque", () => {
    expect(lineaDeudores(1, 0)).toBe("1 proveedor · 0 fiados");
    expect(lineaDeudores(0, 0)).toBe("sin deudas ni fiados");
    expect([etiquetaSalud(71), etiquetaSalud(70), etiquetaSalud(40), etiquetaSalud(39)]).toEqual([
      "Saludable", "Precaución", "Precaución", "Crítico",
    ]);
  });

  it("fugas: cargando, error, nada y con fugas", () => {
    expect(lineaFugas({ cargando: true, error: null, fugas: 0, extra: 0 })).toMatch(/^revisando/);
    expect(lineaFugas({ cargando: false, error: "x", fugas: 0, extra: 0 })).toBe("no se pudo revisar");
    expect(lineaFugas({ cargando: false, error: null, fugas: 0, extra: 0 })).toBe("sin fugas");
    expect(lineaFugas({ cargando: false, error: null, fugas: 2, extra: 80 })).toMatch(/^2 categorías con fuga · S\/\s?80 sobre el promedio$/);
  });
});

describe("BloquePlegable", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  const dibujar = () =>
    render(
      <BloquePlegable id="prueba" titulo="Flujo de caja" resumen="3 de 30 días" acciones={<button type="button">Expandir</button>}>
        <p>el gráfico</p>
      </BloquePlegable>,
    );

  it("arranca plegado: se ve la cifra, no el cuerpo ni las acciones", () => {
    dibujar();
    const boton = screen.getByRole("button", { name: /Flujo de caja/ });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText(/3 de 30 días/)).toBeTruthy();
    expect(screen.queryByText("el gráfico")).toBeNull();
    expect(screen.queryByRole("button", { name: "Expandir" })).toBeNull();
  });

  it("al abrirlo muestra el cuerpo y lo recuerda al volver", () => {
    dibujar();
    fireEvent.click(screen.getByRole("button", { name: /Flujo de caja/ }));
    expect(screen.getByText("el gráfico")).toBeTruthy();
    expect(screen.queryByText(/3 de 30 días/)).toBeNull();
    expect(window.localStorage.getItem(`${PREFIJO_PLEGADO}prueba`)).toBe("true");
    cleanup();
    dibujar();
    expect(screen.getByText("el gráfico")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Flujo de caja/ }).getAttribute("aria-expanded")).toBe("true");
  });
});
