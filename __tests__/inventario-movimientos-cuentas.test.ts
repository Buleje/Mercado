import { describe, expect, it } from "vitest";
import {
  causaDe, desdeDe, diaConNombre, diaDelMovimiento, diasEntre, metaDeTipo, resumirPerdidas, totalesDe,
} from "@/components/admin/inventario/movimientos/tipos";
import { contarLotes, conDias, fraseDeDias, urgenciaDe, type Lote } from "@/components/admin/inventario/movimientos/vencimientos";

describe("Entradas y salidas: totales", () => {
  it("un recosteo (ajuste de 0) y un tipo desconocido no suman ni restan", () => {
    const filas = [
      { dir: metaDeTipo("compra").dir, quantity: 9 },
      { dir: metaDeTipo("venta").dir, quantity: 25 },
      { dir: metaDeTipo("merma").dir, quantity: 2 },
      { dir: metaDeTipo("ajuste").dir, quantity: 0 },
      { dir: metaDeTipo("algo_nuevo").dir, quantity: 7 },
    ];
    expect(totalesDe(filas)).toEqual({ count: 5, entradas: 9, salidas: 27, neto: -18, neutrales: 2 });
  });

  it("«Hoy» arranca a la medianoche local y «Todo» no tiene límite", () => {
    expect(desdeDe("todo", 1_000_000_000, 5)).toBeNull();
    expect(desdeDe("hoy", 1_000_000_000, 5)).toBe(5);
    expect(desdeDe("7d", 1_000_000_000, 5)).toBe(1_000_000_000 - 7 * 86_400_000);
  });
});

describe("Pérdidas: causa y monto", () => {
  it("sin lossType se lee como rotura, igual que el servidor (MermasDB)", () => {
    expect(causaDe(undefined)).toBe("damages");
    expect(causaDe("expiry")).toBe("expiry");
    expect(causaDe("cualquiera")).toBe("damages");
  });

  it("main 10-10: 2 pérdidas de Arroz Costeño a S/ 18.29 = S/ 36.58, una por causa (empate sin ganador inventado)", () => {
    const r = resumirPerdidas(
      [
        { productId: 7, quantity: 1, lossType: "damages" },
        { productId: 7, quantity: 1, lossType: "expiry" },
      ],
      () => 18.29,
    );
    expect(r.soles).toBe(36.58);
    expect(r.unidades).toBe(2);
    expect(r.porCausa.map((c) => [c.causa, c.soles])).toEqual([["damages", 18.29], ["expiry", 18.29]]);
  });

  it("un producto sin costo suma 0 soles y se cuenta aparte", () => {
    const r = resumirPerdidas([{ productId: 1, quantity: 3, lossType: "theft" }, { productId: 2, quantity: 2, lossType: "theft" }], (id) => (id === 1 ? 2.1 : 0));
    expect(r.soles).toBe(6.3);
    expect(r.sinCosto).toBe(1);
    expect(r.unidades).toBe(5);
  });
});

describe("Fechas que se leen", () => {
  it("«jueves 10/09» y días de calendario", () => {
    expect(diaConNombre("2026-09-10")).toBe("jueves 10/09");
    expect(diasEntre("2026-10-10", "2026-10-15")).toBe(5);
    expect(diasEntre("2026-10-10", "2026-10-09")).toBe(-1);
  });

  it("el día del movimiento es el de Pucallpa: las 22:00 del 09-10 en Lima son las 03:00 UTC del 10", () => {
    expect(diaDelMovimiento("2026-10-10T03:00:00.000Z", "2026-10-10")).toBe("ayer");
    expect(diaDelMovimiento("2026-10-10T15:00:00.000Z", "2026-10-10")).toBe("hoy");
    expect(diaDelMovimiento("2026-10-01T15:00:00.000Z", "2026-10-10")).toBe("jueves 01/10");
  });
});

