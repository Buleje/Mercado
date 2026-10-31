import { describe, expect, it } from "vitest";
import { normalizarFijadas, TOPE_FIJADAS } from "@/components/admin/pos/use-acciones-fijadas";

describe("accesos fijos del POS (H06/M03)", () => {
  it("sólo acciones conocidas, sin repetir, hasta el tope", () => {
    expect(normalizarFijadas(["express", "inventada", "express", "foto"])).toEqual(["express", "foto"]);
    expect(normalizarFijadas(["express", "whatsapp", "historial", "devolucion", "trueque"])).toHaveLength(TOPE_FIJADAS);
  });

  it("lo guardado roto o tocado a mano no rompe el POS", () => {
    expect(normalizarFijadas(null)).toEqual([]);
    expect(normalizarFijadas("express")).toEqual([]);
    expect(normalizarFijadas([1, { id: "express" }])).toEqual([]);
  });
});
