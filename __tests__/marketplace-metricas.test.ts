/**
 * Pestaña Marketplace del Inicio: qué se muestra y qué no (R1/R2, 2026-10-09)
 * y que las cifras movidas desde el componente den lo mismo que antes.
 */
import { describe, expect, it } from "vitest";
import {
  distribucionResenas,
  embudoDePedidos,
  hayActividadMarketplace,
  ingresosPorMes,
  mapaHorario,
  masVendidos,
  queSeMuestra,
  semanaContraLaPasada,
  type PedidoMarketplace,
} from "@/components/admin/vendor-dashboard/marketplace-metricas";
import type { VendorDashboardData } from "@/components/admin/vendor-dashboard/vendor-dashboard.types";

const AHORA = new Date(2026, 9, 9, 15, 0, 0).getTime(); // viernes 09/10 15:00 local
const DIA = 24 * 60 * 60 * 1000;

function pedido(diasAtras: number, status: string, total = 10, hora = 15, items: PedidoMarketplace["items"] = []): PedidoMarketplace {
  const d = new Date(AHORA - diasAtras * DIA);
  d.setHours(hora, 0, 0, 0);
  return { id: `${diasAtras}-${status}-${hora}`, createdAt: d.toISOString(), total, status, items };
}

function todo(orders: PedidoMarketplace[], reviews: { rating: number }[] = []) {
  const embudo = embudoDePedidos(orders, AHORA);
  const mensual = ingresosPorMes(orders, new Date(AHORA));
  const top = masVendidos(orders, [], AHORA);
  const resenas = distribucionResenas(reviews);
  const semana = semanaContraLaPasada(orders, AHORA);
  const mapa = mapaHorario(orders, AHORA);
  return { embudo, mensual, top, resenas, semana, mapa, muestra: queSeMuestra({ embudo, mensual, top, resenas, semana, mapa }) };
}

describe("queSeMuestra (R2)", () => {
  it("main de hoy: 1 pedido cancelado en 30 días + 1 entregado en mayo → todo oculto", () => {
    const { muestra, embudo } = todo([pedido(0.5, "cancelado", 2.5), pedido(156, "entregado", 7.2)]);
    expect(embudo.recibidos).toBe(1);
    expect(muestra).toEqual({ embudo: false, mensual: false, top: "oculto", resenas: false, semana: false, mapa: false });
  });

  it("embudo con pedidos que avanzan sí se muestra y la conversión no cambia", () => {
    const { muestra, embudo } = todo([pedido(1, "entregado"), pedido(2, "confirmado"), pedido(3, "pendiente"), pedido(4, "cancelado")]);
    expect(muestra.embudo).toBe(true);
    expect(embudo.data.map((e) => e.cantidad)).toEqual([4, 2, 1, 1]);
    expect(embudo.conversion).toBe(25);
    expect(embudo.cancelados).toBe(1);
  });

  it("más vendidos: 1-2 productos = lista; 3+ = barras; nombre entero", () => {
    const item = (id: number, name: string) => ({ id, name, quantity: 1, price: 10 });
    const dos = todo([pedido(1, "entregado", 10, 15, [item(1, "Aceite Primor Premium 1L botella"), item(2, "Arroz")])]);
    expect(dos.muestra.top).toBe("lista");
    expect(dos.top.rows[0].producto).toBe("Aceite Primor Premium 1L botella");
    const tres = todo([pedido(1, "entregado", 30, 15, [item(1, "A"), item(2, "B"), item(3, "C")])]);
    expect(tres.muestra.top).toBe("grafico");
    expect(tres.top.sumaTop).toBe(30);
  });

  it("semana y meses piden 2 puntos con valor; el mapa, 2 casillas", () => {
    const uno = todo([pedido(1, "entregado", 40, 10)]);
    expect(uno.muestra.semana).toBe(false);
    expect(uno.muestra.mapa).toBe(false);
    const dos = todo([pedido(1, "entregado", 40, 10), pedido(2, "entregado", 15, 12), pedido(9, "entregado", 25, 20), pedido(40, "entregado", 30)]);
    expect(dos.muestra.semana).toBe(true);
    expect(dos.semana.actual).toBe(55);
    expect(dos.semana.anterior).toBe(25);
    expect(dos.muestra.mapa).toBe(true);
    expect(dos.muestra.mensual).toBe(true);
    expect(dos.semana.rows[6].dia).toBe("Hoy");
  });

  it("reseñas: promedio, buenas y malas como antes", () => {
    const { muestra, resenas } = todo([], [{ rating: 5 }, { rating: 4 }, { rating: 1 }]);
    expect(muestra.resenas).toBe(true);
    expect(resenas.promedio).toBeCloseTo(10 / 3);
    expect(resenas.buenos).toBe(2);
    expect(resenas.malos).toBe(1);
    expect(resenas.arr[0]).toEqual({ estrellas: 5, cantidad: 1 });
  });

  it("mapa: el pico dice franja y día", () => {
    // AHORA es viernes; 0 días atrás a las 16 h = Tarde del vie.
    const { mapa } = todo([pedido(0, "entregado", 10, 16), pedido(0, "entregado", 10, 17), pedido(1, "entregado", 10, 8)]);
    expect(mapa.picoTexto).toBe("Tarde del vie");
    expect(mapa.diaFuerte).toEqual({ nombre: "viernes", pedidos: 2 });
  });

  it("meses escritos a mano (setiembre, no septiembre)", () => {
    const { mensual } = todo([]);
    expect(mensual.rows.map((r) => r.mes)).toEqual(["may", "jun", "jul", "ago", "set", "oct"]);
    expect(mensual.rows[4].mesLargo).toBe("setiembre 2026");
  });
});

describe("hayActividadMarketplace (R1)", () => {
  const vacio: VendorDashboardData = {
    kpis: { salesToday: 0, salesYesterday: 0, salesLastWeek: 0, pendingOrdersCount: 0, lowStockCount: 3 },
    pendingOrders: [],
    lowStockProducts: [],
    recentSales: [],
    weeklyRevenue: [{ date: "2026-10-09", total: 0 }],
  };

  it("todo en cero (aunque haya stock bajo) → paiche", () => {
    expect(hayActividadMarketplace(vacio, [], [])).toBe(false);
  });

  it("un pedido por atender, una venta o un pedido en el tablero → hay actividad", () => {
    expect(hayActividadMarketplace({ ...vacio, kpis: { ...vacio.kpis, pendingOrdersCount: 16 } }, [], [])).toBe(true);
    expect(hayActividadMarketplace({ ...vacio, weeklyRevenue: [{ date: "2026-10-09", total: 12 }] }, [], [])).toBe(true);
    expect(hayActividadMarketplace(vacio, [{ id: 1 }], [])).toBe(true);
  });
});
