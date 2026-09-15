import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvisosDelStock, type CuentaAvisos } from "@/components/admin/forestal/ctp-disponibles-avisos";

/* Las cifras del libro real el 2026-09-15: 27 paquetes sin escuadría, 19 sin
   piezas declaradas, 1 parado hace más de 90 días, 0 apartados todavía. */
const CUENTAS_REALES: CuentaAvisos = {
  viejos: 1,
  "sin-escuadria": 27,
  "sin-piezas": 19,
  apartados: 0,
};

describe("AvisosDelStock", () => {
  it("no dibuja el chip de un aviso sin filas", () => {
    render(<AvisosDelStock cuentas={CUENTAS_REALES} activo={null} onElegir={() => {}} />);
    expect(screen.queryByText(/apartado/i)).toBeNull();
    expect(screen.getByText(/27 sin escuadría/)).toBeTruthy();
    expect(screen.getByText(/19 sin piezas declaradas/)).toBeTruthy();
  });

  it("singulariza: «1 parado», nunca «1 parados»", () => {
    render(<AvisosDelStock cuentas={CUENTAS_REALES} activo={null} onElegir={() => {}} />);
    expect(screen.getByText(/^1 parado hace más de 90 días$/)).toBeTruthy();
  });

  it("no dibuja nada cuando el stock no tiene ningún problema", () => {
    const { container } = render(
      <AvisosDelStock
        cuentas={{ viejos: 0, "sin-escuadria": 0, "sin-piezas": 0, apartados: 0 }}
        activo={null}
        onElegir={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("tildar avisa con la clave; volver a tildar el mismo devuelve null", async () => {
    const onElegir = vi.fn();
    const { rerender } = render(
      <AvisosDelStock cuentas={CUENTAS_REALES} activo={null} onElegir={onElegir} />,
    );
    await userEvent.click(screen.getByText(/27 sin escuadría/));
    expect(onElegir).toHaveBeenCalledWith("sin-escuadria");

    rerender(<AvisosDelStock cuentas={CUENTAS_REALES} activo="sin-escuadria" onElegir={onElegir} />);
    await userEvent.click(screen.getByText(/27 sin escuadría/));
    expect(onElegir).toHaveBeenLastCalledWith(null);
  });

  it("el chip tildado se anuncia con aria-pressed y el resto no", () => {
    render(
      <AvisosDelStock cuentas={CUENTAS_REALES} activo="sin-piezas" onElegir={() => {}} />,
    );
    const marcados = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(marcados).toHaveLength(1);
    expect(marcados[0].textContent).toContain("19 sin piezas");
  });

  it("el detalle sólo se muestra con un aviso puesto: sin él las cifras ya cierran", () => {
    const detalle = "Mostrando 27 de 33 filas · 40,120 m³";
    const { rerender } = render(
      <AvisosDelStock
        cuentas={CUENTAS_REALES}
        activo={null}
        onElegir={() => {}}
        detalle={detalle}
      />,
    );
    expect(screen.queryByText(detalle)).toBeNull();

    rerender(
      <AvisosDelStock
        cuentas={CUENTAS_REALES}
        activo="sin-escuadria"
        onElegir={() => {}}
        detalle={detalle}
      />,
    );
    expect(screen.getByText(detalle)).toBeTruthy();
  });
});
