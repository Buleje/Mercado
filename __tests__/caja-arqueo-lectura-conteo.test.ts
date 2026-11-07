/**
 * lecturaDelConteo — «sin dato» nunca se vuelve «S/ 0» (auditoría 15-10, H05/M25).
 *
 * El caso real: la caja de Blas abierta el 10/06 con esperado −S/ 6.424 salía en
 * Historial › Por caja con «Contado S/ 0» y «Diferencia S/ 0», como si alguien
 * la hubiera contado y cuadrado. Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { lecturaDelConteo, mapRegisterToAudit, textoWhatsApp, type CashRegisterRaw } from "@/components/admin/arqueo/arqueo-shared";

const base: CashRegisterRaw = { id: "c1", openedAt: "2026-06-11T02:41:20.000Z", openingAmount: 100, status: "abierta" };

describe("lecturaDelConteo", () => {
  it("caja abierta con esperado negativo: sin contar, ni contado ni diferencia", () => {
    const a = mapRegisterToAudit({ ...base, efectivoEsperado: -6424 });
    expect(a.status).toBe("imposible");
    const l = lecturaDelConteo(a);
    expect(l).toMatchObject({ contado: null, diferencia: null, etiqueta: "sin contar" });
  });

  it("caja abierta normal: sin contar", () => {
    const l = lecturaDelConteo(mapRegisterToAudit({ ...base, efectivoEsperado: 250 }));
    expect(l).toMatchObject({ contado: null, diferencia: null, etiqueta: "sin contar" });
  });

  it("cerrada por el sistema: sin conteo, aunque la base guarde 0", () => {
    const a = mapRegisterToAudit({
      ...base, status: "cerrada", closedAt: "2026-06-12T05:00:00.000Z",
      expectedAmount: 300, closingAmount: 300, difference: 0, notes: "Cierre automático por el sistema",
    });
    expect(a.status).toBe("sin_conteo");
    expect(lecturaDelConteo(a)).toMatchObject({ contado: null, diferencia: null, etiqueta: "sin conteo" });
  });

  it("cerrada con conteo y esperado negativo: el contado sí, la diferencia no se evalúa", () => {
    const a = mapRegisterToAudit({
      ...base, status: "cerrada", closedAt: "2026-06-12T05:00:00.000Z",
      expectedAmount: -630, closingAmount: 120, difference: 750,
    });
    expect(a.status).toBe("imposible");
    expect(lecturaDelConteo(a)).toMatchObject({ contado: 120, diferencia: null, etiqueta: "no evaluable" });
  });

  it("cerrada y contada: diferencia cero es un cuadre de verdad", () => {
    const a = mapRegisterToAudit({
      ...base, status: "cerrada", closedAt: "2026-06-12T05:00:00.000Z",
      expectedAmount: 300, closingAmount: 300, difference: 0,
    });
    expect(lecturaDelConteo(a)).toEqual({ contado: 300, diferencia: 0, etiqueta: null, porque: null });
  });

  it("el WhatsApp de una caja abierta no inventa contado ni diferencia", () => {
    const txt = textoWhatsApp(mapRegisterToAudit({ ...base, efectivoEsperado: -6424 }));
    expect(txt).not.toMatch(/Contado: S\/\s?0/);
    expect(txt).toMatch(/sin contar/);
  });
});
