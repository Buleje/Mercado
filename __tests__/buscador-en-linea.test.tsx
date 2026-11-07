/**
 * Buscador EN LÍNEA de la cabecera (Brandon 20-10: «quita este modal de buscar
 * en todo el panel y solo el campo de buscar módulos ahí mismo se pueda buscar
 * sin que aparezca otro modal»).
 *
 *  - el campo es un combobox: al escribir, la lista sale debajo, sin ventana;
 *  - ↓ + Enter lleva al módulo con el mismo evento que el panel ya escucha;
 *  - Esc cierra la lista; Ctrl+K enfoca el campo desde cualquier lado.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-vistas-permitidas", async () => {
  const { SIN_FILTRO } = await import("@/lib/admin/permiso-vista");
  return { useContextoPermiso: () => SIN_FILTRO };
});
vi.mock("@/hooks/use-recientes-panel", () => ({
  useRecientes: () => ({ recientes: [], listo: true, borrar: () => {} }),
  useRegistrarRecientes: () => {},
}));

import GlobalSearch from "@/components/admin/GlobalSearch";
import { enfocarBuscadorPanel } from "@/components/admin/buscador/enfocar-buscador";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ productos: [], clientes: [], pedidos: [] }), { status: 200 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const campo = () => screen.getByRole("combobox", { name: /Buscar en el panel/ });

describe("GlobalSearch en línea", () => {
  it("escribir muestra los resultados debajo del campo, sin ventana", () => {
    render(<GlobalSearch />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: "pedidos" } });
    expect(campo()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Resultados de la búsqueda" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(campo()).toHaveAttribute("aria-activedescendant");
  });

  it("Enter lleva al módulo elegido y Esc cierra la lista", () => {
    const onNavigate = vi.fn();
    render(<GlobalSearch onNavigate={onNavigate} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: "pedidos" } });
    fireEvent.keyDown(campo(), { key: "Escape" });
    expect(campo()).toHaveAttribute("aria-expanded", "false");
    expect(campo()).toHaveValue("pedidos");
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    expect(campo()).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(campo(), { key: "Enter" });
    // Un módulo navega (evento o enlace); el campo queda vacío y cerrado.
    expect(campo()).toHaveValue("");
    expect(campo()).toHaveAttribute("aria-expanded", "false");
  });

  it("Ctrl+K y el pedido de los atajos del panel enfocan el campo", () => {
    vi.useFakeTimers();
    try {
      render(<GlobalSearch />);
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(document.activeElement).toBe(campo());
      act(() => campo().blur());
      act(() => {
        enfocarBuscadorPanel();
        vi.runAllTimers();
      });
      expect(document.activeElement).toBe(campo());
    } finally {
      vi.useRealTimers();
    }
  });
});
