/**
 * El saldo por cliente es una suma de floats (10.1 + 20.2 = 30.299999…).
 * Sin redondear, `max` quedaba debajo del «Todo» (30.30) y el navegador no
 * dejaba enviar el cobro desde «Quién te debe».
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PagoFiadoModal from "@/components/admin/fiados/PagoFiadoModal";

describe("PagoFiadoModal — tope del monto", () => {
  it("con saldo 10.1 + 20.2 el formulario con «Todo» es válido", () => {
    render(
      <PagoFiadoModal abierto titulo="Rosa Pérez · 2 fiados" saldo={10.1 + 20.2} pagando={false} error={null}
        onCerrar={vi.fn()} onCobrar={vi.fn()} />,
    );
    const input = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    expect(input.value).toBe("30.30");
    expect(input.max).toBe("30.3");
    expect(input.validity.rangeOverflow).toBe(false);
    expect((input.form as HTMLFormElement).checkValidity()).toBe(true);
  });
});
