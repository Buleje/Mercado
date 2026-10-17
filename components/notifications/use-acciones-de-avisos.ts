"use client";

/**
 * Arma los grupos de «Para atender ahora» por acción (M08): junta el estado de
 * hoy que ya trajo el centro (`alertas`), los avisos sin leer y lo que falta
 * pedir aparte —la caja que quedó abierta de otro día y los comprobantes que
 * SUNAT observó—, y le pone a cada grupo su enlace sólo si este rol ve esa
 * pestaña (la misma regla que la barra y el buscador).
 */
import { useEffect, useMemo, useState } from "react";
import { useMiRol } from "@/hooks/use-mi-rol";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
import { destinoPermitido } from "@/lib/admin/comandos-panel";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { puedePedir, type RutaPanel } from "@/lib/auth/roles-rutas-panel";
import { avisoCajaAbierta, type CuentaCajaAbierta } from "@/lib/caja/caja-abierta";
import { cachedJson, invalidateCachedJson } from "@/lib/client-cache-fetch";
import {
  agruparPorAccion,
  extraDeComprobantes,
  type AlertaDeEstado,
  type AvisoGuardado,
  type EstadoExtra,
  type GrupoAccion,
} from "./acciones-de-avisos";
import type { FiltroCategoria } from "./notificaciones-categorias";

const RESUMEN: RutaPanel = "/api/admin/alerts-summary";
const COMPROBANTES: RutaPanel = "/api/admin/comprobantes/pendientes";

export type GrupoConEnlace = GrupoAccion & { href: string | null };

function leer(url: string, fresco: boolean): Promise<unknown> {
  if (fresco) invalidateCachedJson(url);
  return cachedJson(url, 30_000);
}

function extraDeCaja(resumen: unknown): EstadoExtra | null {
  const r = resumen as { cajaAbiertaDesde?: string | null; cajaAbiertaCuenta?: CuentaCajaAbierta | null } | null;
  const aviso = avisoCajaAbierta(r?.cajaAbiertaDesde, new Date(), r?.cajaAbiertaCuenta ?? null);
  if (!aviso || !r?.cajaAbiertaDesde) return null;
  return {
    accion: "caja",
    cantidad: 1,
    titulo: aviso.titulo,
    desde: r.cajaAbiertaDesde,
    urgente: aviso.severidad === "urgent",
  };
}

export function useAccionesDeAvisos<A extends AlertaDeEstado>(o: {
  abierto: boolean;
  recarga: number;
  alertas: readonly A[];
  avisos: readonly AvisoGuardado[];
  categoria: FiltroCategoria;
}): { grupos: GrupoConEnlace[]; sueltas: A[] } {
  const { abierto, recarga, alertas, avisos, categoria } = o;
  const rol = useMiRol();
  const ctx = useContextoPermiso();
  const [extra, setExtra] = useState<EstadoExtra[]>([]);
  const puedeResumen = puedePedir(RESUMEN, rol);
  const puedeComprobantes = puedePedir(COMPROBANTES, rol);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    const fresco = recarga > 0;
    void Promise.all([
      puedeResumen ? leer(RESUMEN, fresco) : null,
      puedeComprobantes ? leer(COMPROBANTES, fresco) : null,
    ]).then(([resumen, comprobantes]) => {
      if (!vivo) return;
      setExtra([extraDeCaja(resumen), extraDeComprobantes(comprobantes)].filter((e): e is EstadoExtra => e !== null));
    });
    return () => {
      vivo = false;
    };
  }, [abierto, recarga, puedeResumen, puedeComprobantes]);

  return useMemo(() => {
    const { grupos, sueltas } = agruparPorAccion(alertas, avisos, extra);
    const visibles = categoria === "todas" ? grupos : grupos.filter((g) => g.categoria === categoria);
    return {
      grupos: visibles.map((g) => {
        const { tab, vista, sub } = g.destino;
        const ve = ctx !== null && destinoPermitido(ctx, tab, vista, sub);
        const params: Record<string, string> = {};
        if (vista) params.vista = vista;
        if (sub) params.sub = sub;
        return { ...g, href: ve ? (g.registro ?? hrefDeDestino({ tab, params })) : null };
      }),
      sueltas,
    };
  }, [alertas, avisos, extra, categoria, ctx]);
}
