/**
 * La tira de días del registro, pedidos del 2026-09-23:
 *  · «poder ocultar y mostrar la sección de día de registro» — plegada queda UNA
 *    línea con el día elegido y lo que ya tiene, y se recuerda por dispositivo;
 *  · «opción para eliminar esa cubicación de ese día» — la papelera del
 *    casillero y el botón del detalle piden anular ESE día; sólo en producción
 *    y sólo si quien monta la tira sabe hacerlo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/components/admin/forestal/CtpResumenDeJornadasModal", () => ({
  default: ({ dias }: { dias: string[] }) => <div data-testid="resumen">{dias.join(",")}</div>,
}));

import CtpSemanaDeRegistro from "@/components/admin/forestal/CtpSemanaDeRegistro";
import type { JornadaDeProduccion } from "@/components/admin/forestal/hooks/use-jornadas-produccion";

const JUEVES: JornadaDeProduccion = {
  dia: "2026-09-17",
  corridas: 2,
  m3: 5.6,
  pt: 2374,
  piezas: 40,
  detalle: {
    especies: [{ especie: "Tornillo", corridas: 2, m3: 5.6, pt: 2374 }],
    clasificaciones: [{ producto: "MADERA ASERRADA (COMERCIAL)", piezas: 40, m3: 5.6 }],
    duenos: [{ etiqueta: "De tercero · WASACO", corridas: 2 }],
    permisos: ["10-HUA-PUE/PER-FMP-2026-007"],
    lineas: ["LP"],
    sinMateriaPrima: 2,
    paquetes: 2,
    corridas: [
      { lineNo: 30, especie: "Tornillo", m3: 2.8, materiaPrimaRef: null },
      { lineNo: 31, especie: "Tornillo", m3: 2.8, materiaPrimaRef: null },
    ],
  },
};

function tira(props: Partial<React.ComponentProps<typeof CtpSemanaDeRegistro>> = {}) {
  const onElegir = vi.fn();
  const utils = render(
    <CtpSemanaDeRegistro
      valor="2026-09-17"
      onElegir={onElegir}
      semana="2026-09-16"
      onSemana={() => {}}
      porDia={new Map([[JUEVES.dia, JUEVES]])}
      {...props}
    />,
  );
  return { onElegir, ...utils };
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("plegar la tira", () => {
  it("plegada deja el día elegido y lo que ya tiene en una línea, sin los casilleros", () => {
    tira();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar los días" }));
    expect(
      screen.queryByRole("group", { name: "Elige el día de la jornada" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Semana anterior")).not.toBeInTheDocument();
    expect(screen.getByText("jueves 17/09")).toBeInTheDocument();
    expect(screen.getByText(/ya tiene 2 corridas \(2,374 PT\)/)).toBeInTheDocument();
  });

  it("se recuerda por dispositivo y por sección", () => {
    const { unmount } = tira();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar los días" }));
    unmount();
    tira();
    expect(screen.getByRole("button", { name: /Mostrar los días/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    cleanup();
    /* Otra sección no hereda el plegado. */
    tira({ seccion: "consumo" });
    expect(screen.getByRole("group", { name: "Elige el día de la jornada" })).toBeInTheDocument();
  });

  it("mostrar la vuelve a abrir con los siete casilleros", () => {
    tira();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar los días" }));
    fireEvent.click(screen.getByRole("button", { name: /Mostrar los días/ }));
    expect(
      within(screen.getByRole("group", { name: "Elige el día de la jornada" })).getAllByRole(
        "button",
        { pressed: false },
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("anular el día", () => {
  it("sin quien lo sepa hacer, no hay papelera", () => {
    tira();
    expect(screen.queryByRole("button", { name: /Anular lo declarado/ })).not.toBeInTheDocument();
  });

  it("la papelera del casillero pide anular ESE día (y sólo los días con producción)", () => {
    const onAnularDia = vi.fn();
    tira({ onAnularDia });
    const botones = screen.getAllByRole("button", { name: /Anular lo declarado/ });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]!);
    expect(onAnularDia).toHaveBeenCalledWith("2026-09-17");
  });

  it("en consumo no se ofrece: la tira de consumo no anula corridas", () => {
    tira({ onAnularDia: vi.fn(), seccion: "consumo" });
    expect(screen.queryByRole("button", { name: /Anular lo declarado/ })).not.toBeInTheDocument();
  });

  it("en táctil se anula desde el detalle, que se cierra antes de preguntar", () => {
    const onAnularDia = vi.fn();
    tira({ onAnularDia });
    fireEvent.click(screen.getByRole("button", { name: /Ver el detalle del jueves 17\/09/ }));
    const panel = screen.getByRole("dialog", { name: "Detalle del jueves 17/09" });
    fireEvent.click(within(panel).getByRole("button", { name: /Anular el día/ }));
    expect(onAnularDia).toHaveBeenCalledWith("2026-09-17");
    expect(
      screen.queryByRole("dialog", { name: "Detalle del jueves 17/09" }),
    ).not.toBeInTheDocument();
  });

  it("mientras se anula, la papelera no se vuelve a pedir", () => {
    tira({ onAnularDia: vi.fn(), anulandoDia: "2026-09-17" });
    expect(screen.getByRole("button", { name: /Anular lo declarado/ })).toBeDisabled();
  });

  it("«Ver qué salió ese día» sigue siendo el último control del detalle (Tab ahí cierra)", () => {
    tira({ onAnularDia: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /Ver el detalle del jueves 17\/09/ }));
    const panel = screen.getByRole("dialog", { name: "Detalle del jueves 17/09" });
    const botones = within(panel).getAllByRole("button");
    expect(botones[botones.length - 1]).toHaveAccessibleName(/Ver qué salió ese día/);
  });
});

describe("el detalle compacto", () => {
  it("dueño, permiso y línea van en una franja, no en tres bloques con título", () => {
    tira();
    fireEvent.click(screen.getByRole("button", { name: /Ver el detalle del jueves 17\/09/ }));
    const panel = screen.getByRole("dialog", { name: "Detalle del jueves 17/09" });
    expect(
      within(panel).queryByRole("heading", { name: "Dueño de la madera" }),
    ).not.toBeInTheDocument();
    expect(within(panel).getByText("De tercero · WASACO")).toBeInTheDocument();
    expect(within(panel).getByText("10-HUA-PUE/PER-FMP-2026-007")).toBeInTheDocument();
    expect(within(panel).getByText("LP")).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Especies" })).toBeInTheDocument();
  });
});
