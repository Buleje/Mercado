/**
 * filtros-columna — render real de una tabla con las 4 columnas (Fase 1,
 * 2026-09-22): texto, multi, rango numérico y fecha. Ejercita lo que pide la
 * convención de Brandon (memoria `filtros-en-la-cabecera-tipo-excel`): OR
 * adentro de la columna / AND entre columnas, el filtro huérfano cuando se
 * oculta una columna, el valor ausente que no entra en un rango, y el popover
 * que abre hacia arriba cuando no entra abajo.
 *
 * La tabla es `DemoTablaFiltrosColumna` — la misma que monta el story de
 * Storybook: una sola fuente, no una copia que se desincroniza de la otra.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoTablaFiltrosColumna, filasDemo } from "@/components/admin/shared/filtros-columna/demo-tabla-de-prueba";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const conteo = () => Number(screen.getByTestId("conteo").textContent!.split(" de ")[0]);

describe("tabla con las 4 columnas — filtrar por una sola columna", () => {
  it("el select de una columna texto acota a las filas con ese valor", async () => {
    const user = userEvent.setup();
    render(<DemoTablaFiltrosColumna filas={filasDemo()} />);
    expect(conteo()).toBe(30);

    await user.selectOptions(screen.getByLabelText("Filtrar por Nombre"), "Fila 05");
    expect(conteo()).toBe(1);
    expect(screen.getByRole("cell", { name: "Fila 05" })).toBeInTheDocument();
  });
});

describe("combinar dos columnas — OR adentro, AND entre columnas", () => {
  it("dos categorías tildadas traen CUALQUIERA de las dos (OR)", () => {
    render(<DemoTablaFiltrosColumna filas={filasDemo()} />);
    fireEvent.click(screen.getByRole("button", { name: "Filtrar por Categoría" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Categoría: Comercial" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Categoría: Paquetería" }));

    // 30 filas, 3 categorías repartidas por módulo 3: 10 de cada una.
    expect(conteo()).toBe(20);
  });

  it("agregar un rango de Cantidad se CRUZA con la categoría ya elegida (AND)", () => {
    render(<DemoTablaFiltrosColumna filas={filasDemo()} />);
    fireEvent.click(screen.getByRole("button", { name: "Filtrar por Categoría" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Categoría: Comercial" }));
    expect(conteo()).toBe(10);

    fireEvent.click(screen.getByRole("button", { name: "Filtrar Cantidad por rango" }));
    fireEvent.change(screen.getByLabelText("Cantidad desde"), { target: { value: "50" } });

    const esperadas = filasDemo().filter((f) => f.categoria === "Comercial" && (f.cantidad ?? -1) >= 50).length;
    expect(conteo()).toBe(esperadas);
    expect(esperadas).toBeGreaterThan(0);
    expect(esperadas).toBeLessThan(10);
  });
});

describe("apagar una columna con su filtro puesto", () => {
  it("el control desaparece del <th> pero el chip sigue y desacota", () => {
    render(<DemoTablaFiltrosColumna filas={filasDemo()} />);
    fireEvent.click(screen.getByRole("button", { name: "Filtrar por Categoría" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Categoría: Reproceso" }));
    expect(conteo()).toBe(10);
    expect(screen.getByRole("button", { name: /Quitar el filtro de Categoría/i })).toBeInTheDocument();

    // Se apaga la columna (como el menú "Columnas" del admin).
    fireEvent.click(screen.getByRole("button", { name: "Ocultar columna Categoría" }));

    // El disparador de la cabecera ya no está — OJO: el aria-label cambia a
    // "Filtrar por Categoría: Reproceso" en cuanto hay algo elegido, así que un
    // match EXACTO por "Filtrar por Categoría" ya daría 0 antes de ocultar la
    // columna (falso positivo). Hay que escopear al `<thead>` real y buscar con
    // el prefijo, no el texto completo.
    const cabecera = screen.getByRole("table").querySelector("thead")!;
    expect(within(cabecera).queryByRole("button", { name: /Filtrar por Categoría/ })).not.toBeInTheDocument();
    // …pero el chip sigue, la tabla sigue acotada, y el panel de rescate lo dibuja de nuevo.
    expect(screen.getByRole("button", { name: /Quitar el filtro de Categoría/i })).toBeInTheDocument();
    const panelDeRescate = screen.getByText("Columnas ocultas con filtro puesto").closest("div")!;
    expect(within(panelDeRescate).getByRole("checkbox", { name: "Categoría: Reproceso" })).toBeChecked();
    expect(conteo()).toBe(10);
    expect(screen.getByText("Columnas ocultas con filtro puesto")).toBeInTheDocument();

    // La cruz del chip desacota sin necesitar la columna de vuelta.
    fireEvent.click(screen.getByRole("button", { name: /Quitar el filtro de Categoría/i }));
    expect(conteo()).toBe(30);
    expect(screen.queryByText("Columnas ocultas con filtro puesto")).not.toBeInTheDocument();
  });
});

describe("rango con un valor ausente", () => {
  it("una fila sin Cantidad no entra en un rango pedido, aunque el rango sea amplio", () => {
    render(<DemoTablaFiltrosColumna filas={filasDemo()} />);
    fireEvent.click(screen.getByRole("button", { name: "Filtrar Cantidad por rango" }));
    fireEvent.change(screen.getByLabelText("Cantidad desde"), { target: { value: "0" } });

    // Las 5 filas con cantidad null quedan afuera aunque "≥ 0" las incluiría
    // si tuvieran el dato — es la regla del Excel con una celda vacía.
    expect(conteo()).toBe(25);
    expect(screen.queryByRole("cell", { name: "Fila 00" })).not.toBeInTheDocument();
  });
});

describe("popover que abre hacia arriba", () => {
  it("cuando el disparador está pegado al borde inferior, el panel abre con `bottom`, no `top`", () => {
    Object.defineProperty(window, "innerHeight", { value: 300, configurable: true });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const rect = this.tagName === "SUMMARY" ? { top: 280, bottom: 290, left: 10 } : { top: 0, bottom: 0, left: 0 };
      return { ...rect, right: 0, width: 0, height: 0, x: rect.left, y: rect.top, toJSON: () => rect } as DOMRect;
    });

    render(<DemoTablaFiltrosColumna filas={filasDemo()} />);
    const boton = screen.getByRole("button", { name: "Filtrar por Categoría" });
    const details = boton.closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    const panel = screen.getByRole("group", { name: "Valores de Categoría" });
    expect(panel).toHaveStyle({ bottom: "24px" }); // innerHeight(300) - top(280) + 4
    expect(panel.style.top).toBe("");
  });
});

describe("light + dark — sin tokens hardcodeados", () => {
  it("los controles usan var(--...) del DS, no hex sueltos", () => {
    render(<DemoTablaFiltrosColumna filas={filasDemo()} />);
    const boton = screen.getByRole("button", { name: "Filtrar por Categoría" });
    expect(boton.className).toMatch(/var\(--/);
    expect(boton.className).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
