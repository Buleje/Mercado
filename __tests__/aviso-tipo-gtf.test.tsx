/**
 * El aviso de tipo mal puesto se dibuja en una línea, sin emoji, y no dibuja
 * nada sin avisos (fase 3, Brandon 2026-10-03).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvisoTipoGtf } from "@/components/admin/forestal/aviso-tipo-gtf";
import { revisarTiposGTF } from "@/lib/forestal/gtf-validador-tipo";

describe("AvisoTipoGtf", () => {
  it("Copal COMERCIAL: dice qué fila revisar y qué tipo parece", () => {
    const avisos = revisarTiposGTF([{ comun: "Copal", tipoProducto: "MADERA ASERRADA (COMERCIAL)", cantidad: 18, total: 0.096 }]);
    render(<AvisoTipoGtf avisos={avisos} />);
    const caja = screen.getByRole("status");
    expect(caja.textContent).toContain("Posible tipo de producto mal asignado: revisar antes de emitir/aceptar la GTF");
    expect(caja.textContent).toContain("Copal COMERCIAL (parece TABLA)");
    expect(caja.textContent).not.toContain("⚠️");
  });

  it("sin avisos no dibuja nada", () => {
    const { container } = render(<AvisoTipoGtf avisos={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
