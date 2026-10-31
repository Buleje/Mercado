/**
 * El Cuadro Resumen 1 con lo que traía la «Conciliación del período» de Saldos.
 *
 * Compactación del libro (2026-10-17): la tabla de Saldos › «Lo que firma el
 * libro» repetía el Cuadro 1 y se fue; el Cuadro 1 heredó sus totales, el
 * Kardex, la fila negativa resaltada y el cruce con el saldo del servidor.
 * El cruce de antes se probaba contra sí mismo (siempre «cerraba»): acá se fija
 * que ahora compara el (15) del cuadro con `concil.materiaPrima[].final`.
 *
 * En el tenant de QA el período no tiene trozas, así que el navegador sólo ve
 * la fila «Sin movimientos»: los casos con filas se fijan acá.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CtpCuadroResumen1 from "@/components/admin/forestal/CtpCuadroResumen1";
import type { Concil } from "@/hooks/use-ctp-saldos";
import type { FilaResumen1 } from "@/lib/forestal/loctp-resumenes";

afterEach(cleanup);

const vp = (volumen: number, piezas: number | null = null) => ({ volumen, piezas });

function fila(especie: string, inicial: number, ingresado: number, consumido: number, salido: number): FilaResumen1 {
  return {
    especie,
    cientifico: null,
    cites: false,
    inicial: vp(inicial, 2),
    ingresado: vp(ingresado, 3),
    retrozado: vp(0),
    deRetrozado: vp(0),
    consumido: vp(consumido),
    salido: vp(salido),
    saldo: vp(inicial + ingresado - consumido - salido),
  };
}

function concil(finales: Record<string, number>): Concil {
  return {
    fuenteApertura: "cierre",
    aperturaLabel: "setiembre 2026",
    materiaPrima: Object.entries(finales).map(([especie, final]) => ({
      especie,
      cites: false,
      apertura: 0,
      ingreso: 0,
      consumido: 0,
      final,
      negativa: final < 0,
    })),
    productos: [],
  };
}

const FILAS = [fila("Tornillo", 10, 5, 4, 1), fila("Cumala", 2, 3, 1, 0)];

describe("Cuadro Resumen 1 con totales y cruce", () => {
  it("suma una fila de totales con las especies del cuadro", () => {
    const { container } = render(<CtpCuadroResumen1 filas={FILAS} />);
    const pie = container.querySelector("tfoot");
    expect(pie?.textContent).toContain("Total · 2 especies");
    /* (3) 12 · (4) 4 piezas · (5) 8 · (6) 6 piezas · … · (15) 14 */
    expect(pie?.textContent).toMatch(/12[.,]0000/);
    expect(pie?.textContent).toMatch(/14[.,]0000/);
  });

  it("dice que cuadra cuando el (15) coincide con el saldo del servidor dentro de 0,01 m³", () => {
    render(<CtpCuadroResumen1 filas={FILAS} concil={concil({ Tornillo: 10.005, Cumala: 4 })} />);
    expect(screen.getByText("Cuadra con «Cómo está hoy»")).toBeTruthy();
  });

  it("dice cuántas especies no cuadran cuando difieren más de 0,01 m³", () => {
    render(<CtpCuadroResumen1 filas={FILAS} concil={concil({ Tornillo: 9.5, Cumala: 4 })} />);
    expect(screen.getByText("1 especie no cuadra con «Cómo está hoy»")).toBeTruthy();
  });

  it("una especie que falta en el servidor cuenta como saldo 0 y no cuadra", () => {
    render(<CtpCuadroResumen1 filas={FILAS} concil={concil({ Tornillo: 10 })} />);
    expect(screen.getByText("1 especie no cuadra con «Cómo está hoy»")).toBeTruthy();
  });

  it("sin concil no promete un cruce", () => {
    render(<CtpCuadroResumen1 filas={FILAS} />);
    expect(screen.queryByText(/con «Cómo está hoy»/)).toBeNull();
  });

  it("resalta la fila entera en negativo y lo dice debajo", () => {
    const { container } = render(<CtpCuadroResumen1 filas={[fila("Capirona", 0, 1, 3, 0)]} />);
    const filaNeg = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes("Capirona"));
    expect(filaNeg?.className).toContain("--data-error-50");
    expect(screen.getByText("Capirona cierra en negativo")).toBeTruthy();
  });

  it("el Kardex aparece sólo con onKardex y abre la especie de su fila", () => {
    const { rerender } = render(<CtpCuadroResumen1 filas={FILAS} />);
    expect(screen.queryByText("Kardex")).toBeNull();
    const onKardex = vi.fn();
    rerender(<CtpCuadroResumen1 filas={FILAS} onKardex={onKardex} />);
    fireEvent.click(screen.getByRole("button", { name: /Kardex de Cumala/ }));
    expect(onKardex).toHaveBeenCalledWith("Cumala");
  });

  it("sin filas: una frase, sin totales ni cruce", () => {
    const { container } = render(<CtpCuadroResumen1 filas={[]} concil={concil({})} />);
    expect(screen.getByText("Sin movimientos de trozas en el período.")).toBeTruthy();
    expect(container.querySelector("tfoot")).toBeNull();
    expect(screen.queryByText(/con «Cómo está hoy»/)).toBeNull();
  });
});
