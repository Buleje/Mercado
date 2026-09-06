/**
 * El arqueo escribe lo que contó dentro de un string; acá se vuelve a leer.
 *
 * El Cuadre tenía una sección «Desglose de denominaciones» que no se mostró
 * nunca (`mapRegisterToAudit` arma el detalle con `denominations: []` fijo) y,
 * al mismo tiempo, la única copia real del conteo —billetes, monedas, Yape,
 * la foto del cajón— viajaba dentro del texto de las notas, sin leerse.
 *
 * Las cadenas de abajo son las que el propio sistema genera:
 * `CashRegisterTab.tsx:590` (Arqueo Guiado) y `CashAuditTab.tsx:195` (manual).
 */

import { describe, expect, it } from "vitest";
import { leerNotasArqueo } from "@/lib/caja/leer-notas-arqueo";

const GUIADO =
  "Arqueo Guiado - 12/08/2026 10:30 | Billetes: S/450.00 | Monedas: S/23.50 | " +
  "Total efectivo: S/473.50 | Yape: S/120.00 | Total general: S/593.50 | " +
  "Diferencia: +S/3.50 | Foto: https://cdn.buleje.pe/arqueo/abc.jpg";

const MANUAL = "Conteo manual: contado S/473.50, esperado S/470.00, diferencia S/3.50";

describe("leerNotasArqueo", () => {
  it("saca el conteo del Arqueo Guiado", () => {
    const a = leerNotasArqueo(GUIADO);
    expect(a.billetes).toBe(450);
    expect(a.monedas).toBe(23.5);
    expect(a.totalEfectivo).toBe(473.5);
    expect(a.totalGeneral).toBe(593.5);
    expect(a.diferencia).toBe(3.5);
    expect(a.hayDatos).toBe(true);
  });

  it("lista los medios digitales que se declararon", () => {
    expect(leerNotasArqueo(GUIADO).digitales).toEqual([{ medio: "Yape", monto: 120 }]);
    const conTres = GUIADO.replace("Yape: S/120.00", "Yape: S/120.00 | Plin: S/40.00 | Tarjeta: S/15.00");
    expect(leerNotasArqueo(conTres).digitales).toEqual([
      { medio: "Yape", monto: 120 },
      { medio: "Plin", monto: 40 },
      { medio: "Tarjeta", monto: 15 },
    ]);
  });

  it("del conteo manual saca lo contado aunque no tenga desglose", () => {
    const a = leerNotasArqueo(MANUAL);
    expect(a.totalEfectivo).toBe(473.5);
    expect(a.billetes).toBeNull();
    expect(a.digitales).toEqual([]);
  });

  it("la foto sólo cuenta si es una URL de verdad", () => {
    expect(leerNotasArqueo(GUIADO).fotoUrl).toBe("https://cdn.buleje.pe/arqueo/abc.jpg");
    // Cuando la subida falla, el arqueo escribe «Foto: adjunta» — no es un link.
    expect(leerNotasArqueo("Arqueo Guiado | Billetes: S/10.00 | Foto: adjunta").fotoUrl).toBeNull();
  });

  it("lee montos con separador de miles", () => {
    expect(leerNotasArqueo("Billetes: S/1,250.00").billetes).toBe(1250);
  });

  it("una nota escrita a mano no inventa datos", () => {
    const a = leerNotasArqueo("Turno de la tarde, faltó cambio de S/10");
    expect(a.hayDatos).toBe(false);
    expect(a.billetes).toBeNull();
  });

  it("sin notas no rompe", () => {
    expect(leerNotasArqueo(null).hayDatos).toBe(false);
    expect(leerNotasArqueo(undefined).hayDatos).toBe(false);
    expect(leerNotasArqueo("").hayDatos).toBe(false);
  });
});
