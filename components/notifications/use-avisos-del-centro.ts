"use client";

/**
 * useAvisosDelCentro — lo que el centro de notificaciones calcula para pintar
 * una categoría: los avisos guardados juntando los repetidos, los conteos por
 * categoría, «Para atender ahora» agrupado por acción y el estado de la lista.
 * Lo comparten el centro de siempre (`NotificationHub`) y el centro único de
 * «lo que falta hacer» + avisos (`aviso/AvisoAgendaModal`).
 *
 * `sinAgenda`: el centro único muestra la agenda en «Por hacer»; sus alertas de
 * la campana (`agenda-*`) no se repiten en Sistema.
 */
import { useMemo, useState } from "react";
import { juntarRepetidos, ordenarDelDia } from "./avisos-juntos";
import { agruparPorDia, categoriaDeTipo, etiquetaDeCategoria, type FiltroCategoria } from "./notificaciones-categorias";
import { useAlertasConsolidadas } from "./use-alertas-consolidadas";
import { useAccionesDeAvisos } from "./use-acciones-de-avisos";
import type { NotificationFilter, NotificationItem } from "./useNotificationCenter";

interface Opciones {
  abierto: boolean;
  categoria: FiltroCategoria;
  notifications: NotificationItem[];
  filter: NotificationFilter;
  isLoading: boolean;
  cargaFallida: boolean;
  refetch: () => void;
  sinAgenda?: boolean;
}

export type EstadoListaAvisos = "fallo" | "cargando" | "vacio" | "lista";

export function useAvisosDelCentro({ abierto, categoria, notifications, filter, isLoading, cargaFallida, refetch, sinAgenda = false }: Opciones) {
  const [recarga, setRecarga] = useState(0);
  const { alertas: todas, cargando: cargandoAlertas } = useAlertasConsolidadas(abierto, recarga);
  const alertas = useMemo(() => (sinAgenda ? todas.filter((a) => !a.id.startsWith("agenda-")) : todas), [todas, sinAgenda]);

  // Una fila por aviso distinto (los repetidos juntos): las pestañas cuentan filas.
  const juntos = useMemo(() => juntarRepetidos(notifications), [notifications]);
  const conteos = useMemo(() => {
    const c: Record<string, number> = { todas: juntos.length + alertas.length };
    for (const j of juntos) {
      const id = categoriaDeTipo(j.aviso.type);
      c[id] = (c[id] ?? 0) + 1;
    }
    for (const a of alertas) c[a.categoria] = (c[a.categoria] ?? 0) + 1;
    return c;
  }, [juntos, alertas]);

  const enCategoria = useMemo(
    () => (categoria === "todas" ? juntos : juntos.filter((j) => categoriaDeTipo(j.aviso.type) === categoria)),
    [juntos, categoria],
  );
  // «Para atender ahora» sigue leyendo los avisos tal cual llegaron (M08 cuenta sus copias).
  const avisos = useMemo(
    () => (categoria === "todas" ? notifications : notifications.filter((n) => categoriaDeTipo(n.type) === categoria)),
    [notifications, categoria],
  );
  const ahora = useMemo(() => (categoria === "todas" ? alertas : alertas.filter((a) => a.categoria === categoria)), [alertas, categoria]);
  const grupos = useMemo(
    () => agruparPorDia(enCategoria).map((g) => ({ grupo: g.grupo, items: ordenarDelDia(g.items) })),
    [enCategoria],
  );
  // M08: lo de ahora, agrupado por acción («Cobrar 3», «Reponer 5»).
  const porAccion = useAccionesDeAvisos({ abierto, recarga, alertas: ahora, avisos, categoria });
  const hayAhora = porAccion.grupos.length > 0 || porAccion.sueltas.length > 0;
  const nombreCategoria = categoria === "todas" ? null : etiquetaDeCategoria(categoria);
  const estado: EstadoListaAvisos =
    cargaFallida && enCategoria.length === 0
      ? "fallo"
      : isLoading && enCategoria.length === 0
        ? "cargando"
        : enCategoria.length === 0 && !hayAhora
          ? "vacio"
          : "lista";

  const actualizar = () => {
    refetch();
    setRecarga((k) => k + 1);
  };

  return { conteos, grupos, porAccion, estado, nombreCategoria, actualizar, cargandoAlertas, soloSinLeer: filter === "unread" };
}
