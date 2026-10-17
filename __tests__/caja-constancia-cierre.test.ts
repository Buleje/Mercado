import { describe, expect, it } from "vitest";
import { diferenciaDeArqueo, htmlConstanciaDeCierre, pendientesDelCierre } from "@/lib/caja/constancia-cierre";
import type { ConciliacionConVentas } from "@/lib/caja/parte-del-dia";

const fmt = (n: number) => `S/ ${n.toFixed(2)}`;
/** El HTML escapa «/» (`&#x2F;`): el navegador lo muestra como «/». */
const visible = (html: string) => html.replaceAll("&#x2F;", "/");
const AHORA = new Date("2026-10-17T22:00:00.000Z"); // sábado 17/10, 17:00 Lima

function conciliacion(sinCaja: { n: number; total: number; efectivo: number }): ConciliacionConVentas {
  return {
    ventasSistema: { n: 10, total: 364.7, efectivo: 142.4 },
    ventasEnCaja: { n: 10 - sinCaja.n, total: 364.7 - sinCaja.total, efectivo: 142.4 - sinCaja.efectivo },
    sinCaja: { ...sinCaja, muestra: [] },
    diferenciaEfectivo: sinCaja.efectivo,
    cuadra: sinCaja.n === 0,
    truncado: false,
  } as ConciliacionConVentas;
}

describe("pendientes antes de cerrar la caja (M30)", () => {
  it("caja del día, sin nada raro: no hay pendientes", () => {
    expect(pendientesDelCierre({ ahora: AHORA, abiertaEn: "2026-10-17T13:00:00.000Z", esperado: 184.9, movimientos: [], conciliacion: conciliacion({ n: 0, total: 0, efectivo: 0 }) }, fmt)).toEqual([]);
  });

  it("venta en efectivo fuera de la caja = pendiente grave; por Yape = aviso", () => {
    const [efe] = pendientesDelCierre({ ahora: AHORA, abiertaEn: "2026-10-17T13:00:00.000Z", esperado: 100, movimientos: [], conciliacion: conciliacion({ n: 1, total: 12.5, efectivo: 12.5 }) }, fmt);
    expect(efe).toMatchObject({ clave: "sin-caja", grave: true, ir: "hoy", texto: "1 venta no pasó por la caja (S/ 12.50)" });
    const [yape] = pendientesDelCierre({ ahora: AHORA, abiertaEn: "2026-10-17T13:00:00.000Z", esperado: 100, movimientos: [], conciliacion: conciliacion({ n: 2, total: 30, efectivo: 0 }) }, fmt);
    expect(yape).toMatchObject({ grave: false, texto: "2 ventas no pasaron por la caja (S/ 30.00)" });
  });

  it("esperado negativo, arqueo con faltante y caja de varios días", () => {
    const p = pendientesDelCierre(
      {
        ahora: AHORA,
        abiertaEn: "2026-10-10T13:00:00.000Z",
        esperado: -6424,
        movimientos: [
          { type: "arqueo", amount: 150, description: "Arqueo express: 09/10 | Diferencia: +S/ 1.00", createdAt: "2026-10-11T10:00:00.000Z" },
          { type: "arqueo", amount: 160, description: "Arqueo express: 10 oct. | Esperado: S/ 162.90 | Contado: S/ 160.00 | Diferencia: S/ -2.90", createdAt: "2026-10-12T10:00:00.000Z" },
        ],
        conciliacion: null,
      },
      fmt,
    );
    expect(p.map((x) => x.clave)).toEqual(["esperado-negativo", "arqueo-con-diferencia", "varios-dias"]);
    expect(p[1].texto).toBe("El último arqueo dio un faltante de S/ 2.90");
    expect(p[2].texto).toBe("Esta caja junta 8 días (desde el sábado 10/10)");
  });

  it("lee la diferencia del arqueo con el signo antes o después de «S/»", () => {
    expect(diferenciaDeArqueo("… | Diferencia: S/ -2.90")).toBe(-2.9);
    expect(diferenciaDeArqueo("… | Diferencia: −S/ 2.90")).toBe(-2.9);
    expect(diferenciaDeArqueo("… | Diferencia: +S/ 1,250.00")).toBe(1250);
    expect(diferenciaDeArqueo("Arqueo express")).toBeNull();
  });
});

describe("constancia de cierre (M30)", () => {
  const caja = {
    id: "cmq8w5f2t000bp3vz0ypdcwbg",
    openedAt: "2026-10-17T13:00:00.000Z",
    closedAt: "2026-10-17T22:05:00.000Z",
    openingAmount: 200,
    closingAmount: 180,
    expectedAmount: 184.9,
    difference: -4.9,
    notes: "Faltó cambio <b>",
    movements: [
      { type: "venta", amount: 22, method: "efectivo" },
      { type: "venta", amount: 33, method: "yape" },
      { type: "egreso", amount: 60, method: "efectivo", description: "Adelanto <img src=x onerror=alert(1)>" },
      { type: "ingreso", amount: 50, method: "efectivo", description: "Cambio" },
    ],
  };

  it("usa las cifras del servidor, dice quién cerró y escapa lo que viene de la base", () => {
    const html = visible(htmlConstanciaDeCierre(caja, { negocio: "Mi Bodega", responsable: "Rosa", tolerancia: 1, pendientes: [] }, fmt));
    expect(html).toContain("Cerró: Rosa");
    expect(html).toContain("Esperado: S/ 184.90");
    expect(html).toContain("Contado: S/ 180.00");
    expect(html).toContain("Diferencia: -S/ 4.90 · Faltante");
    expect(html).toContain("Efectivo: S/ 22.00 (1)");
    expect(html).toContain("Yape: S/ 33.00 (1)");
    expect(html).toContain("Ingresos a mano: S/ 50.00");
    expect(html).toContain("EGRESOS (1)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("Caja #0ypdcwbg");
  });

  it("dentro de la tolerancia es conforme; los pendientes y el reintento quedan escritos", () => {
    const html = visible(htmlConstanciaDeCierre(
      { ...caja, closingAmount: 184.5, difference: -0.4 },
      { negocio: "Mi Bodega", responsable: null, tolerancia: 1, yaEstabaCerrada: true, pendientes: [{ clave: "sin-caja", texto: "1 venta no pasó por la caja (S/ 12.50)", detalle: "", ir: "hoy", grave: true }] },
      fmt,
    ));
    expect(html).toContain("Diferencia: -S/ 0.40 · Conforme (dentro de la tolerancia de S/ 1.00)");
    expect(html).toContain("PENDIENTES AL CERRAR");
    expect(html).toContain("1 venta no pasó por la caja (S/ 12.50)");
    expect(html).toContain("Ya estaba cerrada");
    expect(html).toContain("Cerró: —");
  });
});

describe("pendientes a ciegas", () => {
  it("no dicen montos de efectivo ni el arqueo (delatarían el esperado)", () => {
    const p = pendientesDelCierre(
      {
        ahora: AHORA,
        abiertaEn: "2026-10-17T13:00:00.000Z",
        esperado: -20,
        aCiegas: true,
        movimientos: [{ type: "arqueo", amount: 160, description: "Diferencia: S/ -2.90", createdAt: "2026-10-17T15:00:00.000Z" }],
        conciliacion: conciliacion({ n: 1, total: 12.5, efectivo: 12.5 }),
      },
      fmt,
    );
    expect(p.map((x) => x.clave)).toEqual(["sin-caja", "esperado-negativo"]);
    expect(p.map((x) => x.texto + x.detalle).join(" ")).not.toMatch(/S\/|\d+\.\d\d/);
  });
});
