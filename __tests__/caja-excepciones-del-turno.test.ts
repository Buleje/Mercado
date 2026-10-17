import { describe, expect, it } from "vitest";
import { excepcionesDelTurno } from "@/lib/caja/excepciones-del-turno";
import type { MovimientoParaRevisar } from "@/lib/caja/cobros-para-revisar";

const fmt = (n: number) => `S/ ${n.toFixed(2)}`;
const AHORA = new Date("2026-10-17T20:00:00.000Z");
const mov = (id: string, over: Partial<MovimientoParaRevisar>): MovimientoParaRevisar => ({
  id,
  type: "venta",
  amount: 10,
  method: "efectivo",
  description: "",
  createdAt: "2026-10-17T15:00:00.000Z",
  ...over,
});

describe("excepciones del turno en una bandeja (M22)", () => {
  it("reúne arqueo fuera de tolerancia, cobros repetidos, retiros sin detalle y cierres sin contar o sin explicar, graves primero", () => {
    const r = excepcionesDelTurno(
      {
        ahora: AHORA,
        tolerancia: 5,
        movimientos: [
          mov("a1", { type: "arqueo", description: "Arqueo · Contado: S/ 150.00 · Diferencia: S/ -8.00", createdAt: "2026-10-17T16:00:00.000Z" }),
          mov("y1", { method: "yape", saleId: "s1", amount: 20 }),
          mov("y2", { method: "yape", saleId: "s1", amount: 20 }),
          mov("e1", { type: "egreso", amount: 30, description: "Retiro" }),
          mov("e2", { type: "egreso", amount: 15, description: "" }),
          mov("e3", { type: "egreso", amount: 40, description: "Pago de luz a Electro Ucayali" }),
        ],
        cerradas: [
          { id: "c1", closedAt: "2026-10-16T23:00:00.000Z", difference: 0, notes: "Cierre automático al cerrar el turno" },
          { id: "c2", closedAt: "2026-10-15T23:00:00.000Z", difference: -12, notes: "" },
          { id: "c3", closedAt: "2026-10-14T23:00:00.000Z", difference: -12, notes: "faltó cambio, lo puso Rosa" },
          { id: "c4", closedAt: "2026-09-01T23:00:00.000Z", difference: -50, notes: "" },
        ],
      },
      fmt,
    );
    expect(r.map((x) => [x.clave, x.ir, x.grave])).toEqual([
      ["arqueo", "cuadrar", true],
      ["cobros-repetidos", "medios", true],
      ["sin-explicar:c2", "caja", true],
      ["retiros-sin-detalle", "movimientos", false],
      ["sin-conteo:c1", "caja", false],
    ]);
    expect(r.find((x) => x.clave === "retiros-sin-detalle")?.texto).toBe("2 retiros sin detalle (S/ 45.00)");
    expect(r.find((x) => x.clave === "sin-explicar:c2")).toMatchObject({ cajaId: "c2", texto: expect.stringContaining("faltante de S/ 12.00") });
  });

  it("a ciegas no muestra montos de diferencia (delatan el esperado); dentro de la tolerancia no hay nada", () => {
    const base = {
      ahora: AHORA,
      tolerancia: 5,
      movimientos: [mov("a1", { type: "arqueo", description: "Diferencia: S/ -3.00" })],
      cerradas: [{ id: "c2", closedAt: "2026-10-15T23:00:00.000Z", difference: -12, notes: "" }],
    };
    expect(excepcionesDelTurno({ ...base, aCiegas: true }, fmt)).toEqual([]);
    expect(excepcionesDelTurno({ ...base, cerradas: [] }, fmt)).toEqual([]);
  });
});
