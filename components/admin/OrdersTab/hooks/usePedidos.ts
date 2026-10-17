"use client";

/**
 * Todo el estado de Pedidos y reparto en un lugar: los pedidos, los filtros,
 * las acciones sobre un pedido, el repartidor, la selección de la Lista, las
 * ventanas abiertas y los indicadores. Salió de `OrdersTab/index.tsx` (10-10)
 * para que el hub quede en lo suyo: vistas, cabecera y qué se dibuja.
 *
 * Qué pedidos pasan lo decide `filtrar-pedidos.ts`; acá sólo se arma.
 */
import { useCallback, useState } from "react";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { filtrosPuestos, pedidosArchivados, pedidosEnMarcha } from "../filtrar-pedidos";
import { useDeliveryDriver } from "./useDeliveryDriver";
import { useIndicadoresPedidos } from "./useIndicadoresPedidos";
import { useOrderActions } from "./useOrderActions";
import { useOrderBulkActions } from "./useOrderBulkActions";
import { useOrdersData } from "./useOrdersData";
import { useOrdersFilters } from "./useOrdersFilters";

export function usePedidos() {
  const datos = useOrdersData();
  const { orders, loading, load, setOrders, setDetailOrder, detailOrder } = datos;
  const { filters, dispatch } = useOrdersFilters();
  const acciones = useOrderActions({ setOrders, setDetailOrder, load });
  const reparto = useDeliveryDriver({ patchOrder: acciones.patchOrder });
  const bulk = useOrderBulkActions({ onComplete: load });

  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [impresionAbierta, setImpresionAbierta] = useState(false);
  useScrollLock(!!detailOrder || !!acciones.confirmDeleteId || filtrosAbiertos || impresionAbierta);

  const repartidor = reparto.selectedDriverFilter;
  const enMarchaFiltrados = pedidosEnMarcha(orders, filters, repartidor);
  const archivados = pedidosArchivados(orders);
  const puestos = filtrosPuestos(filters, repartidor);
  /* Lo elegido que todavía se ve: un filtro puesto después no arrastra a los ocultos al «Aplicar». */
  const elegidosVisibles = enMarchaFiltrados
    .filter((o) => bulk.selectedOrderIds.has(o.id))
    .map((o) => o.id);

  const filtrarDeuda = useCallback(
    () => dispatch({ type: "SET_HAS_DEBT", value: !filters.hasDebt }),
    [dispatch, filters.hasDebt],
  );
  const kpis = useIndicadoresPedidos({
    pedidos: enMarchaFiltrados,
    cargando: loading,
    filtrosActivos: puestos,
    conDeudaFiltrado: filters.hasDebt,
    onVerPedido: setDetailOrder,
    onFiltrarDeuda: filtrarDeuda,
  });

  return {
    datos,
    filters,
    dispatch,
    acciones,
    reparto,
    bulk,
    filtrosAbiertos,
    setFiltrosAbiertos,
    impresionAbierta,
    setImpresionAbierta,
    enMarchaFiltrados,
    archivados,
    /** Cuántos hay en marcha sin filtros (la cuenta de la pestaña Tablero). */
    enMarcha: orders.length - archivados.length,
    puestos,
    elegidosVisibles,
    kpis,
  };
}

export type Pedidos = ReturnType<typeof usePedidos>;
