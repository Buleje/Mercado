import { describe, expect, it } from "vitest";
import { errorDeAceptacion, partirLinea, tieneApartado } from "@/lib/compras/aceptacion-recepcion";

describe("C20 · aceptación y cuarentena por línea", () => {
  it("parte lo que llegó en disponible, en revisión y rechazado", () => {
    expect(partirLinea({ receivedQty: 10, condition: "ok", enRevision: 2, rechazado: 1 })).toEqual({ disponible: 7, enRevision: 2, rechazado: 1 });
    expect(partirLinea({ receivedQty: 10, condition: "ok" })).toEqual({ disponible: 10, enRevision: 0, rechazado: 0 });
  });

  it("un producto dañado no suma disponible", () => {
    expect(partirLinea({ receivedQty: 5, condition: "dañado", enRevision: 1 })).toEqual({ disponible: 0, enRevision: 0, rechazado: 0 });
    // «Faltante» con algo que llegó: lo que llegó entra entero, como antes de C20.
    expect(partirLinea({ receivedQty: 4, condition: "faltante", rechazado: 1 })).toEqual({ disponible: 4, enRevision: 0, rechazado: 0 });
  });

  it("nunca da disponible negativo y avisa si las cantidades no cierran", () => {
    expect(partirLinea({ receivedQty: 3, condition: "ok", enRevision: 5, rechazado: 2 })).toEqual({ disponible: 0, enRevision: 1, rechazado: 2 });
    expect(errorDeAceptacion({ product: "Leche", receivedQty: 3, condition: "ok", enRevision: 5 })).toMatch(/Leche/);
    expect(errorDeAceptacion({ receivedQty: 3, condition: "ok", enRevision: 1, rechazado: 2 })).toBeNull();
  });

  it("lo apartado cuenta como no conforme", () => {
    expect(tieneApartado({ receivedQty: 3, condition: "ok", enRevision: 1 })).toBe(true);
    expect(tieneApartado({ receivedQty: 3, condition: "ok" })).toBe(false);
  });
});
