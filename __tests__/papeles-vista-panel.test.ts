import { describe, expect, it } from "vitest";
import {
  agruparPapeles,
  contarPorEstado,
  enlaceVerificacion,
  filtrarPapeles,
  rotuloTipoPapel,
  totalDelPapel,
  type PapelDelPanel,
} from "@/lib/papeles/vista-panel";

function papel(over: Partial<PapelDelPanel>): PapelDelPanel {
  return {
    id: over.id ?? "p1",
    numero: "EC-0001",
    tipo: "estado-cuenta",
    titulo: "Estado de cuenta",
    fecha: "2026-11-04",
    estado: "oficial",
    codigo: "BLAS-EC-0001-AAAA",
    total: "3568.00",
    moneda: "PEN",
    hojas: 1,
    documentId: null,
    reemplazadoPor: null,
    createdAt: "2026-11-04T20:00:00.000Z",
    updatedAt: "2026-11-04T20:00:00.000Z",
    ...over,
  };
}

describe("papeles emitidos en el panel (ADR-534)", () => {
  it("la versión más nueva de un número es la vigente, aunque esté anulada", () => {
    const grupos = agruparPapeles([
      papel({ id: "a", codigo: "BLAS-PRO-0002-1111", numero: "PRO-0002", tipo: "proforma", estado: "reemplazado", createdAt: "2026-11-01T10:00:00.000Z" }),
      papel({ id: "b", codigo: "BLAS-PRO-0002-2222", numero: "PRO-0002", tipo: "proforma", estado: "anulado", createdAt: "2026-11-03T10:00:00.000Z" }),
      papel({ id: "c", codigo: "BLAS-PRO-0002-3333", numero: "PRO-0002", tipo: "proforma", estado: "reemplazado", createdAt: "2026-11-02T10:00:00.000Z" }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.vigente.id).toBe("b");
    expect(grupos[0]?.anteriores.map((p) => p.id)).toEqual(["c", "a"]);
  });

  it("los grupos salen del que se movió último al más viejo", () => {
    const grupos = agruparPapeles([
      papel({ id: "ec", numero: "EC-0001", createdAt: "2026-11-04T10:00:00.000Z" }),
      papel({ id: "res", numero: "RES-0001", tipo: "resumen", estado: "revision", codigo: "BLAS-RES-0001-BBBB", createdAt: "2026-11-04T12:00:00.000Z" }),
    ]);
    expect(grupos.map((g) => g.numero)).toEqual(["RES-0001", "EC-0001"]);
  });

  it("cuenta por el estado de la vigente, no por cada versión", () => {
    const grupos = agruparPapeles([
      papel({ id: "1", numero: "EC-0001", estado: "reemplazado", createdAt: "2026-11-01T00:00:00.000Z" }),
      papel({ id: "2", numero: "EC-0001", estado: "oficial", codigo: "BLAS-EC-0001-CCCC", createdAt: "2026-11-02T00:00:00.000Z" }),
      papel({ id: "3", numero: "RES-0001", estado: "revision", codigo: "BLAS-RES-0001-DDDD" }),
    ]);
    expect(contarPorEstado(grupos)).toEqual({ todos: 2, oficial: 1, revision: 1, borrador: 0, anulado: 0 });
  });

  it("filtra por estado y por texto sin tildes (número, código de una versión vieja o tipo)", () => {
    const grupos = agruparPapeles([
      papel({ id: "1", numero: "LIQ-0001", tipo: "liquidacion", codigo: "BLAS-LIQ-0001-0A0A", estado: "revision" }),
      papel({ id: "2", numero: "EC-0001", codigo: "BLAS-EC-0001-1B1B", estado: "reemplazado", createdAt: "2026-11-01T00:00:00.000Z" }),
      papel({ id: "3", numero: "EC-0001", codigo: "BLAS-EC-0001-2C2C", estado: "oficial", createdAt: "2026-11-02T00:00:00.000Z" }),
    ]);
    expect(filtrarPapeles(grupos, "revision", "").map((g) => g.numero)).toEqual(["LIQ-0001"]);
    expect(filtrarPapeles(grupos, "todos", "liquidacion").map((g) => g.numero)).toEqual(["LIQ-0001"]);
    expect(filtrarPapeles(grupos, "todos", "1b1b").map((g) => g.numero)).toEqual(["EC-0001"]);
    expect(filtrarPapeles(grupos, "oficial", "liq")).toEqual([]);
  });

  it("el total se escribe como en la hoja y un tipo desconocido usa su título", () => {
    expect(totalDelPapel({ total: "3568", moneda: "PEN" })).toBe("S/ 3,568.00");
    expect(totalDelPapel({ total: "120.5", moneda: "USD" })).toBe("US$ 120.50");
    expect(totalDelPapel({ total: null, moneda: "PEN" })).toBeNull();
    expect(rotuloTipoPapel({ tipo: "nota-venta", titulo: "x" })).toBe("Nota de venta");
    expect(rotuloTipoPapel({ tipo: "guia-nueva", titulo: "Guía interna" })).toBe("Guía interna");
  });

  it("el enlace del QR usa la base corta del negocio (host o código del negocio)", () => {
    expect(enlaceVerificacion("https://blas.buleje.pe/v", "BLAS-EC-0001-2266")).toBe("https://blas.buleje.pe/v/p/BLAS-EC-0001-2266");
    expect(enlaceVerificacion("https://x.vercel.app/v/a1b2c/", "BLAS-PRO-0002-7F3A")).toBe("https://x.vercel.app/v/a1b2c/p/BLAS-PRO-0002-7F3A");
  });
});
