/**
 * Orden de los botones del aviso de riesgo del plan: si la primera razón es un
 * papel, «Ver papeles» va primero (principal) y «Completar la ficha» al lado;
 * si la primera es la ficha, sólo «Completar la ficha», como antes.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/superadmin/_shared/InfoTip", () => ({ InfoTip: () => null }));

import LothPlanSemaforoAviso from "@/components/admin/forestal/LothPlanSemaforoAviso";
import type { FichaDelPlan } from "@/lib/forestal/loth-plan-ficha";
import type { RazonSemaforo, SemaforoPlan } from "@/lib/forestal/loth-plan-semaforo";

const PAPEL: RazonSemaforo = { clave: "papeles", nivel: "rojo", texto: "Papel vencido: Resolución que aprueba el plan." };
const FICHA: RazonSemaforo = { clave: "ficha", nivel: "ambar", texto: "Ficha al 13 %: falta el regente." };
const FICHA_INCOMPLETA = { items: [], llenos: 1, total: 8, pct: 13, faltan: [] } as FichaDelPlan;

function semaforo(...razones: RazonSemaforo[]): SemaforoPlan {
  return { color: "rojo", titulo: "Riesgo de multa", razones };
}

function textosDeBotones(): string[] {
  return screen.queryAllByRole("button").map((b) => b.textContent?.trim() ?? "");
}

describe("LothPlanSemaforoAviso — botones", () => {
  it("primera razón = papel: «Ver papeles» primero (principal) y «Completar la ficha» después", () => {
    const verPapeles = vi.fn();
    const completar = vi.fn();
    render(
      <LothPlanSemaforoAviso semaforo={semaforo(PAPEL, FICHA)} ficha={FICHA_INCOMPLETA} onCompletarFicha={completar} onVerPapeles={verPapeles} />,
    );
    expect(textosDeBotones()).toEqual(["Ver papeles", "Completar la ficha"]);
    const [principal, secundario] = screen.getAllByRole("button");
    expect(principal.className).not.toBe(secundario.className);
    fireEvent.click(principal);
    expect(verPapeles).toHaveBeenCalledTimes(1);
    expect(completar).not.toHaveBeenCalled();
    fireEvent.click(secundario);
    expect(completar).toHaveBeenCalledWith(null);
  });

  it("primera razón = papel y la ficha completa: sólo «Ver papeles»", () => {
    render(<LothPlanSemaforoAviso semaforo={semaforo(PAPEL)} ficha={null} onCompletarFicha={vi.fn()} onVerPapeles={vi.fn()} />);
    expect(textosDeBotones()).toEqual(["Ver papeles"]);
  });

  it("primera razón = ficha: queda como hoy, sólo «Completar la ficha»", () => {
    render(
      <LothPlanSemaforoAviso semaforo={semaforo(FICHA, PAPEL)} ficha={FICHA_INCOMPLETA} onCompletarFicha={vi.fn()} onVerPapeles={vi.fn()} />,
    );
    expect(textosDeBotones()).toEqual(["Completar la ficha"]);
  });

  it("sin la pestaña Papeles en la vista (sin onVerPapeles), no ofrece «Ver papeles»", () => {
    render(<LothPlanSemaforoAviso semaforo={semaforo(PAPEL, FICHA)} ficha={FICHA_INCOMPLETA} onCompletarFicha={vi.fn()} />);
    expect(textosDeBotones()).toEqual(["Completar la ficha"]);
  });
});
