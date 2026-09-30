/**
 * El aviso «N adelantos sin control · S/ X» del Resumen de Adelantos.
 *
 * Con HEAD falla: el componente no existía.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ResumenSinControl } from "@/lib/adelantos/sin-control";

vi.mock("@/components/admin/adelantos/detalle/DetalleAdelantoModal", () => ({
  default: ({ adelantoId }: { adelantoId: string }) => <div data-testid="ficha">{adelantoId}</div>,
}));

import SinControl from "@/components/admin/adelantos/cobranza/SinControl";

const fila = (id: string, saldo: number, moneda = "PEN"): ResumenSinControl["adelantos"][number] => ({
  id,
  codigoOperacion: id === "a17" ? null : `ADL-2026-${id}`,
  beneficiarioId: "b1",
  nombre: `Persona ${id}`,
  saldoPendiente: saldo,
  moneda,
  fechaAdelanto: "2026-08-03T17:00:00.000Z",
  motivos: [
    { codigo: "sin-entregas", texto: "Ninguna entrega en 58 días desde que se dio" },
    { codigo: "sin-vencimiento", texto: "Sin fecha de vencimiento" },
  ],
});

describe("SinControl", () => {
  it("dice cuántos y cuánta plata, con los motivos de cada uno", () => {
    render(
      <SinControl
        datos={{ cantidad: 2, porMoneda: { PEN: 17500 }, adelantos: [fila("a17", 17000), fila("0001", 500)] }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/2 adelantos sin control/)).toHaveTextContent(/17[\s,.]?500/);
    expect(screen.getByText("Persona a17")).toBeInTheDocument();
    expect(screen.getByText(/sin código/)).toBeInTheDocument();
    expect(screen.getAllByText(/Ninguna entrega en 58 días desde que se dio · Sin fecha de vencimiento/)).toHaveLength(2);
  });

  it("singular con uno solo", () => {
    render(<SinControl datos={{ cantidad: 1, porMoneda: { PEN: 500 }, adelantos: [fila("0001", 500)] }} onChange={() => {}} />);
    expect(screen.getByText(/1 adelanto sin control/)).toBeInTheDocument();
  });

  it("tocar una fila abre SU ficha", () => {
    render(<SinControl datos={{ cantidad: 1, porMoneda: { PEN: 17000 }, adelantos: [fila("a17", 17000)] }} onChange={() => {}} />);
    /* El nombre accesible es la fila entera: persona, motivos, saldo y «Ver ficha». */
    fireEvent.click(screen.getByRole("button", { name: /Persona a17.*Sin fecha de vencimiento.*Ver ficha/ }));
    expect(screen.getByTestId("ficha")).toHaveTextContent("a17");
  });

  it("sin ninguno, o sin dato del servidor, no dibuja nada", () => {
    const { container, rerender } = render(<SinControl datos={{ cantidad: 0, porMoneda: {}, adelantos: [] }} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SinControl datos={null} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
