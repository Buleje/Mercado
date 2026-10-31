/**
 * CtpTrozasPlanAserrioModal — monta, arma el plan, quitar deja entrar a la
 * siguiente y «Apartar para la corrida» entrega las piezas del plan.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CtpTrozasPlanAserrioModal from "@/components/admin/forestal/CtpTrozasPlanAserrioModal";
import type { TrozaPatioAPI } from "@/components/admin/forestal/hooks/use-trozas-patio";

const HOY = new Date("2026-10-05T12:00:00Z");

const troza = (id: string, dias: number, o: Partial<TrozaPatioAPI> = {}): TrozaPatioAPI => ({
  id,
  woodEntryId: "g1",
  codificacion: id,
  codigoPlanta: null,
  parcela: null,
  especieComun: "Tornillo",
  especieCientifica: null,
  d1Cm: 60,
  d2Cm: 58,
  largoM: 5,
  volumenM3: 2,
  gtfNumber: "001",
  proveedor: null,
  resolucion: null,
  fechaIngreso: null,
  fechaRecepcion: new Date(HOY.getTime() - dias * 86_400_000).toISOString(),
  guiaRecepcionada: true,
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  trozaOrigenId: null,
  loteAserrioId: null,
  loteAserrioCode: null,
  ...o,
});

const PATIO = [
  ...Array.from({ length: 7 }, (_, i) => troza(`T-${i + 1}`, 40 - i)),
  troza("C-1", 90, { especieComun: "Cumala" }),
  troza("APART", 99, { loteAserrioCode: "L-9" }),
];

afterEach(cleanup);

describe("CtpTrozasPlanAserrioModal", () => {
  it("arranca con la especie de la troza más vieja y 6 piezas", () => {
    render(<CtpTrozasPlanAserrioModal trozas={PATIO} hoy={HOY} canchas={{}} rendimientoPct={50} onApartar={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Hoy: 1 de Cumala · ≈424 pt/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Cumala/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Tornillo/ }));
    expect(screen.getByText(/Hoy: 6 de Tornillo · ≈2,544 pt/)).toBeTruthy();
    expect(screen.queryByText("APART")).toBeNull();
  });

  it("quitar deja entrar a la siguiente; apartar entrega las del plan y cierra", () => {
    const onApartar = vi.fn();
    const onClose = vi.fn();
    render(<CtpTrozasPlanAserrioModal trozas={PATIO} hoy={HOY} canchas={{}} rendimientoPct={50} onApartar={onApartar} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cumala/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Tornillo/ }));
    expect(screen.queryByText("T-7")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quitar T-1 del plan" }));
    expect(screen.getByText("T-7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apartar para la corrida/ }));
    expect(onApartar.mock.calls[0][0].map((p: { id: string }) => p.id)).toEqual(["T-2", "T-3", "T-4", "T-5", "T-6", "T-7"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("sin rendimiento del libro: sin pt y la meta en pies tablares deshabilitada", () => {
    render(<CtpTrozasPlanAserrioModal trozas={PATIO} hoy={HOY} canchas={{}} onApartar={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Hoy: 1 de Cumala · 2\.000 m³/)).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Pies tablares/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
