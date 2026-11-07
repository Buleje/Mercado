/**
 * ADR-491: la página donde el trabajador firma su adelanto en su celular.
 * Fija lo que ve (monto en número y letras, fecha, negocio, DNI enmascarado),
 * que los estados cerrados no filtran datos del adelanto y que el único fetch
 * es el POST de firmar.
 */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FirmarAdelantoView } from "@/app/firmar-adelanto/[token]/FirmarAdelantoView";
import type { VistaPublicaFirma } from "@/lib/adelantos/entregar-tipos";

const TOKEN = "A".repeat(43);
const VISTA: VistaPublicaFirma = {
  estado: "pendiente",
  negocio: "Aserradero Blas",
  codigoOperacion: "ADL-2026-0024",
  monto: 120,
  moneda: "PEN",
  montoEnLetras: "Son: ciento veinte con 00/100 soles",
  fechaAdelanto: "jueves 08/10/2026 · 21:14",
  persona: "Juan Pérez",
  documentoFinal: "45678901",
  pideDocumento: false,
  direccion: "DADO",
  pideHuella: false,
  venceEn: "2026-10-12T00:00:00.000Z",
};

/* jsdom no trae ResizeObserver y el lienzo lo usa para repintar. */
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("pendiente: monto en número y letras, fecha, negocio, DNI enmascarado y «Recibí de»", () => {
  const f = vi.spyOn(globalThis, "fetch");
  render(<FirmarAdelantoView token={TOKEN} vista={VISTA} />);
  expect(screen.getByText("S/ 120.00")).toBeTruthy();
  expect(screen.getByText("Son: ciento veinte con 00/100 soles")).toBeTruthy();
  expect(screen.getByText("jueves 08/10/2026 · 21:14")).toBeTruthy();
  expect(screen.getByText("Recibí de Aserradero Blas")).toBeTruthy();
  expect(screen.getByText("DNI •••••901")).toBeTruthy();
  expect(screen.queryByText("45678901")).toBeNull();
  expect(screen.getByRole("button", { name: "Firmar" })).toBeTruthy();
  expect(f).not.toHaveBeenCalled();
});

it("RECIBIDO dice «Entregué a»; pideHuella muestra la sección obligatoria", () => {
  render(<FirmarAdelantoView token={TOKEN} vista={{ ...VISTA, direccion: "RECIBIDO", pideHuella: true }} />);
  expect(screen.getByText("Entregué a Aserradero Blas")).toBeTruthy();
  expect(screen.getByText(/Tu huella \(obligatoria\)/)).toBeTruthy();
});

it.each([
  ["usado", "Este recibo ya fue firmado"],
  ["vencido", "Este enlace venció"],
  ["revocado", "Este enlace ya no sirve"],
  ["anulado", "Este adelanto fue anulado"],
] as const)("%s: aviso claro y ningún dato del adelanto", (estado, titulo) => {
  const { container } = render(<FirmarAdelantoView token={TOKEN} vista={{ ...VISTA, estado }} />);
  expect(screen.getByText(titulo)).toBeTruthy();
  for (const dato of ["120.00", "Juan", "ADL-2026", "901", "Aserradero"]) expect(container.textContent).not.toContain(dato);
  expect(screen.queryByRole("button", { name: "Firmar" })).toBeNull();
});

it("sin vista (no encontrado): aviso sin datos", () => {
  render(<FirmarAdelantoView token="x" vista={null} />);
  expect(screen.getByText("No encontramos este enlace")).toBeTruthy();
});
