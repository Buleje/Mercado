import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProductInfo } from "@/components/marketplace/product-detail/ProductInfo";

const base = {
  name: "1/2 Pollo a la Brasa",
  storeName: "El Dorado",
  storeSlug: "el-dorado",
  storeZone: "Centro",
  unit: "plato",
  stock: 10,
};

describe("ProductInfo — mejoras PDP", () => {
  it("muestra 'Ahorras S/X (Y%)' cuando hay descuento", () => {
    const { container } = render(<ProductInfo {...base} price={40} previousPrice={50} />);
    const txt = container.textContent ?? "";
    expect(txt).toContain("Ahorras");
    expect(txt).toContain("10.00"); // 50 - 40
    expect(txt).toContain("20%"); // (50-40)/50
  });

  it("SIN descuento no muestra 'Ahorras'", () => {
    const { container } = render(<ProductInfo {...base} price={40} previousPrice={null} />);
    expect(container.textContent ?? "").not.toContain("Ahorras");
  });

  it("destaca el pago con Yape", () => {
    const { container } = render(<ProductInfo {...base} price={40} />);
    expect(container.textContent ?? "").toMatch(/Paga con\s*Yape/);
  });

  it("entrega honesta por zona, sin el '~25 min' inventado", () => {
    const { container } = render(<ProductInfo {...base} price={40} />);
    const txt = container.textContent ?? "";
    expect(txt).toContain("Entrega a domicilio");
    expect(txt).toContain("Centro"); // zona real
    expect(txt).toContain("Pago contra entrega");
    expect(txt).not.toContain("25 min");
  });
});
