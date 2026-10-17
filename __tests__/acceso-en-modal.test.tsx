/**
 * Accesos rápidos de la cabecera en MODAL (Brandon 10-10: «que salga su
 * versión modal ahí mismo… no que se vaya a la página»).
 *
 *  - el acceso abre su módulo encima de la pantalla y la URL no cambia;
 *  - el módulo de adentro recibe su vista por contexto, no por `?vista=`, y
 *    cambiar de vista adentro no toca la URL de la pantalla de atrás;
 *  - Escape, la X y un enlace a otra pantalla (`admin:navigate`) lo cierran.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVistaEmbebida, useVistaModulo } from "@/hooks/use-vista-modulo";

/* Cada `dynamic(() => import(...))` se vuelve un módulo de mentira que muestra
   la vista que le llegó: la del contexto del modal (useVistaModulo) y la prop. */
const real = vi.hoisted(() => ({ AccesoEnModal: null as null | ((p: never) => React.ReactNode) }));

vi.mock("next/dynamic", () => ({
  default: (cargar: () => Promise<unknown>) => {
    const fuente = String(cargar);
    if (fuente.includes("AccesoEnModal")) {
      return function AccesoEnModalReal(props: Record<string, unknown>) {
        const Real = real.AccesoEnModal as unknown as (
          p: Record<string, unknown>,
        ) => React.ReactNode;
        return <>{Real(props)}</>;
      };
    }
    return function ModuloFalso({ initialTab }: { initialTab?: string }) {
      const embebida = useVistaEmbebida();
      const { vista, irA } = useVistaModulo(
        "falso",
        ["camaras", "fotos", "drive", "asistencia"],
        "fotos",
      );
      return (
        <div data-testid="modulo">
          {`vista=${vista} prop=${initialTab ?? "-"} embebida=${embebida ? "si" : "no"}`}
          <button type="button" onClick={() => irA("fotos")}>
            ir a fotos
          </button>
        </div>
      );
    };
  },
}));

vi.mock("@/hooks/use-vistas-permitidas", async () => {
  const { SIN_FILTRO } = await import("@/lib/admin/permiso-vista");
  return { useContextoPermiso: () => SIN_FILTRO };
});

import AccesosRapidos from "@/components/admin/header/AccesosRapidos";
import AccesoEnModal from "@/components/admin/header/AccesoEnModal";
import { ACCESOS } from "@/components/admin/header/accesos-rapidos";

real.AccesoEnModal = AccesoEnModal as never;
const camaras = ACCESOS.find((a) => a.id === "camaras")!;

// El tooltip de Radix (al volver el foco al botón «Accesos») mide con ResizeObserver: jsdom no lo trae.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/admin?tab=vendor-dashboard&vista=resumen");
});

describe("AccesoEnModal", () => {
  it("abre el módulo con su vista por contexto, sin leer ni escribir la URL", () => {
    render(<AccesoEnModal acceso={camaras} onCerrar={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Cámaras" })).toBeInTheDocument();
    expect(screen.getByTestId("modulo")).toHaveTextContent(
      "vista=camaras prop=camaras embebida=si",
    );
    fireEvent.click(screen.getByRole("button", { name: "ir a fotos" }));
    expect(screen.getByTestId("modulo")).toHaveTextContent("vista=fotos");
    expect(window.location.search).toBe("?tab=vendor-dashboard&vista=resumen");
  });

  it("Escape, la X y un enlace a otra pantalla lo cierran", () => {
    const onCerrar = vi.fn();
    render(<AccesoEnModal acceso={camaras} onCerrar={onCerrar} />);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    act(() => {
      window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "pedidos" } }));
    });
    expect(onCerrar).toHaveBeenCalledTimes(3);
  });
});

describe("AccesosRapidos", () => {
  it("un acceso del menú abre su modal ahí mismo: la URL de la pantalla no cambia", () => {
    render(<AccesosRapidos />);
    fireEvent.click(screen.getByRole("button", { name: "Accesos rápidos" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Asistencia/ }));
    expect(screen.getByRole("dialog", { name: "Asistencia" })).toBeInTheDocument();
    expect(screen.getByTestId("modulo")).toHaveTextContent("vista=asistencia");
    expect(window.location.search).toBe("?tab=vendor-dashboard&vista=resumen");
  });

  it("«Elegir los de la barra» ancla y quita, y se recuerda", () => {
    render(<AccesosRapidos />);
    fireEvent.click(screen.getByRole("button", { name: "Accesos rápidos" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Elegir los de la barra/ }));
    const vender = screen.getByRole("menuitemcheckbox", { name: /Vender/ });
    expect(vender).toHaveAttribute("aria-checked", "false");
    fireEvent.click(vender);
    expect(screen.getByRole("menuitemcheckbox", { name: /Vender/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(JSON.parse(localStorage.getItem("admin_header_accesos") ?? "[]")).toContain("vender");
  });
});
