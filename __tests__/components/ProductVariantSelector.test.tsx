/**
 * Tests de componente — ProductVariantSelector
 *
 * Implementación real:
 *   - export default ProductVariantSelector
 *   - onSelect(variantId: string, finalPrice: number) — NO objeto
 *   - render mode: "color" (si attrs.color), "size" (si attrs.size), "pill" (default)
 *   - variante agotada (stock <= 0): disabled + texto "Agotado" en pill mode
 *   - en color mode: isOutOfStock tiene title con "Agotado"
 *   - selectedVariantId: border-[#2563EB] en el botón activo
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductVariantSelector from "@/components/marketplace/ProductVariantSelector";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VARIANT_PILL_A = {
  id: "var-1", name: "Pequeño", priceModifier: 0, stock: 10, attributesJson: null,
};
const VARIANT_PILL_B = {
  id: "var-2", name: "Mediano", priceModifier: 5, stock: 3, attributesJson: null,
};
const VARIANT_PILL_AGOTADO = {
  id: "var-3", name: "Grande", priceModifier: 2, stock: 0, attributesJson: null,
};

const VARIANT_COLOR_ROJO = {
  id: "var-c1", name: "Rojo", priceModifier: 0, stock: 10,
  attributesJson: JSON.stringify({ color: "red" }),
};
const VARIANT_COLOR_AGOTADO = {
  id: "var-c2", name: "Azul", priceModifier: 0, stock: 0,
  attributesJson: JSON.stringify({ color: "blue" }),
};

const BASE_PRICE = 50;

describe("ProductVariantSelector", () => {
  beforeEach(() => vi.clearAllMocks());

  it("variants vacío → return null (container vacío)", () => {
    const { container } = render(
      <ProductVariantSelector variants={[]} basePrice={BASE_PRICE} onSelect={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("render con 3 variants en pill mode → 3 botones con nombres", () => {
    render(
      <ProductVariantSelector
        variants={[VARIANT_PILL_A, VARIANT_PILL_B, VARIANT_PILL_AGOTADO]}
        basePrice={BASE_PRICE}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Pequeño")).toBeInTheDocument();
    expect(screen.getByText("Mediano")).toBeInTheDocument();
    expect(screen.getByText("Grande")).toBeInTheDocument();
  });

  it("click en variante → onSelect llamado con (variantId, finalPrice)", () => {
    const onSelect = vi.fn();
    render(
      <ProductVariantSelector
        variants={[VARIANT_PILL_A, VARIANT_PILL_B]}
        basePrice={BASE_PRICE}
        onSelect={onSelect}
      />
    );
    // Click en "Mediano" (priceModifier=5 → finalPrice=55)
    fireEvent.click(screen.getByText("Mediano"));
    expect(onSelect).toHaveBeenCalledWith("var-2", 55);
  });

  it("variante con stock=0 en pill mode → muestra texto 'Agotado' y el botón está disabled", () => {
    const onSelect = vi.fn();
    render(
      <ProductVariantSelector
        variants={[VARIANT_PILL_A, VARIANT_PILL_AGOTADO]}
        basePrice={BASE_PRICE}
        onSelect={onSelect}
      />
    );
    expect(screen.getByText("Agotado")).toBeInTheDocument();
    // El botón con aria-label que incluye "Agotado" debe estar disabled
    const agotadoBtn = screen.getByRole("button", { name: /Grande.*Agotado|Agotado.*Grande/i });
    expect(agotadoBtn).toBeDisabled();
    fireEvent.click(agotadoBtn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("variante color mode → renderiza button con style attribute que incluye el color", () => {
    render(
      <ProductVariantSelector
        variants={[VARIANT_COLOR_ROJO]}
        basePrice={BASE_PRICE}
        onSelect={vi.fn()}
      />
    );
    const btn = screen.getByRole("button", { name: "Rojo" });
    // jsdom no parsea shorthand CSS igual que los browsers;
    // verificamos el atributo style directamente del DOM
    const styleAttr = btn.getAttribute("style") ?? "";
    expect(styleAttr).toContain("red");
  });

  it("variante color agotada → button disabled con title que incluye 'Agotado'", () => {
    render(
      <ProductVariantSelector
        variants={[VARIANT_COLOR_ROJO, VARIANT_COLOR_AGOTADO]}
        basePrice={BASE_PRICE}
        onSelect={vi.fn()}
      />
    );
    const agotadoBtn = screen.getByTitle(/Azul.*Agotado|Agotado/i);
    expect(agotadoBtn).toBeDisabled();
  });

  it("selectedVariantId destacado → className contiene la clase de selección", () => {
    render(
      <ProductVariantSelector
        variants={[VARIANT_PILL_A, VARIANT_PILL_B]}
        basePrice={BASE_PRICE}
        onSelect={vi.fn()}
        selectedVariantId="var-1"
      />
    );
    const selectedBtn = screen.getByRole("button", { name: /Pequeño/ });
    // La clase de selección usa token Tailwind "border-primary"
    expect(selectedBtn.className).toContain("border-primary");
  });
});
