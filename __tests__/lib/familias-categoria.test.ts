import { describe, it, expect } from "vitest";
import { familiaDe, claveCategoria } from "@/lib/marketplace/familias-categoria";

describe("familias-categoria", () => {
  it("clasifica por categoría", () => {
    expect(familiaDe("pollo-brasa")).toBe("comida");
    expect(familiaDe("Lácteos")).toBe("frescos");
    expect(familiaDe("bebidas")).toBe("bebidas");
    expect(familiaDe("restaurante")).toBe("comida");
    expect(familiaDe("madera-aserrada")).toBe("hogar");
    expect(familiaDe("xyz")).toBe("mas");
  });
  it("cae al nombre cuando la categoría no dice nada", () => {
    expect(familiaDe(null, "Refresco de maracuyá")).toBe("bebidas");
  });
  it("une duplicados de mayúsculas", () => {
    expect(claveCategoria("Bebidas")).toBe(claveCategoria("bebidas"));
  });
});
