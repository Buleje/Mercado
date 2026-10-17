"use client";

/**
 * Todo el estado de Pedidos y reparto en un lugar: los pedidos, los filtros,
 * las acciones sobre un pedido, el repartidor, la selección de la Lista, las
 * ventanas abiertas y los indicadores. Salió de `OrdersTab/index.tsx` (10-10)
 * para que el hub quede en lo suyo: vistas, cabecera y qué se dibuja.
 *
 * Qué pedidos pasan lo decide `filtrar-pedidos.ts`; acá sólo se arma.
 *
 * 17-10: lo que puede el rol (`permisos-pedidos.ts`), «con notas» leído del
 * historial (B7: antes miraba `adminNotes`, que ya nadie escribe), el orden
 * de la Lista (sube acá para que lo guarden las vistas, P08, y lo respete la
 * hoja impresa, P12) y la versión de la hoja que se imprime.
 */
import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { useMiRol } from "@/hooks/use-mi-rol";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { filtrosEnTexto, filtrosPuestos, pedidosArchivados, pedidosEnMarcha } from "../filtrar-pedidos";
import { imprimirEnClaro, nombreDelPdf } from "../imprimir-pedidos";
import { ORDEN_INICIAL, ordenarPedidos, type Orden } from "../orden-pedidos";
import { permisosDePedidos } from "../permisos-pedidos";
import type { VarianteImpresion } from "../ResumenImpresion";
import { STATUS_LABELS } from "../types";
import { useDeliveryDriver } from "./useDeliveryDriver";
import { useHistorialPedidos } from "./useHistorialPedidos";
import { useIndicadoresPedidos } from "./useIndicadoresPedidos";
import { useOrderActions } from "./useOrderActions";
import { useOrderBulkActions } from "./useOrderBulkActions";
import { useOrdersData } from "./useOrdersData";
import { useOrdersFilters } from "./useOrdersFilters";
import { useVistasPedidos } from "./useVistasPedidos";

/** Lo que el historial revisa por vez (`MAX_PEDIDOS_HISTORIAL`). */
const TOPE_NOTAS = 200;

export function usePedidos() {
  const permisos = permisosDePedidos(useMiRol());
  const datos = useOrdersData();
  const { orders, loading, load, setOrders, setDetailOrder, detailOrder } = datos;
  const { filters, dispatch } = useOrdersFilters();
  const acciones = useOrderActions({ setOrders, setDetailOrder, load, puedeBorrar: permisos.borrar });
  const reparto = useDeliveryDriver({ patchOrder: acciones.patchOrder });
  const bulk = useOrderBulkActions({ onComplete: load });
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const repartidor = reparto.selectedDriverFilter;
  const vistas = useVistasPedidos({
    filters,
    dispatch,
    repartidor,
    setRepartidor: reparto.setSelectedDriverFilter,
    orden,
    setOrden,
  });

  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [impresionAbierta, setImpresionAbierta] = useState(false);
  const [varianteImpresion, setVarianteImpresion] = useState<VarianteImpresion>("preparar");
  useScrollLock(
    !!detailOrder || !!acciones.confirmDeleteId || filtrosAbiertos || impresionAbierta || !!bulk.lote,
  );

  /* B7: los candidatos sin mirar notas; con el filtro puesto, el historial dice cuáles tienen. */
  const candidatos = pedidosEnMarcha(orders, filters, repartidor);
  const notas = useHistorialPedidos(
    filters.hasAdminNotes ? candidatos.map((o) => o.id) : [],
    // Al cerrar el detalle se relee: ahí es donde se anota.
    detailOrder ? "detalle" : "",
  );
  const conNotas =
    filters.hasAdminNotes && !notas.cargando && !notas.error
      ? new Set(
          Object.entries(notas.historial)
            .filter(([, eventos]) => eventos.some((e) => e.tipo === "nota"))
            .map(([id]) => id),
        )
      : null;
  const enMarchaFiltrados = conNotas ? candidatos.filter((o) => conNotas.has(o.id)) : candidatos;

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

  /** P12: la hoja se dibuja con la versión elegida ANTES de abrir el diálogo. */
  const imprimirLista = (v: VarianteImpresion) => {
    flushSync(() => setVarianteImpresion(v));
    imprimirEnClaro(nombreDelPdf(v, new Date()));
  };

  return {
    datos,
    filters,
    dispatch,
    acciones,
    reparto,
    bulk,
    permisos,
    vistas,
    orden,
    setOrden,
    filtrosAbiertos,
    setFiltrosAbiertos,
    impresionAbierta,
    setImpresionAbierta,
    varianteImpresion,
    imprimirLista,
    enMarchaFiltrados,
    /** En el orden de la Lista: lo que sale en la hoja impresa. */
    pedidosOrdenados: ordenarPedidos(enMarchaFiltrados, orden),
    /** Los filtros puestos en palabras (encabezado de la hoja). */
    filtrosTexto: filtrosEnTexto(filters, repartidor, (s) => STATUS_LABELS[s]),
    /** «Con notas»: si todavía no se sabe o falló, el filtro no se aplica y se avisa. */
    notas: {
      activo: filters.hasAdminNotes,
      cargando: filters.hasAdminNotes && notas.cargando,
      error: filters.hasAdminNotes && notas.error,
      recargar: notas.recargar,
      recortado: filters.hasAdminNotes && candidatos.length > TOPE_NOTAS,
    },
    archivados,
    /** Cuántos hay en marcha sin filtros (la cuenta de la pestaña Tablero). */
    enMarcha: orders.length - archivados.length,
    puestos,
    elegidosVisibles,
    kpis,
  };
}

export type Pedidos = ReturnType<typeof usePedidos>;
