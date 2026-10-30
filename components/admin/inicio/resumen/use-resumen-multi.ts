"use client";

import { useMemo } from "react";
import type { DateRange } from "../DashboardDateRange";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { useStockMinimoGlobal } from "@/lib/inventario/use-stock-minimo-global";
import { hayDatosEnSerie, valorConDato } from "@/lib/admin/inicio/hay-datos";
import {
  buildBuckets,
  cajaPorDia,
  clientesPorDia,
  comprasPorProveedor,
  inventarioPorCategoria,
  kpisCaja,
  kpisClientes,
  kpisCompras,
  kpisInventario,
  kpisProductos,
  productosTop,
  type Customer,
  type Order,
  type Payable,
  type Product,
  type Purchase,
  type Sale,
} from "./calculos-resumen";
import { conteoPorTramo, gananciaDelPeriodo, mapaDiaHora, metodosDePago, stockEnRiesgo } from "./calculos-tablero";

function ultimos7(): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/**
 * Las cuentas de los bloques del Resumen (caja, inventario, compras, clientes,
 * productos) para el rango del tablero. Lo usa `InicioDashboardV2` para decidir
 * si la pestaña entera está vacía (R1) y se lo pasa a `TableroResumen`.
 */
export function useResumenMulti(dateRange?: DateRange) {
  const minimoGlobal = useStockMinimoGlobal();
  const { data, loading, error, refresh } = useDashboardData();

  // Las dependencias son los instantes (no la referencia de `dateRange`): no
  // recalcular si el rango cambia de objeto pero no de valor.
  const desdeMs = dateRange?.from.getTime();
  const hastaMs = dateRange?.to.getTime();
  const { from, to } = useMemo(
    () =>
      desdeMs != null && hastaMs != null
        ? { from: new Date(desdeMs), to: new Date(hastaMs) }
        : ultimos7(),
    [desdeMs, hastaMs],
  );
  const desde = from.getTime();
  const hasta = to.getTime();

  return useMemo(() => {
    const products = (data?.products ?? []) as Product[];
    const orders = (data?.orders ?? []) as Order[];
    const sales = (data?.sales ?? []) as Sale[];
    const purchases = (data?.purchases ?? []) as Purchase[];
    const payables = (data?.payables ?? []) as Payable[];
    const customers = (data?.customers ?? []) as Customer[];
    const buckets = buildBuckets(from, to);

    const caja = cajaPorDia(orders, sales, purchases, buckets);
    const productos = productosTop(products, orders, sales, desde, hasta);
    const compras = comprasPorProveedor(purchases, desde, hasta);
    const compKpis = kpisCompras(purchases, desde, hasta);
    const cliKpis = kpisClientes(customers, orders, desde, hasta);
    return {
      cargando: loading && !data,
      /** Falló `/api/admin/dashboard` (p. ej. 429) y no hay datos viejos: no es «sin datos». */
      fallo: !!error && !data,
      reintentar: refresh,
      caja,
      cajaKpis: kpisCaja(caja, payables),
      inventario: inventarioPorCategoria(products),
      invKpis: kpisInventario(products, minimoGlobal),
      compras,
      compKpis,
      clientes: clientesPorDia(customers, orders, buckets),
      cliKpis,
      productos,
      prodKpis: kpisProductos(productos),
      /** Tablero denso (29-10): cómo te pagan, cuándo te compran, stock en riesgo y ganancia. */
      metodos: metodosDePago(orders, sales, desde, hasta),
      mapaHoras: mapaDiaHora(orders, sales, desde, hasta),
      riesgo: stockEnRiesgo(products, minimoGlobal),
      ganancia: gananciaDelPeriodo(products, orders, sales, desde, hasta),
      pedidosPorTramo: conteoPorTramo(orders, sales, buckets),
      /**
       * ¿Se movió algo EN EL RANGO? (plata que entró o salió, compras, clientes
       * nuevos). El inventario no cuenta: es la foto de hoy y siempre tiene algo.
       */
      hayMovimientos:
        hayDatosEnSerie(caja, ["ingresos", "egresos"]) ||
        valorConDato(compKpis.total) ||
        valorConDato(cliKpis.nuevos) ||
        productos.length > 0,
    };
  }, [data, loading, error, refresh, from, to, desde, hasta, minimoGlobal]);
}

export type ResumenMulti = ReturnType<typeof useResumenMulti>;
