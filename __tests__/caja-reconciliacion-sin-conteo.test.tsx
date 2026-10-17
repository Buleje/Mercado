/**
 * Caja › Historial › Por día y la tendencia, con cierres sin conteo y cajas
 * que se compensan. `close(null)` (cron o «Cerrar turno» sin contar) guarda
 * contado = esperado y diferencia 0: esa caja sumaba a «Real» y a «Total
 * recaudado» y su día salía «OK». Y +5 en una caja y −5 en otra del mismo día
 * daban 0 de neto: «OK» también. Además, la tolerancia del negocio en la tabla
 * de cuadres (Historial › Por caja), que se perdió al borrar CajaHistorial.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { CajaReconciliacion } from "@/components/admin/caja/CajaReconciliacion";
import { CajaTendencia } from "@/components/admin/caja/CajaTendencia";
import { dentroDeTolerancia } from "@/components/admin/arqueo/arqueo-shared";
import type { CashRegister } from "@/components/admin/caja/tipos";

/* El gráfico va por next/dynamic: acá, un div que muestra las diferencias que recibió. */
vi.mock("next/dynamic", () => ({
  default: () =>
    function GraficoFalso({ sparkData }: { sparkData: { diff: number }[] }) {
      return <div data-testid="tendencia">{sparkData.map((p) => p.diff).join(",")}</div>;
    },
}));

afterEach(cleanup);

/* Mediodía UTC: el mismo día local en cualquier zona del runner. */
function caja(id: string, dia: string, p: Partial<CashRegister>): CashRegister {
  return { id, openedAt: `${dia}T13:00:00.000Z`, closedAt: `${dia}T17:00:00.000Z`, openingAmount: 100, status: "cerrada", movements: [], ...p };
}

const automatica = (id: string, dia: string) =>
  caja(id, dia, { expectedAmount: 320, closingAmount: 320, difference: 0, notes: "Cierre automático por inactividad" });

function filaDe(texto: RegExp) {
  return screen.getAllByRole("row").find((r) => texto.test(r.textContent ?? ""))!;
}

describe("Caja › Por día", () => {
  const props = (cerradas: CashRegister[]): ComponentProps<typeof CajaReconciliacion> => ({ cerradas, tolerancia: 1 });

  it("una caja cerrada sin conteo: su día dice «Sin conteo», no «OK», y no suma a lo recaudado", () => {
    render(<CajaReconciliacion {...props([automatica("a", "2026-10-08")])} />);
    const fila = filaDe(/1 caja/);
    expect(fila.textContent).toContain("Sin conteo");
    expect(within(fila).queryByText("OK")).toBeNull();
    // Esperado, real y diferencia: nadie contó, no hay cifra que mostrar.
    expect(within(fila).getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("Total recaudado").textContent).toContain("S/ 0.00");
    expect(screen.getByText("Cerradas sin conteo").textContent).toContain("1");
  });

  it("dos cajas del mismo día, +5 y −5: el neto da 0 pero el día no sale «OK»", () => {
    render(
      <CajaReconciliacion
        {...props([
          caja("b", "2026-10-07", { expectedAmount: 200, closingAmount: 205, difference: 5 }),
          caja("c", "2026-10-07", { expectedAmount: 300, closingAmount: 295, difference: -5 }),
        ])}
      />,
    );
    const fila = filaDe(/2 cajas/);
    expect(within(fila).queryByText("OK")).toBeNull();
    expect(fila.textContent).toContain("Alerta");
    expect(fila.textContent).toContain("faltó S/ 5.00 · sobró S/ 5.00");
    // La acumulada suma cada caja: 5 + 5, no |5 − 5|.
    expect(screen.getByText(/Diferencia acumulada/).textContent).toContain("S/ 10.00");
  });

  it("un día con una caja contada que cuadra y otra sin conteo: «Sin conteo», y sólo suma la contada", () => {
    render(
      <CajaReconciliacion
        {...props([caja("d", "2026-10-06", { expectedAmount: 150, closingAmount: 150, difference: 0 }), automatica("e", "2026-10-06")])}
      />,
    );
    const fila = filaDe(/2 cajas · 1 sin conteo/);
    expect(fila.textContent).toContain("Sin conteo");
    expect(within(fila).queryByText("OK")).toBeNull();
    expect(screen.getByText("Total recaudado").textContent).toContain("S/ 150.00");
  });
});

describe("Caja › tendencia de las diferencias", () => {
  it("deja afuera los cierres sin conteo (sus ceros no los contó nadie)", () => {
    render(
      <CajaTendencia
        cerradas={[
          caja("1", "2026-10-09", { difference: -3 }),
          automatica("2", "2026-10-08"),
          caja("3", "2026-10-07", { difference: 2 }),
          automatica("4", "2026-10-06"),
          caja("5", "2026-10-05", { difference: 1 }),
        ]}
      />,
    );
    expect(screen.getByTestId("tendencia").textContent).toBe("1,2,-3");
  });

  it("con dos o menos cierres contados no dibuja nada, aunque haya cierres sin conteo", () => {
    const { container } = render(
      <CajaTendencia cerradas={[caja("1", "2026-10-09", { difference: -3 }), automatica("2", "2026-10-08"), automatica("3", "2026-10-07")]} />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("Cuadres › tolerancia del negocio", () => {
  it("«Dentro de tolerancia» sólo para sobrantes y faltantes de hasta ± la tolerancia", () => {
    expect(dentroDeTolerancia({ status: "faltante", difference: -0.5 }, 1)).toBe(true);
    expect(dentroDeTolerancia({ status: "sobrante", difference: 1 }, 1)).toBe(true);
    expect(dentroDeTolerancia({ status: "faltante", difference: -1.01 }, 1)).toBe(false);
    // Lo que cuadró al céntimo sigue «Conforme»; sin conteo no es una diferencia.
    expect(dentroDeTolerancia({ status: "conforme", difference: 0 }, 1)).toBe(false);
    expect(dentroDeTolerancia({ status: "sin_conteo", difference: 0 }, 1)).toBe(false);
    // Sin tolerancia (fuera de Caja) decide sólo el céntimo.
    expect(dentroDeTolerancia({ status: "faltante", difference: -0.5 }, undefined)).toBe(false);
  });
});
