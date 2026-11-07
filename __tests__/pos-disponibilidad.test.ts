import { describe, expect, it } from "vitest";
import { disponibilidadPOS } from "@/components/admin/pos/disponibilidad";

describe("POS · disponibilidad por tipo (M10)", () => {
  it("un servicio con stock 0 no se lee como agotado ni muestra «0»", () => {
    const d = disponibilidadPOS({ type: "service", stock: 0, unit: "servicio", pricingUnit: "fijo" });
    expect(d.nivel).toBe("sin-control");
    expect(d.texto).toBe("Sin control de stock");
    expect(d.distintivo).toBe("Servicio");
    expect(d.sufijoPrecio).toBeNull();
  });

  it("un servicio con duración la muestra en lugar del stock", () => {
    expect(disponibilidadPOS({ type: "service", stock: null, durationLabel: "45 min", pricingUnit: "fijo" }).texto).toBe("45 min");
  });

  it("cobro por hora o por día = alquiler, con el sufijo en el precio", () => {
    const d = disponibilidadPOS({ type: "service", pricingUnit: "hora", durationLabel: "8:00 a 18:00" });
    expect(d.tipo).toBe("alquiler");
    expect(d.distintivo).toBe("Alquiler");
    expect(d.texto).toBe("Por hora · 8:00 a 18:00");
    expect(d.sufijoPrecio).toBe("/ hora");
    expect(disponibilidadPOS({ type: "service", pricingUnit: "dia" }).sufijoPrecio).toBe("/ día");
  });

  it("un servicio que se cobra por m³ lleva la unidad en el precio", () => {
    expect(disponibilidadPOS({ type: "service", pricingUnit: "m3" }).sufijoPrecio).toBe("/ m³");
  });

  it("producto: stock con su unidad, bajo y agotado como siempre", () => {
    expect(disponibilidadPOS({ type: "product", stock: 35, unit: "kg" })).toMatchObject({ texto: "35 kg", nivel: "ok", sufijoPrecio: "/ kg" });
    expect(disponibilidadPOS({ type: "product", stock: 3, unit: "und" })).toMatchObject({ texto: "3", nivel: "bajo", sufijoPrecio: null });
    expect(disponibilidadPOS({ type: "product", stock: 8, stockMin: 10, unit: "botella" }).nivel).toBe("bajo");
    // Mínimo propio 0 = «avisar sólo cuando se agote» (regla única de stock-minimo); el global vale para los que no tienen.
    expect(disponibilidadPOS({ type: "product", stock: 2, stockMin: 0 }).nivel).toBe("ok");
    expect(disponibilidadPOS({ type: "product", stock: 8 }, 10).nivel).toBe("bajo");
    expect(disponibilidadPOS({ type: "product", stock: 0, unit: "kg" })).toMatchObject({ texto: "Agotado", nivel: "agotado" });
    expect(disponibilidadPOS({ type: "product", stock: 4, unit: "m3" }).texto).toBe("4 m³");
  });

  it("producto sin control de stock no inventa una cifra", () => {
    expect(disponibilidadPOS({ stock: null, unit: "unidad" })).toMatchObject({ texto: null, nivel: "ok", sufijoPrecio: null });
  });
});
