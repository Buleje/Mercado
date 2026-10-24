/**
 * «Cobrar» desde un aviso de fiado vencido (10-10): el cobro va a la caja
 * abierta con el medio elegido, igual que Me deben y el abono del POS. Sin
 * `aCaja` + `metodo`, `/api/fiados/[id]/pagar` bajaba la deuda sin anotar la
 * plata en la caja y al cierre salía un sobrante.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const avisos = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: avisos }));
vi.mock("@/lib/csrf-client", () => ({
  csrfHeaders: (extra: Record<string, string> = {}) => ({ ...extra, "x-csrf-token": "tok" }),
}));

import CobroExpressFiado from "@/components/notifications/CobroExpressFiado";

function respuesta(cuerpo: unknown) {
  return { ok: true, status: 200, json: async () => cuerpo };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  avisos.warning.mockReset();
  fetchMock = vi.fn(async () => respuesta({ caja: { sinCaja: false } }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

function cobrar(monto: string) {
  fireEvent.change(screen.getByLabelText("Registrar pago"), { target: { value: monto } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
}

function cuerpoEnviado(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("CobroExpressFiado", () => {
  it("manda el cobro a la caja, en efectivo si no se elige otro medio", async () => {
    const onPagado = vi.fn();
    render(<CobroExpressFiado fiadoId="f1" onPagado={onPagado} onCancelar={() => {}} />);
    cobrar("25.5");
    await waitFor(() => expect(onPagado).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/fiados/f1/pagar");
    expect(cuerpoEnviado()).toEqual({ monto: 25.5, metodo: "efectivo", aCaja: true });
    expect(avisos.warning).not.toHaveBeenCalled();
  });

  it("respeta el medio elegido y avisa si no había caja abierta", async () => {
    fetchMock.mockImplementationOnce(async () => respuesta({ caja: { sinCaja: true } }));
    const onPagado = vi.fn();
    render(<CobroExpressFiado fiadoId="f2" onPagado={onPagado} onCancelar={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Yape" }));
    expect(screen.getByRole("radio", { name: "Yape" }).getAttribute("aria-checked")).toBe("true");
    cobrar("10");
    await waitFor(() => expect(onPagado).toHaveBeenCalledTimes(1));
    expect(cuerpoEnviado()).toEqual({ monto: 10, metodo: "yape", aCaja: true });
    expect(avisos.warning).toHaveBeenCalledTimes(1);
  });
});
