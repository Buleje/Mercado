/**
 * Compras › Sugerencias: lo que Productos y stock avisa como «necesita
 * reposición» tiene que VERSE al llegar (10-10). El motor de Compras no sugiere
 * lo que no se vendió (ADR-376), así que en `main` la pantalla decía «Nada que
 * reponer» con el producto bajo su mínimo plegado entre los 75 sin venta.
 *
 * Ejecutar: npx vitest run __tests__/compras-sugerencias-bajo-minimo.test.tsx
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/components/admin/shared/EnlacePanel", () => {
  const Enlace = ({ href, cosa, id, children }: { href?: string; cosa?: string; id?: string; children: ReactNode }) => (
    <a href={href ?? `#${cosa}-${id}`}>{children}</a>
  );
  return { default: Enlace, EnlacePanel: Enlace };
});

import SugerenciasBajoMinimo, { HREF_COMPRAR_REPONER } from "@/components/admin/compras/sugerencias/SugerenciasBajoMinimo";
import { bajoSuMinimo, type SinRotacion } from "@/components/admin/compras/sugerencias/tipos";

const sinVenta = (productId: number, currentStock: number, stockMin: number): SinRotacion => ({
  productId,
  productName: `Producto ${productId}`,
  category: "Belleza",
  currentStock,
  stockMin,
  excesoSobreMinimo: Math.max(currentStock - stockMin, 0),
  motivo: "No se vendió nada en 30 días",
});

afterEach(cleanup);

describe("bajoSuMinimo", () => {
  it("toma los sin venta EN o BAJO su mínimo, como Productos y stock", () => {
    const lista = [sinVenta(1, 3, 3), sinVenta(2, 1, 3), sinVenta(3, 20, 2)];
    expect(bajoSuMinimo(lista).map((s) => s.productId)).toEqual([1, 2]);
  });

  it("sin mínimo cargado no cuenta (stock 0 con mínimo 0 no es «bajo el mínimo»)", () => {
    expect(bajoSuMinimo([sinVenta(4, 0, 0)])).toEqual([]);
  });
});

describe("SugerenciasBajoMinimo", () => {
  it("muestra el producto a la vista y lleva a Comprar con «A reponer»", () => {
    render(<SugerenciasBajoMinimo items={[sinVenta(1252656, 3, 3)]} ventanaDias={30} />);
    expect(screen.getByText("Producto 1252656")).toBeTruthy();
    expect(screen.getByText(/en o bajo su mínimo, sin venta en 30 días/)).toBeTruthy();
    const armar = screen.getByRole("link", { name: /Armar la compra/ });
    expect(armar.getAttribute("href")).toBe(HREF_COMPRAR_REPONER);
    expect(HREF_COMPRAR_REPONER).toContain("vista=punto-compra");
    expect(HREF_COMPRAR_REPONER).toContain("reponer=1");
  });

  it("sin productos bajo el mínimo no dibuja nada", () => {
    const { container } = render(<SugerenciasBajoMinimo items={[]} ventanaDias={30} />);
    expect(container.innerHTML).toBe("");
  });
});
