import { describe, expect, it } from "vitest";
import { pistasDelDescuadre } from "@/lib/caja/pistas-del-descuadre";
import type { MovimientoParaRevisar } from "@/lib/caja/cobros-para-revisar";

const fmt = (n: number) => `S/ ${n.toFixed(2)}`;
const mov = (id: string, over: Partial<MovimientoParaRevisar>): MovimientoParaRevisar => ({
  id,
  type: "venta",
  amount: 12.5,
  method: "efectivo",
  description: "",
  createdAt: "2026-10-17T15:15:00.000Z",
  ...over,
});
const CONTADO = "2026-10-17T20:00:00.000Z";

describe("pistas del descuadre (M60)", () => {
  it("faltante: la venta en efectivo o el ingreso del mismo monto, con la hora de Lima y cómo buscarlo; lo anotado después del conteo no cuenta", () => {
    const r = pistasDelDescuadre(
      {
        diferencia: -12.5,
        contadoEn: CONTADO,
        movimientos: [
          mov("v1", {}),
          mov("v2", { method: "yape" }),
          mov("i1", { type: "ingreso", createdAt: "2026-10-17T16:00:00.000Z" }),
          mov("v3", { createdAt: "2026-10-17T21:00:00.000Z" }),
          mov("v4", { amount: 13 }),
        ],
      },
      fmt,
    );
    expect(r.map((p) => p.clave)).toEqual(["v1", "i1"]);
    expect(r[0]).toMatchObject({ texto: "La venta en efectivo de S/ 12.50 de las 10:15: ¿se pagó con Yape o tarjeta?", buscar: "12.5" });
  });

  it("sobrante: la venta por otro medio (no el fiado) o el retiro del mismo monto", () => {
    const r = pistasDelDescuadre(
      {
        diferencia: 12.5,
        contadoEn: CONTADO,
        movimientos: [mov("v1", {}), mov("y1", { method: "yape" }), mov("f1", { method: "fiado" }), mov("e1", { type: "egreso" })],
      },
      fmt,
    );
    expect(r.map((p) => p.clave)).toEqual(["y1", "e1"]);
    expect(r[0].texto).toContain("venta por Yape");
  });

  it("sin movimiento que coincida: un billete justo, monedas, o algo sin anotar; cuadra = nada", () => {
    expect(pistasDelDescuadre({ diferencia: -20, contadoEn: CONTADO, movimientos: [] }, fmt)[0].clave).toBe("billete");
    expect(pistasDelDescuadre({ diferencia: 0.3, contadoEn: CONTADO, movimientos: [] }, fmt)[0].clave).toBe("monedas");
    expect(pistasDelDescuadre({ diferencia: -37, contadoEn: CONTADO, movimientos: [] }, fmt)[0]).toMatchObject({ clave: "sin-anotar", texto: expect.stringContaining("retiro") });
    expect(pistasDelDescuadre({ diferencia: 0, contadoEn: CONTADO, movimientos: [mov("v1", {})] }, fmt)).toEqual([]);
  });
});
