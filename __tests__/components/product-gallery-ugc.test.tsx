import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProductGalleryDS } from "@/components/marketplace/product-detail/ProductGalleryDS";

describe("ProductGalleryDS — UGC (fotos de clientes)", () => {
  it("muestra el sello 'Foto de cliente' cuando la imagen activa es UGC", () => {
    const { container } = render(
      <ProductGalleryDS
        images={[{ url: "https://x/cliente.jpg", alt: "Foto de cliente", ugc: true }]}
        productName="Pollo a la brasa"
        category="pollo"
      />,
    );
    expect(container.textContent ?? "").toContain("Foto de cliente");
  });

  it("NO muestra el sello cuando la imagen activa es del catálogo", () => {
    const { container } = render(
      <ProductGalleryDS
        images={[{ url: "https://x/catalogo.jpg", alt: "catalogo" }]}
        productName="Pollo a la brasa"
        category="pollo"
      />,
    );
    expect(container.textContent ?? "").not.toContain("Foto de cliente");
  });
});
