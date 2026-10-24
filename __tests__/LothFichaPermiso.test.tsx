/**
 * Tests — LothFichaPermiso (la tarjeta de arriba de «Control del permiso»).
 *
 * El cálculo lo prueba `forestal-loth-ficha-permiso.test.ts`; acá se prueba lo
 * que pinta: la cifra grande con su palabra (no sólo color), los faltantes
 * agrupados por la pantalla que los completa y que «Completar» llame al callback.
 * `vigenciaHasta` va relativa al «hoy» del libro para que el test no dependa del día.
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import LothFichaPermiso from "@/components/admin/forestal/LothFichaPermiso";
import { hoyDelLibro } from "@/lib/forestal/vigencia-avisos";

const enDias = (n: number) => new Date(hoyDelLibro().getTime() + n * 86_400_000).toISOString();

describe("LothFichaPermiso", () => {
  it("plan vigente sin carátula: cifra + «Vigente» y un solo Completar (carátula)", () => {
    const onCaratula = vi.fn();
    const onPlan = vi.fn();
    render(
      <LothFichaPermiso
        caratula={null}
        plan={{ planType: "PO", titularName: "Blas S.A.", parcelaCorta: "PC-12", vigenciaDesde: enDias(-194), vigenciaHasta: enDias(537), estado: "vigente" }}
        onCompletarCaratula={onCaratula}
        onCompletarPlan={onPlan}
      />,
    );
    expect(screen.getByText("537")).toBeTruthy();
    expect(screen.getByText("días quedan")).toBeTruthy();
    expect(screen.getByText("Vigente")).toBeTruthy();
    expect(screen.getByText("PC-12")).toBeTruthy();
    const botones = screen.getAllByRole("button", { name: /^Completar/ });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);
    expect(onCaratula).toHaveBeenCalledTimes(1);
    expect(onPlan).not.toHaveBeenCalled();
  });

  it("plan sin vigencia: «Sin vigencia» y los dos huecos del plan en UNA línea con un Completar", () => {
    const onPlan = vi.fn();
    render(
      <LothFichaPermiso
        caratula={{ titularName: "Blas S.A.", tituloHabilitante: "17-UCA/C-J-001-02" }}
        plan={{ planType: "PO", titularName: "Blas S.A.", estado: "vigente" }}
        onCompletarPlan={onPlan}
      />,
    );
    expect(screen.getByText("Sin vigencia")).toBeTruthy();
    expect(screen.getByText("El plan no tiene vigencia · El plan no tiene parcela de corta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Completar/ }));
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it("sin callbacks: dice lo que falta pero no ofrece un botón que no hace nada", () => {
    render(<LothFichaPermiso caratula={null} plan={null} />);
    expect(screen.getByText("Falta la carátula del libro")).toBeTruthy();
    expect(screen.getByText("Falta el plan de manejo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Completar/ })).toBeNull();
  });

  it("por vencer: tono warning del DS, sin hex", () => {
    const { container } = render(
      <LothFichaPermiso caratula={null} plan={{ parcelaCorta: "PC-1", vigenciaDesde: enDias(-600), vigenciaHasta: enDias(30), estado: "vigente" }} />,
    );
    expect(screen.getByText("Por vencer")).toBeTruthy();
    expect(container.innerHTML).toContain("--data-warning-");
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});
