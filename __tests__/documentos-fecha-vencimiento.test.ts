import { describe, it, expect } from "vitest";
import { fechaDeVencimientoEnTexto } from "@/lib/documentos/fecha-vencimiento";

const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

describe("fechaDeVencimientoEnTexto", () => {
  it("lee la licencia tal como la transcribe el OCR", () => {
    const texto = "MUNICIPALIDAD DE PUCALLPA LICENCIA DE FUNCIONAMIENTO RUC: 20609876543 Emitida: 15/01/2026 Valida Hasta: 15/01/2027";
    expect(dia(fechaDeVencimientoEnTexto(texto))).toBe("2027-01-15");
  });

  it("NO confunde la fecha de emisión con la de vencimiento", () => {
    expect(fechaDeVencimientoEnTexto("Emitida: 15/01/2026")).toBeNull();
    expect(fechaDeVencimientoEnTexto("Fecha de emision 12/03/2026, total S/ 100")).toBeNull();
  });

  it("acepta las formas que se usan en un papel peruano", () => {
    expect(dia(fechaDeVencimientoEnTexto("VENCE EL 03-08-2026"))).toBe("2026-08-03");
    expect(dia(fechaDeVencimientoEnTexto("Vigente hasta 1 de setiembre de 2027"))).toBe("2027-09-01");
    expect(dia(fechaDeVencimientoEnTexto("caducidad: 2026-12-31"))).toBe("2026-12-31");
    expect(dia(fechaDeVencimientoEnTexto("válida hasta 09/07/27"))).toBe("2027-07-09");
  });

  it("día y mes al modo peruano: 03/08 es 3 de agosto", () => {
    expect(dia(fechaDeVencimientoEnTexto("vence 03/08/2026"))).toBe("2026-08-03");
  });

  it("descarta fechas imposibles en vez de inventar una", () => {
    expect(fechaDeVencimientoEnTexto("vence el 31/02/2027")).toBeNull();
    expect(fechaDeVencimientoEnTexto("vence el 45/13/2027")).toBeNull();
  });

  it("sin texto o sin anuncio de vencimiento, null", () => {
    expect(fechaDeVencimientoEnTexto(null)).toBeNull();
    expect(fechaDeVencimientoEnTexto("factura por S/ 100 del 12/03/2026")).toBeNull();
  });
});
