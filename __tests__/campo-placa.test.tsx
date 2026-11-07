/**
 * CampoPlaca (29-09-2026) — el casillero de placa en sus tres pesos:
 * error en las guías de salida, aviso en las de ingreso (papel de un tercero,
 * se transcribe tal cual) y aviso en lo ya guardado.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CampoPlaca } from "@/components/admin/forestal/ctp-campo-placa";

afterEach(cleanup);

describe("CampoPlaca", () => {
  it("pegar «V2H-901 / W3A-123» deja la placa acá y manda la segunda al remolque", () => {
    const onCambio = vi.fn();
    const onRemolque = vi.fn();
    render(<CampoPlaca label="Placa" valor="" onCambio={onCambio} onRemolque={onRemolque} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Placa" }), { target: { value: "V2H-901 / W3A-123" } });
    expect(onCambio).toHaveBeenCalledWith("V2H-901");
    expect(onRemolque).toHaveBeenCalledWith("W3A-123");
  });

  it("«V2H-901 / -» (sin remolque) no toca el remolque", () => {
    const onRemolque = vi.fn();
    const onCambio = vi.fn();
    render(<CampoPlaca label="Placa" valor="" onCambio={onCambio} onRemolque={onRemolque} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Placa" }), { target: { value: "V2H-901 / -" } });
    expect(onCambio).toHaveBeenCalledWith("V2H-901");
    expect(onRemolque).not.toHaveBeenCalled();
  });

  it("guardado como «V2H-901 / W3A-123» se lee válido (zona de la 1.ª), no «le sobran»", () => {
    render(<CampoPlaca label="Placa" valor="V2H-901 / W3A-123" onCambio={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Placa" }).getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByText("Arequipa")).toBeTruthy();
  });

  it("salida: placa inventada = error (aria-invalid) con el motivo", () => {
    render(<CampoPlaca label="Placa" valor="QA-450" onCambio={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Placa" }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Le faltan caracteres/)).toBeTruthy();
  });

  it("ingreso: se transcribe tal cual y lo inválido es AVISO, no error", () => {
    const onCambio = vi.fn();
    render(<CampoPlaca label="Placa" valor="WRFWR242" onCambio={onCambio} transcribir soloAviso="papel" />);
    const input = screen.getByRole("textbox", { name: "Placa" });
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByText(/Le sobran caracteres.*Si el papel dice así, déjala\./)).toBeTruthy();
    fireEvent.change(input, { target: { value: "wrfwr2425" } });
    // Sin formato ni recorte: sólo mayúsculas.
    expect(onCambio).toHaveBeenCalledWith("WRFWR2425");
  });

  it("guardada: aviso «Así quedó guardada»", () => {
    render(<CampoPlaca label="Placa" valor="QA-450" onCambio={() => {}} soloAviso="guardada" />);
    expect(screen.getByText(/^Así quedó guardada\. Le faltan caracteres/)).toBeTruthy();
  });

  it("un error de afuera (duplicada) manda aunque sea aviso", () => {
    render(<CampoPlaca label="Placa" valor="W2D-853" onCambio={() => {}} soloAviso="guardada" error="Ya está en el directorio." />);
    expect(screen.getByRole("textbox", { name: "Placa" }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Ya está en el directorio.")).toBeTruthy();
  });
});
