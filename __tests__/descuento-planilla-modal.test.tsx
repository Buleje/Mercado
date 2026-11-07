/**
 * «Descuentos de planilla» se aplica UNA vez por modal (revisión 09-10).
 *
 * RRHH › Lo ganado le pasa una lista de adelantos que no se vuelve a pedir:
 * tras «Se aplicaron 1 descuento» el botón seguía activo, un 2.º clic mandaba
 * los mismos descuentos y el servidor los aceptaba sobre el adelanto ya
 * liquidado (EXCEDIDO). Y el tope llega puesto con lo que queda de lo ganado.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DescuentoPlanillaModal from "@/components/admin/adelantos/DescuentoPlanillaModal";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

const adelanto = (saldo: number) =>
  ({
    id: "a1",
    codigoOperacion: "ADL-1",
    modalidad: "DESCUENTO_PLANILLA",
    status: "ABIERTO",
    saldoPendiente: saldo,
    moneda: "PEN",
    direccion: "DADO",
    beneficiario: { nombre: "QA Planilla" },
  }) as unknown as DbAdelanto;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DescuentoPlanillaModal", () => {
  it("aplica una sola vez: tras «Se aplicaron» el botón queda deshabilitado y sale 1 POST", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const onAplicado = vi.fn();
    render(<DescuentoPlanillaModal adelantos={[adelanto(500)]} onClose={() => {}} onAplicado={onAplicado} periodoInicial="octubre de 2026" topeInicial={300} />);

    expect((screen.getByLabelText("Tope por persona") as HTMLInputElement).value).toBe("300");
    const aplicar = screen.getByRole("button", { name: "Aplicar a 1" });
    fireEvent.click(aplicar);
    await screen.findByText(/Se aplicaron 1 descuento/);

    expect(screen.getByRole("button", { name: "Aplicar a 1" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a 1" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onAplicado).toHaveBeenCalledTimes(1);
    const cuerpo = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(cuerpo).toMatchObject({ valorManual: 300, descripcion: "Descuento por planilla · octubre de 2026" });
  });

  it("sin tope inicial: propone todo el saldo, como desde Adelantos", () => {
    render(<DescuentoPlanillaModal adelantos={[adelanto(500)]} onClose={() => {}} onAplicado={() => {}} />);
    expect((screen.getByLabelText("Tope por persona") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Descuento para QA Planilla") as HTMLInputElement).value).toBe("500");
  });
});
