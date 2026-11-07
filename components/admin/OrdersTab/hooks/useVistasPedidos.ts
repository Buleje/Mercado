"use client";

/**
 * Las vistas de la Lista de pedidos (P08): las del sistema y las que guarda
 * quien está logueado. Guardar, borrar y el menú son los de todo el panel
 * (`useVistasGuardadas` + `MenuVistasGuardadas`, M07); acá sólo qué es lo que
 * se ve (filtros, repartidor y orden) y cómo se pone de una vez. La regla
 * vive en `../vistas-pedidos.ts`.
 */
import { useCallback, useMemo, type Dispatch } from "react";
import { useVistasGuardadas, type VistasGuardadas } from "@/hooks/use-vistas-guardadas";
import { limaDateKey } from "@/lib/utils";
import type { Orden } from "../orden-pedidos";
import type { FiltersAction, OrderFilters } from "../types";
import {
  VISTAS_DEL_SISTEMA,
  aplicarVista,
  capturarVista,
  esEstadoVistaPedidos,
  firmaVistaPedidos,
  type EstadoVistaPedidos,
} from "../vistas-pedidos";

interface Props {
  filters: OrderFilters;
  dispatch: Dispatch<FiltersAction>;
  repartidor: string;
  setRepartidor: (r: string) => void;
  orden: Orden;
  setOrden: (o: Orden) => void;
}

export type VistasPedidos = VistasGuardadas<EstadoVistaPedidos>;

export function useVistasPedidos({
  filters,
  dispatch,
  repartidor,
  setRepartidor,
  orden,
  setOrden,
}: Props): VistasPedidos {
  const hoy = limaDateKey();
  const estado = useMemo<EstadoVistaPedidos>(
    () => ({ filtros: capturarVista(filters, repartidor, hoy), orden }),
    [filters, repartidor, hoy, orden],
  );

  const aplicar = useCallback(
    (e: EstadoVistaPedidos) => {
      const puesto = aplicarVista(e.filtros, limaDateKey());
      dispatch({ type: "SET_ALL", filters: puesto.filters });
      setRepartidor(puesto.repartidor);
      setOrden(e.orden);
    },
    [dispatch, setRepartidor, setOrden],
  );

  const firma = useCallback((e: EstadoVistaPedidos) => firmaVistaPedidos(e, hoy), [hoy]);

  return useVistasGuardadas({
    modulo: "pedidos-lista",
    estado,
    aplicar,
    sistema: VISTAS_DEL_SISTEMA,
    valida: esEstadoVistaPedidos,
    firma,
  });
}
