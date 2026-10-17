/**
 * Tests — aviso de las secciones 4-6 en «Nueva línea» del LO-TH (2026-09-28).
 *
 * Consumo, producto terminado y despacho de producto casi nunca van en este
 * libro: la madera va a una planta y eso se asienta en el Libro CTP. El
 * formulario lo pregunta con una casilla y, sin marcarla, no se guarda.
 * Lo que se prueba:
 *   - en 4-6 el aviso sale y «Registrar línea» queda deshabilitado con el motivo;
 *   - marcar la casilla cambia el motivo (ya sólo faltan los campos);
 *   - partiendo de una línea existente la casilla arranca marcada;
 *   - «Ir al Libro CTP» sólo existe con la prop, y cierra el modal antes de ir;
 *   - tala (1-3) no trae el aviso ni la vista previa.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LothEntryForm from "@/components/admin/forestal/LothEntryForm";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

beforeEach(() => {
  // Sin red: plan, fuentes, CITES y especies responden vacío.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const CASILLA = /La transformé dentro del título habilitante/;

function registrar() {
  return screen.getByRole("button", { name: /Registrar línea/ });
}

describe("LothEntryForm — aviso del Libro CTP en 4-6", () => {
  it("consumo: aviso visible y Guardar deshabilitado hasta marcar la casilla", () => {
    render(<LothEntryForm section="consumo_troza" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText(/¿La madera va a una planta\?/)).toBeTruthy();
    const casilla = screen.getByRole("checkbox", { name: CASILLA }) as HTMLInputElement;
    expect(casilla.checked).toBe(false);
    expect((registrar() as HTMLButtonElement).disabled).toBe(true);
    expect(registrar().getAttribute("title")).toMatch(/Marca «La transformé/);
    expect((screen.getByRole("button", { name: /Guardar y otro/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(casilla);
    expect(casilla.checked).toBe(true);
    // Sigue deshabilitado por los campos vacíos, pero el motivo ya es otro.
    expect(registrar().getAttribute("title")).toMatch(/^Falta: /);
  });

  it("partiendo de una línea existente la casilla arranca marcada", () => {
    const plantilla = { id: "x", section: "producto_terminado", entryDate: "2026-09-01" } as unknown as LothEntryDTO;
    render(<LothEntryForm section="producto_terminado" plantilla={plantilla} onClose={() => {}} onSaved={() => {}} />);
    expect((screen.getByRole("checkbox", { name: CASILLA }) as HTMLInputElement).checked).toBe(true);
  });

  it("sin onIrAlCtp no hay botón; con la prop cierra el modal y va al CTP", () => {
    const { unmount } = render(<LothEntryForm section="despacho_producto" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByRole("button", { name: /Ir al Libro CTP/ })).toBeNull();
    unmount();

    const orden: string[] = [];
    render(
      <LothEntryForm
        section="despacho_producto"
        onClose={() => orden.push("cerrar")}
        onSaved={() => {}}
        onIrAlCtp={() => orden.push("ctp")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ir al Libro CTP/ }));
    expect(orden).toEqual(["cerrar", "ctp"]);
  });

  it("tala no trae el aviso ni la vista previa", () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByText(/¿La madera va a una planta\?/)).toBeNull();
    expect(screen.queryByText(/Vista previa del registro/)).toBeNull();
    expect(registrar().getAttribute("title")).toMatch(/^Falta: /);
  });
});
