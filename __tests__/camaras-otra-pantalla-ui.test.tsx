/**
 * «Ver en otra pantalla» del panel: el código acepta «abc-234», manda lo que
 * pide el contrato (`VincularPantallaInput`), lista las pantallas y
 * «Desconectar» pide confirmar y manda el DELETE con el id.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OtraPantallaModal from "@/components/admin/forestal/camaras/OtraPantallaModal";

const { confirmar } = vi.hoisted(() => ({ confirmar: vi.fn(async () => true) }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: confirmar }) }));
vi.mock("@/components/admin/shared/AdminModal", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MODAL_BODY: "",
}));
vi.mock("@/components/superadmin/_shared/InfoTip", () => ({ InfoTip: () => null }));

const fetchMock = vi.fn();
const PANTALLA = {
  id: "p1",
  nombre: "Sala",
  camaras: ["c1"],
  creadaPor: "u1",
  creadaEn: "2026-10-07T10:00:00Z",
  expiraEn: new Date(Date.now() + 3600_000).toISOString(),
  ultimaVez: null,
};
const CAMARAS = [{ id: "c1", nombre: "Portón" }, { id: "c2", nombre: "Patio" }];

beforeEach(() => {
  confirmar.mockClear();
  fetchMock.mockReset().mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ pantallas: [PANTALLA] }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const llamadas = (metodo: string) => fetchMock.mock.calls.filter((c) => (c[1]?.method ?? "GET") === metodo);

describe("Ver en otra pantalla", () => {
  it("vincula con el código normalizado, el nombre, las cámaras elegidas y la duración", async () => {
    render(<OtraPantallaModal camaras={CAMARAS} onCerrar={vi.fn()} />);
    expect(await screen.findByText("Sala")).toBeTruthy();
    expect(screen.getByText(/Portón · todavía no se conectó · vence/)).toBeTruthy();
    expect(screen.getByText(/\/tv$/)).toBeTruthy();

    const boton = screen.getByRole("button", { name: /Vincular el televisor/ });
    fireEvent.change(screen.getByLabelText("Código del televisor"), { target: { value: "abc-23" } });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Código del televisor"), { target: { value: "abc-234" } });
    fireEvent.change(screen.getByLabelText("Nombre de la pantalla"), { target: { value: "Oficina" } });
    fireEvent.click(screen.getByLabelText("Elegir"));
    fireEvent.click(screen.getByLabelText("Patio"));
    fireEvent.click(screen.getByRole("radio", { name: "Un día" }));
    fireEvent.click(boton);

    await waitFor(() => expect(llamadas("POST")).toHaveLength(1));
    expect(llamadas("POST")[0][0]).toBe("/api/admin/camaras/pantallas");
    expect(JSON.parse(String(llamadas("POST")[0][1].body))).toEqual({ codigo: "ABC234", nombre: "Oficina", camaras: ["c2"], horas: 24 });
    expect(await screen.findByText(/«Oficina» ya muestra las cámaras/)).toBeTruthy();
  });

  it("un código con 0/O/1/I/L no es de un TV", () => {
    render(<OtraPantallaModal camaras={CAMARAS} codigoInicial="ABC-1O0" onCerrar={vi.fn()} />);
    expect(screen.getByText(/no lleva 0, O, 1, I ni L/)).toBeTruthy();
  });

  it("«Desconectar» confirma y manda DELETE ?id", async () => {
    render(<OtraPantallaModal camaras={CAMARAS} onCerrar={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Desconectar/ }));
    await waitFor(() => expect(llamadas("DELETE")).toHaveLength(1));
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(llamadas("DELETE")[0][0]).toBe("/api/admin/camaras/pantallas?id=p1");
    await waitFor(() => expect(screen.queryByText("Sala")).toBeNull());
  });

  it("«En tu celular» muestra el link de la vista de cámaras", () => {
    render(<OtraPantallaModal camaras={CAMARAS} pestanaInicial="celular" onCerrar={vi.fn()} />);
    expect(screen.getByText(/\/admin\?tab=camaras&vista=camaras$/)).toBeTruthy();
  });
});