describe("Vencimientos", () => {
  const lote = (id: string, expiryDate: string, quantity: number, costUnit = 1): Lote => ({ id, lote: id, productName: "Yogur", quantity, unit: "und", expiryDate, costUnit });

  it("cuenta por fecha de calendario: a las 20:00 de Pucallpa un lote del 15 vence en 5 días, no en 4", () => {
    const [l] = conDias([lote("a", "2026-10-15T00:00:00.000Z", 12)], "2026-10-10");
    expect(l.dias).toBe(5);
    expect(l.urgencia).toBe("critico");
  });

  it("un lote vaciado no es «Vencido» ni pone plata en riesgo", () => {
    expect(urgenciaDe(-3, 0)).toBe("agotado");
    const c = contarLotes(conDias([
      lote("v", "2026-10-01T00:00:00.000Z", 4, 2.5),
      lote("x", "2026-10-01T00:00:00.000Z", 0, 9),
      lote("s", "2026-10-12T00:00:00.000Z", 2, 1.1),
      lote("p", "2026-10-30T00:00:00.000Z", 5, 3),
      lote("b", "2027-01-30T00:00:00.000Z", 5, 3),
    ], "2026-10-10"));
    expect(c).toMatchObject({ vencido: 1, critico: 1, pronto: 1, bien: 1, agotado: 1, valorEnRiesgo: 12.2, unidadesEnRiesgo: 6 });
  });

  it("frases", () => {
    expect(fraseDeDias(-1)).toBe("Venció ayer");
    expect(fraseDeDias(0)).toBe("Vence hoy");
    expect(fraseDeDias(12)).toBe("Vence en 12 días");
  });
});

describe("Dar de baja un lote", async () => {
  const { darDeBajaLote } = await import("@/components/admin/inventario/movimientos/baja-de-lote");
  const lote = { id: "L1", lote: "L-0930", productName: "Yogur", productId: 7, quantity: 4, unit: "und", expiryDate: "2026-10-05T00:00:00.000Z", costUnit: 6.2, dias: -5, urgencia: "vencido" as const };
  const resp = (ok: boolean, body: unknown = {}) => ({ ok, status: ok ? 200 : 500, json: async () => body });

  it("si quitar el lote falla, el reintento NO registra la pérdida otra vez (el stock bajaría dos veces)", async () => {
    const llamadas: string[] = [];
    let borrarFalla = true;
    const pedir = async (url: string, init: { method: string }) => {
      llamadas.push(`${init.method} ${url.split("?")[0]}`);
      return init.method === "DELETE" ? resp(!borrarFalla) : resp(true);
    };
    const ya = new Set<string>();
    const r1 = await darDeBajaLote(lote, ya, pedir);
    expect(r1.ok).toBe(false);
    expect(r1.mensaje).toMatch(/ya quedó registrada/);
    borrarFalla = false;
    const r2 = await darDeBajaLote(lote, ya, pedir);
    expect(r2.ok).toBe(true);
    expect(llamadas).toEqual(["POST /api/inventory-movements", "DELETE /api/batches", "DELETE /api/batches"]);
    expect(ya.size).toBe(0);
  });

  it("si la pérdida no se registra, el lote se queda", async () => {
    const llamadas: string[] = [];
    const r = await darDeBajaLote(lote, new Set(), async (url, init) => { llamadas.push(init.method); return resp(false, { error: "sin stock" }); });
    expect(r).toEqual({ ok: false, mensaje: "No se registró la pérdida, el lote sigue: sin stock" });
    expect(llamadas).toEqual(["POST"]);
  });

  it("2,5 kg no se manda: el stock es entero y se avisa", async () => {
    const llamadas: string[] = [];
    const r = await darDeBajaLote({ ...lote, quantity: 2.5, unit: "kg" }, new Set(), async (url, init) => { llamadas.push(init.method); return resp(true); });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/2.5 kg.*enteros/);
    expect(llamadas).toEqual([]);
  });
});
