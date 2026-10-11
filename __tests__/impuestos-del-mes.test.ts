import { describe, expect, it } from "vitest";
import { calcularImpuestosDelMes, mesDeVencimiento, nombreDelMes, textoTasa } from "@/components/admin/impuestos/impuestos-del-mes";

const SIN_REGISTRO = { mes: "2026-05", ventas: { igv: 0, comprobantes: 0 }, compras: { igv: 0, conIgv: 0, gastos: 3, exoneradas: 0 } };

describe("calcularImpuestosDelMes", () => {
  it("main mayo 2026: sin comprobantes no inventa IGV y la Renta usa TODOS los ingresos (POS + pedidos)", () => {
    // 7 ventas del POS 174,30 + pedidos concretados 54,90 = 229,20.
    const r = calcularImpuestosDelMes({ regimen: "rmt", igv: SIN_REGISTRO, ingresosMes: 229.2, ingresosAcumAnio: 312.5 });
    expect(r.lecturaIgv?.tipo).toBe("sin_registro");
    expect(r.igvAPagar).toBe(0);
    expect(r.baseRenta).toBe(229.2);
    expect(r.tasaRenta).toBe(0.01);
    expect(r.renta).toBe(2.29);
    expect(r.total).toBe(2.29);
  });

  it("con comprobantes: IGV = débito − crédito y la base de Renta descuenta el IGV de las ventas", () => {
    const r = calcularImpuestosDelMes({
      regimen: "rmt",
      igv: { mes: "2026-10", ventas: { igv: 18, comprobantes: 4 }, compras: { igv: 5, conIgv: 2, gastos: 6, exoneradas: 0 } },
      ingresosMes: 118,
      ingresosAcumAnio: 118,
    });
    expect(r.igvAPagar).toBe(13);
    expect(r.saldoAFavor).toBe(0);
    expect(r.baseRenta).toBe(100);
    expect(r.renta).toBe(1);
    expect(r.total).toBe(14);
  });

  it("más IGV en compras que en ventas = saldo a favor, no un pago negativo", () => {
    const r = calcularImpuestosDelMes({
      regimen: "rer",
      igv: { mes: "2026-10", ventas: { igv: 3, comprobantes: 1 }, compras: { igv: 10, conIgv: 1, gastos: 1, exoneradas: 0 } },
      ingresosMes: 0,
      ingresosAcumAnio: 0,
    });
    expect(r.igvAPagar).toBe(0);
    expect(r.saldoAFavor).toBe(7);
    expect(r.total).toBe(0);
  });

  it("NRUS: cuota fija, sin porcentaje de Renta; IGV no leído = null (no es «sin IGV»)", () => {
    const r = calcularImpuestosDelMes({ regimen: "nrus", igv: null, ingresosMes: 5000, ingresosAcumAnio: 5000 });
    expect(r.lecturaIgv).toBeNull();
    expect(r.esNrus).toBe(true);
    expect(r.renta).toBe(0);
  });

  it("RMT pasa a 1,5 % sobre 300 UIT acumuladas", () => {
    const r = calcularImpuestosDelMes({ regimen: "rmt", igv: SIN_REGISTRO, ingresosMes: 1000, ingresosAcumAnio: 300 * 5350 + 1 });
    expect(r.tasaRenta).toBe(0.015);
    expect(textoTasa(r.tasaRenta)).toBe("1.5 %");
  });
});

describe("textos del mes", () => {
  it("nombre y mes de vencimiento (diciembre vence en enero)", () => {
    expect(nombreDelMes("2026-10")).toBe("octubre 2026");
    expect(mesDeVencimiento("2026-10")).toBe("noviembre");
    expect(mesDeVencimiento("2026-12")).toBe("enero");
    expect(textoTasa(0.01)).toBe("1 %");
  });
});
