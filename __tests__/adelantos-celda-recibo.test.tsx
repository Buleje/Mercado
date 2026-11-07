/**
 * La celda «Recibo» de la tabla de adelantos (23-10): cada ícono es un botón de
 * 36 px que registra lo que falta (firmar, la huella, la foto) o muestra lo que
 * ya está; en un anulado lo que falta no se puede tocar; el clic no abre la ficha.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CeldaRecibo from "@/components/admin/adelantos/lista/CeldaRecibo";
import { ESTADO_VACIO } from "@/lib/adelantos/recibo-whatsapp";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

const adelanto = (parcial: Partial<DbAdelanto> = {}) => ({ id: "a1", status: "ABIERTO", comprobanteUrl: null, firmas: null, ...parcial }) as unknown as DbAdelanto;

describe("CeldaRecibo", () => {
  it("lo que falta: tres botones que dicen qué hacen", () => {
    const onMarca = vi.fn();
    render(<CeldaRecibo adelanto={adelanto()} estado={ESTADO_VACIO} carga="listo" onMarca={onMarca} />);
    for (const [nombre, tipo] of [
      ["Firmar", "firma"],
      ["Registrar huella", "huella"],
      ["Tomar foto", "foto"],
    ] as const) {
      const b = screen.getByRole("button", { name: nombre });
      expect(b.className).toMatch(/\bh-9\b/);
      expect(b.className).toMatch(/\bw-9\b/);
      fireEvent.click(b);
      expect(onMarca).toHaveBeenLastCalledWith(tipo, false);
    }
  });

  it("lo que ya está se mira con su hora", () => {
    const onMarca = vi.fn();
    render(
      <CeldaRecibo
        adelanto={adelanto()}
        estado={{ ...ESTADO_VACIO, firma: "2026-10-23T16:06:00.000Z", huella: "2026-10-23T16:07:00.000Z" }}
        carga="listo"
        onMarca={onMarca}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Ver la firma · 23\/10 11:06/ }));
    expect(onMarca).toHaveBeenLastCalledWith("firma", true);
    fireEvent.click(screen.getByRole("button", { name: /^Ver la huella · 23\/10 11:07/ }));
    expect(onMarca).toHaveBeenLastCalledWith("huella", true);
  });

  it("anulado: lo que falta sale apagado y no registra nada; lo que hay se sigue mirando", () => {
    const onMarca = vi.fn();
    render(<CeldaRecibo adelanto={adelanto({ status: "CANCELADO" })} estado={{ ...ESTADO_VACIO, firma: "2026-10-23T16:06:00.000Z" }} carga="listo" onMarca={onMarca} />);
    const huella = screen.getByRole("button", { name: /Huella: falta\. Anulado/ });
    expect((huella as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(huella);
    expect(onMarca).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Ver la firma/ }));
    expect(onMarca).toHaveBeenCalledWith("firma", true);
  });

  it("el clic en un ícono no llega a la fila (que abre la ficha)", () => {
    const fila = vi.fn();
    render(
      <div onClick={fila}>
        <CeldaRecibo adelanto={adelanto()} estado={ESTADO_VACIO} carga="listo" onMarca={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Firmar" }));
    expect(fila).not.toHaveBeenCalled();
  });
});
