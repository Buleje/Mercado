/**
 * Tests — la vista «Por árbol» por etapa (30-09), en el DOM.
 *
 * Lo que un gate estático no ve:
 *   - «Qué falta hacer» llama a `onRegistrarTrozado` con ESE árbol (el libro lo
 *     conecta a `abrirTrozado`, que abre la sección 2 con el árbol elegido);
 *   - sin nada pendiente, el bloque no existe;
 *   - «En pie» arranca plegado con la cifra en una línea, y abre con
 *     `aria-expanded` una tabla por especie;
 *   - con el filtro forzándolo abierto se puede cerrar igual SIN tocar la
 *     preferencia guardada;
 *   - el `cupo` opcional agrega su columna.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LothTracePendientes from "@/components/admin/forestal/LothTracePendientes";
import LothTraceEnPie from "@/components/admin/forestal/LothTraceEnPie";
import type { EnPieResumen, Pendientes } from "@/lib/forestal/loth-trace-grupos";

const pendientes: Pendientes = {
  sinTrozar: [
    { tree: "100", especie: "Mashonaste", taladoM3: 2.8, fechaTala: "2026-09-28", dias: 2 },
    { tree: "114", especie: "Lupuna", taladoM3: 15.6, fechaTala: "2026-09-28", dias: 2 },
  ],
  patio: [],
  mermaGrave: [],
  total: 2,
};

const enPie: EnPieResumen = {
  arboles: 3,
  m3: 42,
  especies: [
    { clave: "tornillo", especie: "Tornillo", arboles: 2, m3: 22, codigos: ["200", "201"] },
    { clave: "lupuna", especie: "Lupuna", arboles: 1, m3: 20, codigos: ["300"] },
  ],
};

describe("LothTracePendientes", () => {
  it("«Registrar trozado» abre el trozado con ese árbol", () => {
    const onRegistrarTrozado = vi.fn();
    render(<LothTracePendientes p={pendientes} onRegistrarTrozado={onRegistrarTrozado} onAbrir={vi.fn()} />);
    expect(screen.getByText("Talados sin trozar · 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Registrar el trozado del árbol 114" }));
    expect(onRegistrarTrozado).toHaveBeenCalledWith("114");
  });

  it("sin el libro (sin nav), ofrece el detalle en vez de un botón muerto", () => {
    const onAbrir = vi.fn();
    render(<LothTracePendientes p={pendientes} onAbrir={onAbrir} />);
    expect(screen.queryByText("Registrar trozado")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle del árbol 100" }));
    expect(onAbrir).toHaveBeenCalledWith("100");
  });

  it("nada pendiente → no se dibuja", () => {
    const { container } = render(<LothTracePendientes p={{ sinTrozar: [], patio: [], mermaGrave: [], total: 0 }} onAbrir={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("LothTraceEnPie", () => {
  it("plegado dice la cifra en una línea; abrir muestra la tabla por especie", () => {
    const onAbierto = vi.fn();
    const { rerender } = render(<LothTraceEnPie enPie={enPie} abierto={false} onAbierto={onAbierto} />);
    const boton = screen.getByRole("button", { expanded: false });
    expect(boton.textContent).toContain("3 árboles");
    expect(boton.textContent).toContain("por talar");
    expect(screen.getByRole("table", { hidden: true }).closest("[hidden]")).not.toBeNull();
    fireEvent.click(boton);
    expect(onAbierto).toHaveBeenCalledWith(true);

    rerender(<LothTraceEnPie enPie={enPie} abierto onAbierto={onAbierto} />);
    expect(screen.getByRole("button", { expanded: true })).toBeTruthy();
    expect(screen.getByRole("row", { name: /Tornillo 2 .* 200, 201/ })).toBeTruthy();
  });

  it("abierto por el filtro se puede cerrar sin pisar la preferencia", () => {
    const onAbierto = vi.fn();
    render(<LothTraceEnPie enPie={enPie} abierto={false} forzado onAbierto={onAbierto} />);
    const boton = screen.getByRole("button", { expanded: true });
    fireEvent.click(boton);
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
    expect(onAbierto).not.toHaveBeenCalled();
  });

  it("el cupo opcional agrega su columna", () => {
    render(<LothTraceEnPie enPie={enPie} abierto onAbierto={vi.fn()} cupo={(g) => <span>cupo {g.clave}</span>} />);
    expect(screen.getByRole("columnheader", { name: "Cupo" })).toBeTruthy();
    expect(screen.getByText("cupo lupuna")).toBeTruthy();
  });

  it("sin árboles en pie no se dibuja", () => {
    const { container } = render(<LothTraceEnPie enPie={{ arboles: 0, m3: 0, especies: [] }} abierto onAbierto={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
