import { describe, it, expect } from "vitest";
import { formatCategoryLabel } from "@/lib/format-category";

describe("formatCategoryLabel", () => {
  it("mapea rubros de negocio conocidos con acento correcto", () => {
    expect(formatCategoryLabel("polleria")).toBe("Pollería");
    expect(formatCategoryLabel("ferreteria")).toBe("Ferretería");
    expect(formatCategoryLabel("restaurante")).toBe("Restaurante");
  });

  it("mapea categorías de producto conocidas (slug con guiones)", () => {
    expect(formatCategoryLabel("pollo-brasa")).toBe("Pollo a la brasa");
    expect(formatCategoryLabel("bebidas")).toBe("Bebidas");
    expect(formatCategoryLabel("lacteos")).toBe("Lácteos");
    expect(formatCategoryLabel("frutas-verduras")).toBe("Frutas y verduras");
  });

  it("es case-insensitive y tolera espacios/underscores como separador", () => {
    expect(formatCategoryLabel("POLLO_BRASA")).toBe("Pollo a la brasa");
    expect(formatCategoryLabel("  Bebidas  ")).toBe("Bebidas");
  });

  it("fallback: humaniza slugs desconocidos (1ª mayúscula, conectores en minúscula)", () => {
    expect(formatCategoryLabel("productos-de-limpieza")).toBe("Productos de limpieza");
    expect(formatCategoryLabel("mi-rubro-xyz")).toBe("Mi rubro xyz");
  });

  it("preserva palabras con mayúsculas internas en el fallback", () => {
    expect(formatCategoryLabel("iPhone-accesorios")).toBe("iPhone accesorios");
  });

  it("devuelve string vacío para null/undefined/vacío", () => {
    expect(formatCategoryLabel(null)).toBe("");
    expect(formatCategoryLabel(undefined)).toBe("");
    expect(formatCategoryLabel("   ")).toBe("");
  });
});
