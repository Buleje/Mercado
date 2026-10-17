// @vitest-environment jsdom
/**
 * La banda «Aprovechamiento» de la cabecera del plan: % grande, tramos con m³,
 * exceso en palabras, especies (top 5 + plegadas) y, plegada, la barra fina
 * debajo de las cifras en una línea.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analizarAprovechamiento } from "@/lib/forestal/loth-aprovechamiento";
import { cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import LothAprovechamientoBanda from "@/components/admin/forestal/LothAprovechamientoBanda";
import LothPlanCabecera from "@/components/admin/forestal/LothPlanCabecera";

afterEach(cleanup);

const filas = ["Bolaina", "Capirona", "Marupa", "Topa", "Pashaco", "Shaina", "Guaba"].map((s, i) => ({
  species: s, cites: false, autorizado: 100 - i * 10, talado: i === 1 ? 95 : 10, trozado: 10, movilizado: 5, consumido: 0,
}));
const a = analizarAprovechamiento({
  modo: "plantacion", cascada: cascadaDelPlan(filas), vigenciaDesde: "2026-01-01", vigenciaHasta: "2026-12-31",
  hoy: new Date("2026-10-07T12:00:00Z"),
});

describe("LothAprovechamientoBanda", () => {
  it("% grande, ritmo, tramos y la especie pasada en rojo", () => {
    render(<LothAprovechamientoBanda a={a} especies={7} />);
    expect(document.querySelector("[data-aprovechamiento-pct]")?.textContent).toBe(`${a.pct!.toFixed(1)} %`);
    expect(screen.getByText(/^Vas \d+ días atrasado$/)).toBeTruthy();
    for (const id of ["despachado", "patio", "talado", "enPie"]) expect(document.querySelector(`[data-leyenda="${id}"]`)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/Capirona \(\+5\.000 m³\)/);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/% talado/);
  });

  it("top 5 por saldo y el resto plegado", () => {
    render(<LothAprovechamientoBanda a={a} especies={7} />);
    const lista = screen.getByRole("list", { name: /por especie/ });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(5);
    // Capirona se pasó: saldo 0, queda fuera del top 5.
    expect(lista.querySelector('[data-especie="Capirona"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver las 7 especies" }));
    expect(within(lista).getAllByRole("listitem")).toHaveLength(7);
    expect(lista.querySelector('[data-especie="Capirona"]')?.textContent).toMatch(/sobre lo registrado/);
  });
});

describe("LothPlanCabecera · plantación plegada", () => {
  it("las cuatro cifras en una línea y la barra fina debajo", () => {
    render(
      <LothPlanCabecera
        plans={[]} planId={null} onPlan={vi.fn()} plan={null} kpis={null} opciones={[]}
        aprovechamiento={a}
        kpisPlantacion={{
          registrado: a.base, talado: a.talado, enPie: a.base - a.talado, despachado: a.despachado, enPatio: a.enPatio,
          especies: 7, pctTalado: a.pct, excedido: true,
        }}
      />,
    );
    expect(screen.getByText("Registrado")).toBeTruthy();
    expect(screen.getByText(/días atrasado/)).toBeTruthy();
    const barra = screen.getByRole("img");
    expect(barra.querySelectorAll("[data-tramo]").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-aprovechamiento-pct]")).toBeNull();
  });
});
