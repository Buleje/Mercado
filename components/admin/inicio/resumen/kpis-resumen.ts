import type { SectionKPI } from "../_shared";
import { kpiSinDato } from "@/lib/admin/inicio/hay-datos";
import { cantidad, porcentaje, soles } from "@/lib/admin/inicio/formato-tablero";
import type { ResumenMulti } from "./use-resumen-multi";

/**
 * Las cifras (KPIs) de cada bloque del Resumen de Inicio. Regla del tablero
 * (Brandon 2026-10-09): sin dato = «—» atenuado con ⓘ que dice por qué, nunca
 * «S/ 0» de relleno; plata con `soles()`, cantidades con `cantidad()`.
 */

export const plural = (n: number, uno: string, varios: string) =>
  `${cantidad(n)} ${n === 1 ? uno : varios}`;

/** «9 órdenes · S/ 5,400.00 sin pagar» (lista y tooltip de compras). */
export function detalleCompra(f: { ordenes: number; pendiente: number }): string {
  const ordenes = plural(f.ordenes, "orden", "órdenes");
  return f.pendiente > 0 ? `${ordenes} · ${soles(f.pendiente)} sin pagar` : ordenes;
}

export function kpisDelResumen(r: ResumenMulti) {
  const { cajaKpis, invKpis, compKpis, cliKpis, prodKpis } = r;
  const kpisCaja: SectionKPI[] = [
    {
      label: "Entró",
      value: soles(cajaKpis.ingresos),
      sinDato: kpiSinDato(cajaKpis.ingresos),
      sinDatoHint: "No entró plata por ventas ni pedidos en este período.",
      hint: "Pedidos y ventas del período (sin los cancelados).",
    },
    {
      label: "Salió",
      value: soles(cajaKpis.egresos),
      sinDato: kpiSinDato(cajaKpis.egresos),
      sinDatoHint: "No registraste compras en este período.",
      hint: "Compras a proveedores del período.",
    },
    {
      label: "Entró − salió",
      value: soles(cajaKpis.neto),
      tone: cajaKpis.neto < 0 ? "warning" : "success",
      sinDato: kpiSinDato(cajaKpis.ingresos) && kpiSinDato(cajaKpis.egresos),
    },
    {
      label: "Por pagar",
      value: soles(cajaKpis.pendientePagar),
      tone: "warning",
      sinDato: kpiSinDato(cajaKpis.pendientePagar),
      sinDatoHint: "No tienes cuentas por pagar pendientes.",
      hint: "Cuentas por pagar registradas (de cualquier fecha) que siguen sin pagar. No es lo mismo que «Sin pagar» de Compras.",
    },
  ];

  const mejor = prodKpis.mejor;
  const kpisProductos: SectionKPI[] = [
    {
      label: "El más vendido",
      value: mejor?.producto ?? null,
      sub: mejor
        ? `${soles(mejor.ingresos)} · ${plural(mejor.unidades, "unidad", "unidades")}`
        : undefined,
    },
    prodKpis.margenPct == null
      ? {
          label: "Margen",
          value: null,
          sinDatoHint: prodKpis.margenIncompleto
            ? "Falta el costo de algunos de estos productos: cárgalo en Inventario para ver el margen real."
            : "Sin ventas para calcular el margen.",
        }
      : {
          label: "Margen",
          value: porcentaje(prodKpis.margenPct),
          tone: prodKpis.margenPct >= 25 ? "success" : "warning",
          hint: "Lo que te queda de cada sol vendido, en los productos de esta lista.",
        },
  ];

  const kpisCompras: SectionKPI[] = [
    {
      label: "Compraste",
      value: soles(compKpis.total),
      sub: `${plural(compKpis.ordenes, "orden", "órdenes")} · ${plural(compKpis.provActivos, "proveedor", "proveedores")}`,
    },
    {
      label: "Sin pagar",
      value: soles(compKpis.pendiente),
      tone: "warning",
      sinDato: kpiSinDato(compKpis.pendiente),
      sinDatoHint: "Todas las compras del período están pagadas.",
      hint: "Compras del período que todavía no pagaste.",
    },
  ];

  const kpisInventario: SectionKPI[] = [
    {
      label: "Valor del stock",
      value: soles(invKpis.valor),
      sinDato: kpiSinDato(invKpis.valor),
      sinDatoHint: "Carga el costo de tus productos para valorizar el stock.",
      hint:
        invKpis.sinCosto > 0
          ? `Stock × costo. ${plural(invKpis.sinCosto, "producto sin costo no suma", "productos sin costo no suman")}.`
          : "Stock × costo de cada producto.",
      sub: plural(invKpis.skus, "producto activo", "productos activos"),
    },
    {
      label: "Bajo stock",
      value: cantidad(invKpis.criticos),
      tone: invKpis.criticos > 0 ? "warning" : "neutral",
      sub:
        invKpis.sinStock > 0
          ? `y ${plural(invKpis.sinStock, "agotado", "agotados")}`
          : "ninguno agotado",
      hint: "Productos en su mínimo que todavía tienen stock. Los agotados van aparte.",
    },
  ];

  const kpisClientes: SectionKPI[] = [
    {
      label: "Clientes nuevos",
      value: cantidad(cliKpis.nuevos),
      sinDato: kpiSinDato(cliKpis.nuevos),
      sinDatoHint: "Nadie se registró como cliente en este período.",
      sub: `de ${cantidad(cliKpis.total)} en total`,
    },
    {
      label: "Compraron",
      value: cantidad(cliKpis.activos),
      sinDato: kpiSinDato(cliKpis.activos),
      sinDatoHint: "Ningún pedido entregado con teléfono del cliente en este período.",
      hint: "Clientes distintos (por teléfono) con un pedido entregado.",
    },
  ];

  return {
    caja: kpisCaja,
    productos: kpisProductos,
    compras: kpisCompras,
    inventario: kpisInventario,
    clientes: kpisClientes,
  };
}
