/**
 * ADR-458 · `<RecargarSinPiezas>`: el respaldo liviano de una pieza que
 * reemplaza. Recarga la MISMA URL (con su búsqueda) agregando `sinPiezas=1`;
 * si ya lo trae, no recarga — nunca un bucle.
 */
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecargarSinPiezas, urlSinPiezas } from "@/lib/extensiones/RecargarSinPiezas";
import { pideSinPiezas } from "@/extensiones/_contrato";

describe("urlSinPiezas", () => {
  it("agrega sinPiezas=1 y conserva la búsqueda y el ancla", () => {
    expect(urlSinPiezas("http://localhost:3000/t/main?preview=true#ofertas")).toBe(
      "http://localhost:3000/t/main?preview=true&sinPiezas=1#ofertas",
    );
  });

  it("si ya es la general pura → null (no recargar)", () => {
    expect(urlSinPiezas("http://localhost:3000/t/main?sinPiezas=1")).toBeNull();
  });

  it("la ruta lee la misma marca", () => {
    expect(pideSinPiezas({ sinPiezas: "1" })).toBe(true);
    expect(pideSinPiezas({ sinPiezas: ["1", "1"] })).toBe(false);
    expect(pideSinPiezas({})).toBe(false);
  });
});

describe("<RecargarSinPiezas>", () => {
  afterEach(() => vi.unstubAllGlobals());

  const conUbicacion = (href: string) => {
    const replace = vi.fn();
    vi.stubGlobal("location", { href, replace });
    return replace;
  };

  it("recarga con replace (sin dejar la página rota en el historial) y no pinta nada", () => {
    const replace = conUbicacion("http://localhost:3000/t/main");
    const { container } = render(<RecargarSinPiezas />);
    expect(replace).toHaveBeenCalledWith("http://localhost:3000/t/main?sinPiezas=1");
    expect(container.innerHTML).toBe("");
  });

  it("ya en ?sinPiezas=1 no recarga", () => {
    const replace = conUbicacion("http://localhost:3000/t/main?sinPiezas=1");
    render(<RecargarSinPiezas />);
    expect(replace).not.toHaveBeenCalled();
  });
});
