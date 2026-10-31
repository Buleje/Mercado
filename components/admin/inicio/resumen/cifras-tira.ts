import type { OverviewData } from "@/lib/admin/overview-tipos";
import { cantidad, COLOR_CONCEPTO, porcentaje, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";
import { plural } from "./kpis-resumen";
import type { ResumenMulti } from "./use-resumen-multi";

/**
 * Las cifras de la tira de arriba del Resumen (2026-10-29): reemplaza al hero
 * de un solo número gigante («S/ 900.00») con cuatro casillas, dos en «—».
 * Cada cifra trae su variación (si el servidor la calcula) y su mini-serie del
 * período. Una cifra sin dato NO se dibuja: va a la línea «Sin movimiento».
 */

export interface CifraTira {
  id: string;
  label: string;
  value: string;
  hint?: string;
  /** % contra el período anterior (sólo la venta: lo calcula `/api/admin/overview`). */
  delta?: number | null;
  deltaLabel?: string;
  sub?: string;
  subTono?: "normal" | "aviso";
  tono?: "normal" | "aviso" | "bien" | "mal";
  /** Mini-serie del período (una barra por día o tramo). */
  serie?: number[];
  serieColor?: string;
  serieFormato?: "soles" | "cantidad";
  serieEtiquetas?: string[];
}

const VS: Record<string, string> = {
  diario: "vs ayer",
  semanal: "vs semana pasada",
  mensual: "vs mes pasado",
  anual: "vs año pasado",
  especifica: "vs día anterior",
  personalizado: "vs período anterior",
};

const conValor = (serie: number[]) => serie.filter((v) => v !== 0).length >= 2;

export function cifrasDeLaTira(
  data: OverviewData,
  r: ResumenMulti,
  preset: string,
): { cifras: CifraTira[]; sinMovimiento: string[] } {
  const venta = data.hero.totalRange ?? data.hero.totalToday ?? 0;
  const delta = data.hero.deltaVsPrevious ?? data.hero.deltaVsYesterday ?? 0;
  const c = data.contextual;
  const pedidos = c.ordersInRange ?? c.ordersToday ?? 0;
  const etiquetas = r.caja.map((f) => f.day);
  const sinMovimiento: string[] = [];
  const cifras: CifraTira[] = [];
  const agregar = (ok: boolean, cifra: CifraTira, nombreSinDato: string) => {
    if (ok) cifras.push(cifra);
    else sinMovimiento.push(nombreSinDato);
  };

  const dias = data.hero.sparkline.length;
  agregar(
    venta > 0,
    {
      id: "ventas",
      label: "Vendiste",
      value: soles(venta),
      hint: "Lo cobrado en pedidos y ventas del período, sin los cancelados.",
      delta: delta !== 0 ? delta : null,
      deltaLabel: VS[preset] ?? VS.personalizado,
      sub: dias > 1 && delta === 0 ? `${solesEje(venta / dias)} por día` : undefined,
      serie: conValor(data.hero.sparkline) ? data.hero.sparkline : undefined,
      serieColor: COLOR_CONCEPTO.ventas,
      serieFormato: "soles",
      serieEtiquetas: data.hero.sparklineLabels,
    },
    "ventas",
  );
  agregar(
    pedidos > 0,
    {
      id: "pedidos",
      label: "Pedidos y ventas",
      value: cantidad(pedidos),
      hint: "Pedidos y ventas del mostrador del período (sin los cancelados).",
      sub: c.ticketAverage > 0 ? `${soles(c.ticketAverage)} cada uno` : undefined,
      serie: conValor(r.pedidosPorTramo) ? r.pedidosPorTramo : undefined,
      serieColor: COLOR_CONCEPTO.pedidos,
      serieFormato: "cantidad",
      serieEtiquetas: etiquetas,
    },
    "pedidos",
  );

  const g = r.ganancia;
  agregar(
    g.margenPct != null && g.vendidoConCosto > 0,
    {
      id: "ganancia",
      label: "Te quedó",
      value: soles(g.ganancia),
      tono: g.ganancia < 0 ? "mal" : "normal",
      hint:
        g.sinCosto > 0
          ? `Venta − costo de lo vendido, sólo de los productos con costo cargado. ${plural(g.sinCosto, "producto vendido no tiene", "productos vendidos no tienen")} costo y no suma: cárgalo en Inventario.`
          : "Venta − costo de lo vendido en el período.",
      sub:
        g.margenPct != null
          ? `margen ${porcentaje(g.margenPct)}${g.sinCosto > 0 ? ` · ${cantidad(g.sinCosto)} sin costo` : ""}`
          : undefined,
      subTono: g.sinCosto > 0 ? "aviso" : "normal",
    },
    "ganancia (falta el costo de lo vendido)",
  );

  const neto = r.cajaKpis.neto;
  agregar(
    r.cajaKpis.ingresos > 0 || r.cajaKpis.egresos > 0,
    {
      id: "caja",
      label: "Entró − salió",
      value: soles(neto),
      tono: neto < 0 ? "mal" : "bien",
      hint: "Lo que entró por ventas menos lo que salió en compras, en el período.",
      sub: `entró ${solesEje(r.cajaKpis.ingresos)} · salió ${solesEje(r.cajaKpis.egresos)}`,
    },
    "caja",
  );

  const comp = r.compKpis;
  agregar(
    comp.total > 0,
    {
      id: "compras",
      label: "Compraste",
      value: soles(comp.total),
      hint: "Compras a proveedores del período.",
      sub:
        comp.pendiente > 0
          ? `${solesEje(comp.pendiente)} sin pagar`
          : plural(comp.ordenes, "orden", "órdenes"),
      subTono: comp.pendiente > 0 ? "aviso" : "normal",
      serie: conValor(r.caja.map((f) => f.egresos)) ? r.caja.map((f) => f.egresos) : undefined,
      serieColor: COLOR_CONCEPTO.compras,
      serieFormato: "soles",
      serieEtiquetas: etiquetas,
    },
    "compras",
  );

  const inv = r.invKpis;
  const enRiesgo = r.riesgo.total;
  agregar(
    inv.valor > 0 || inv.skus > 0,
    {
      id: "stock",
      label: inv.valor > 0 ? "Valor del stock" : "Productos activos",
      value: inv.valor > 0 ? soles(inv.valor) : cantidad(inv.skus),
      hint:
        inv.sinCosto > 0
          ? `Stock × costo, hoy. ${plural(inv.sinCosto, "producto sin costo no suma", "productos sin costo no suman")}.`
          : "Stock × costo de cada producto, hoy.",
      sub:
        enRiesgo > 0
          ? `${cantidad(enRiesgo)} por reponer${inv.sinStock > 0 ? ` · ${cantidad(inv.sinStock)} agotados` : ""}`
          : `${plural(inv.skus, "producto", "productos")} · ninguno por reponer`,
      subTono: enRiesgo > 0 ? "aviso" : "normal",
    },
    "inventario",
  );

  const compraron = c.uniqueCustomers;
  const nuevos = c.newCustomers;
  agregar(
    compraron > 0 || nuevos > 0,
    {
      id: "clientes",
      label: compraron > 0 ? "Clientes que compraron" : "Clientes nuevos",
      value: cantidad(compraron > 0 ? compraron : nuevos),
      hint: "Clientes distintos (por su teléfono) que compraron en el período, y los que se registraron.",
      sub:
        compraron > 0 && nuevos > 0
          ? plural(nuevos, "nuevo", "nuevos")
          : r.cliKpis.total > 0
            ? `de ${cantidad(r.cliKpis.total)} en total`
            : undefined,
    },
    "clientes",
  );

  return { cifras, sinMovimiento };
}
