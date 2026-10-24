/**
 * El aviso «N adelantos sin control · S/ X» del Resumen de Adelantos.
 *
 * Con HEAD falla: el componente no existía; después, las filas sólo abrían la
 * ficha (no había cómo ponerle vencimiento ni permiso desde el aviso).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ResumenSinControl } from "@/lib/adelantos/sin-control";

vi.mock("@/components/admin/adelantos/detalle/DetalleAdelantoModal", () => ({
  default: ({ adelantoId }: { adelantoId: string }) => <div data-testid="ficha">{adelantoId}</div>,
}));

import SinControl, { CLAVE_SIN_CONTROL_ABIERTO } from "@/components/admin/adelantos/cobranza/SinControl";

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
  /* Desde el 08-10 el aviso arranca plegado en una línea («Revisar»); estas pruebas
     son de las filas, así que lo abren como si la persona ya lo hubiera abierto. */
  beforeEach(() => {
    localStorage.setItem(CLAVE_SIN_CONTROL_ABIERTO, "true");
  });

  it("plegado por defecto: una línea con cuántos y cuánto; «Revisar» abre las filas", () => {
    localStorage.removeItem(CLAVE_SIN_CONTROL_ABIERTO);
    render(<SinControl datos={{ cantidad: 1, porMoneda: { PEN: 17000 }, adelantos: [fila("a17", 17000)] }} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Poner vencimiento" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Revisar/ }));
    expect(screen.getByRole("button", { name: "Poner vencimiento" })).toBeInTheDocument();
  });

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

  it("cada fila ofrece «Poner vencimiento» y «Atar a contrato», fuera del botón de la ficha", () => {
    render(<SinControl datos={{ cantidad: 1, porMoneda: { PEN: 17000 }, adelantos: [fila("a17", 17000)] }} onChange={() => {}} />);
    const venc = screen.getByRole("button", { name: "Poner vencimiento" });
    expect(screen.getByRole("button", { name: "Atar a contrato" })).toBeInTheDocument();
    expect(venc.closest("button[type=button]")?.textContent).not.toMatch(/Ver ficha/);
  });

  it("poner vencimiento desde la fila: PATCH con el día y el aviso se recarga", async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "a17", cambio: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SinControl datos={{ cantidad: 1, porMoneda: { PEN: 17000 }, adelantos: [fila("a17", 17000)] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Poner vencimiento" }));
    fireEvent.change(screen.getByLabelText("Fecha de devolución acordada"), { target: { value: "2099-10-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/adelantos/a17");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ fechaVencimiento: "2099-10-15" });
    vi.unstubAllGlobals();
  });

  it("si el servidor lo rechaza, el motivo queda a la vista y no recarga", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x", code: "no_abierto" }), { status: 409 })));
    render(<SinControl datos={{ cantidad: 1, porMoneda: { PEN: 17000 }, adelantos: [fila("a17", 17000)] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Poner vencimiento" }));
    fireEvent.change(screen.getByLabelText("Fecha de devolución acordada"), { target: { value: "2099-10-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ya no está abierto/);
    expect(onChange).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sin ninguno, o sin dato del servidor, no dibuja nada", () => {
    const { container, rerender } = render(<SinControl datos={{ cantidad: 0, porMoneda: {}, adelantos: [] }} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SinControl datos={null} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
