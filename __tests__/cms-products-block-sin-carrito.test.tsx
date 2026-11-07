import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("@/hooks/use-store-products", () => ({
  useStoreProducts: () => ({
    products: [{ id: 1, name: "Arroz extra", category: "Abarrotes", price: 4.5, image: "", unit: "kg" }],
    categories: [],
    isLoading: false,
  }),
}));

import ProductsBlock from "@/components/blocks/ProductsBlock";

// El editor del CMS y la página /cms/<slug> no montan el CartProvider de la tienda.
describe("ProductsBlock fuera de la tienda (sin CartProvider)", () => {
  it("se dibuja con sus valores por defecto en vez de tumbar la página", () => {
    const html = renderToStaticMarkup(<ProductsBlock />);
    expect(html).toContain("Nuestros Productos");
  });

  it("muestra los productos reales del negocio, no la lista vacía de data/products", () => {
    expect(renderToStaticMarkup(<ProductsBlock />)).toContain("Arroz extra");
  });

  it("no ofrece «Agregar al carrito» si no hay carrito", () => {
    const html = renderToStaticMarkup(<ProductsBlock showAddToCart />);
    expect(html).not.toContain("al carrito");
  });
});
