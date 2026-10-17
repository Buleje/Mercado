/**
 * Parte de caja: «hoy» separado de la sesión (auditoría 15-10, H01/M23).
 *
 * Caso real: la caja de Blas se abrió el miércoles 10/06 y seguía abierta en
 * octubre; «Caja de hoy» mostraba el acumulado de 127 días. El esperado sigue
 * siendo el de TODA la sesión (lo que debe haber en el cajón); «hoy» sólo
 * recorta lo que se movió el día de Lima en curso.
 */
import { describe, expect, it } from "vitest";
import { armarParteDelDia, type CajaParaParte } from "@/lib/caja/parte-del-dia";

const AHORA = new Date("2026-10-17T15:00:00.000Z"); // sábado 17/10, 10:00 en Lima

const caja = (over: Partial<CajaParaParte> = {}): CajaParaParte => ({
  id: "c1",
  status: "abierta",
  openedAt: "2026-06-11T02:41:20.000Z", // miércoles 10/06 21:41 en Lima
  openingAmount: 100,
  movements: [
    { type: "apertura", amount: 100, method: "efectivo", createdAt: "2026-06-11T02:41:20.000Z" },
    { type: "venta", amount: 35, method: "efectivo", saleId: "s1", createdAt: "2026-06-11T03:00:00.000Z" },
    { type: "egreso", amount: 1000, method: "efectivo", description: "Adelanto ADL-1", createdAt: "2026-09-01T15:00:00.000Z" },
    // Hoy en Lima (17/10 00:30 = 05:30 UTC)
    { type: "venta", amount: 50, method: "efectivo", saleId: "s2", createdAt: "2026-10-17T05:30:00.000Z" },
    { type: "venta", amount: 40, method: "yape", saleId: "s3", createdAt: "2026-10-17T14:00:00.000Z" },
    { type: "ingreso", amount: 20, method: "efectivo", description: "Cambio", createdAt: "2026-10-17T14:10:00.000Z" },
    { type: "egreso", amount: 15, method: "efectivo", description: "Compra de insumos — bolsas", createdAt: "2026-10-17T14:20:00.000Z" },
    { type: "arqueo", amount: 140, method: "efectivo", createdAt: "2026-10-17T14:30:00.000Z" },
    // 16/10 23:30 en Lima = 17/10 04:30 UTC: es de AYER aunque en UTC sea hoy
    { type: "venta", amount: 999, method: "efectivo", saleId: "s4", createdAt: "2026-10-17T04:30:00.000Z" },
  ],
  ...over,
});

describe("armarParteDelDia › hoy", () => {
  it("caja abierta desde otro día: suma sólo el efectivo movido hoy en Lima", () => {
    const p = armarParteDelDia(caja(), [], { ahora: AHORA });
    expect(p.hoy).toEqual({ dia: "2026-10-17", movimientos: 4, ventasEfectivo: 50, ingresos: 20, egresos: 15, neto: 55 });
  });

  it("el esperado sigue siendo el de toda la sesión", () => {
    const p = armarParteDelDia(caja(), [], { ahora: AHORA });
    // 100 + (35 + 50 + 999) + 20 − (1000 + 15)
    expect(p.esperado).toBe(189);
  });

  it("caja abierta hoy: sesión y día son lo mismo, no hay bloque «hoy»", () => {
    const p = armarParteDelDia(caja({ openedAt: "2026-10-17T13:00:00.000Z" }), [], { ahora: AHORA });
    expect(p.hoy).toBeNull();
  });

  it("caja cerrada: no hay «hoy»", () => {
    const p = armarParteDelDia(caja({ status: "cerrada", closedAt: "2026-10-17T14:40:00.000Z" }), [], { ahora: AHORA });
    expect(p.hoy).toBeNull();
  });

  it("movimiento sin fecha no se cuenta como de hoy", () => {
    const p = armarParteDelDia(caja({ movements: [{ type: "venta", amount: 10, method: "efectivo" }] }), [], { ahora: AHORA });
    expect(p.hoy).toMatchObject({ movimientos: 0, neto: 0 });
  });
});
