import { describe, expect, it } from "vitest";
import {
  controlDeLinea, esPerecible, faltaConformidad, fechasDeRecepcion, notasConConformidad, pereciblesSinVence,
} from "@/lib/compras/conformidad-recepcion";

describe("C22 · control pertinente por línea", () => {
  it("servicio pide alcance; perecible por categoría; el resto nada", () => {
    expect(controlDeLinea({ type: "service", category: "Servicios de salón" })).toBe("servicio");
    expect(controlDeLinea({ type: "product", category: "Lácteos" })).toBe("perecible");
    expect(controlDeLinea({ type: "product", category: "Frutas y Verduras" })).toBe("perecible");
    expect(controlDeLinea({ type: "product", category: "Abarrotes" })).toBeNull();
    expect(controlDeLinea(undefined)).toBeNull();
    // Un servicio nunca es perecible aunque su categoría lo parezca.
    expect(esPerecible({ type: "service", category: "Panadería" })).toBe(false);
  });

  it("servicio OK sin alcance o sin quién acepta frena; dañado o en 0 no", () => {
    const fila = { product: "Aserrado", receivedQty: 1, condition: "ok" };
    expect(faltaConformidad([fila], ["servicio"])).toMatch(/alcance aceptado y quién acepta «Aserrado»/);
    expect(faltaConformidad([{ ...fila, alcance: "12 m³" }], ["servicio"])).not.toBeNull();
    expect(faltaConformidad([{ ...fila, alcance: "12 m³", aceptaServicio: "Blas" }], ["servicio"])).toBeNull();
    expect(faltaConformidad([{ ...fila, condition: "dañado" }], ["servicio"])).toBeNull();
    expect(faltaConformidad([{ ...fila, receivedQty: 0 }], ["servicio"])).toBeNull();
  });

  it("las notas llevan alcance y quién acepta, con tope 500", () => {
    expect(notasConConformidad("llegó tarde", { alcance: "corte 12 m³", aceptaServicio: "Blas" }))
      .toBe("llegó tarde · Alcance aceptado: corte 12 m³ · Acepta: Blas");
    expect(notasConConformidad("", { alcance: "x".repeat(600) })).toHaveLength(500);
  });

  it("perecibles OK que entran sin vence", () => {
    const l = [
      { product: "Leche", receivedQty: 6, condition: "ok" },
      { product: "Yogur", receivedQty: 6, condition: "ok", expiryDate: "2026-11-01" },
      { product: "Queso", receivedQty: 2, condition: "vencido" },
    ];
    expect(pereciblesSinVence(l, ["perecible", "perecible", "perecible"])).toEqual(["Leche"]);
  });
});

describe("C22 · tres fechas de la recepción", () => {
  it("aceptada y parcial se aceptan al llegar; programada no", () => {
    const base = { scheduledDate: "2026-10-14", receivedDate: "2026-10-17T15:00:00.000Z" };
    expect(fechasDeRecepcion({ ...base, status: "aceptada" })).toEqual({
      programada: "2026-10-14", llego: base.receivedDate, aceptada: base.receivedDate, estadoAceptacion: "aceptada",
    });
    expect(fechasDeRecepcion({ ...base, status: "parcial" }).aceptada).toBe(base.receivedDate);
    expect(fechasDeRecepcion({ scheduledDate: "2026-10-20", status: "programada" })).toMatchObject({ llego: null, aceptada: null, estadoAceptacion: "pendiente" });
    expect(fechasDeRecepcion({ ...base, status: "rechazada" }).aceptada).toBeNull();
  });
});
