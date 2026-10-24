/**
 * Tests — LothPlanAvisos, la parte de la VIGENCIA del plan.
 *
 * Lo que prueba que no prueba el módulo puro: que el aviso se pinte (y que NO
 * se pinte), que la banda aparezca aunque no haya censo cargado —un plan
 * vencido sin censo sigue siendo un plan vencido— y que el tono salga de los
 * tokens del DS y no de un hex.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import LothPlanAvisos from "@/components/admin/forestal/LothPlanAvisos";
import { hoyDelLibro } from "@/lib/forestal/vigencia-avisos";

/**
 * N días desde el «hoy» DEL LIBRO, que es el día de Lima.
 *
 * Con `Date.now()` crudo el test se caía todas las tardes: a las 20:00 de
 * Pucallpa el UTC ya es mañana y `enDias(30)` caía a 31 días del día limeño.
 * Ese desfase es justamente lo que el aviso corrige, así que el test tiene que
 * contar desde la misma base.
 */
const enDias = (n: number) =>
  new Date(hoyDelLibro().getTime() + n * 86_400_000).toISOString().slice(0, 10);

describe("aviso de vigencia del plan", () => {
  it("vencido: dice hace cuántos días y que la guía queda observada", () => {
    render(
      <LothPlanAvisos
        rows={[]}
        plan={{ codigo: "PO-2026-001", vigenciaHasta: enDias(-11), estado: "vigente" }}
      />,
    );
    const caja = document.querySelector('[data-aviso-vigencia="vencido"]')!;
    expect(caja).toBeTruthy();
    expect(caja.textContent).toContain("Plan de manejo PO-2026-001 venció hace 11 días");
    expect(caja.textContent).toContain("la guía que emitas queda observada");
    // Rojo por token, no por hex (gate de diseño del panel).
    expect(caja.className).toContain("border-[var(--data-error-500)]");
  });

  it("por vencer: dice cuántos días faltan, en coral y no en rojo", () => {
    render(
      <LothPlanAvisos
        rows={[]}
        plan={{ codigo: "PO-2026-001", vigenciaHasta: enDias(30), estado: "vigente" }}
      />,
    );
    const caja = document.querySelector('[data-aviso-vigencia="por_vencer"]')!;
    expect(caja.textContent).toContain("vence en 30 días");
    expect(caja.className).toContain("--data-warning-500");
  });

  it("sin plan, sin vigencia cargada o con el plan holgado no ocupa lugar", () => {
    const { container: a } = render(<LothPlanAvisos rows={[]} />);
    expect(a.innerHTML).toBe("");

    const { container: b } = render(
      <LothPlanAvisos rows={[]} plan={{ codigo: "PO-1", vigenciaHasta: null, estado: "vigente" }} />,
    );
    expect(b.innerHTML).toBe("");

    const { container: c } = render(
      <LothPlanAvisos rows={[]} plan={{ codigo: "PO-1", vigenciaHasta: enDias(400), estado: "vigente" }} />,
    );
    expect(c.innerHTML).toBe("");
  });

  it("convive con los avisos del censo sin taparlos", () => {
    render(
      <LothPlanAvisos
        rows={[
          {
            species: "TORNILLO", cites: false, autorizada: false, autorizadoM3: 0,
            autorizadoArboles: null, censadoCount: 4, censadoVolM3: 12, taladoCount: 0,
            movilizado: 0, saldo: 0, pctEjecutado: 0, georrefCount: 0, flags: ["no_autorizada"], tone: "danger",
          },
        ]}
        plan={{ codigo: "PO-2026-001", vigenciaHasta: enDias(-1), estado: "vigente" }}
      />,
    );
    expect(document.querySelector('[data-aviso-vigencia="vencido"]')).toBeTruthy();
    expect(screen.getByText(/fuera del plan aprobado/)).toBeTruthy();
  });
});
