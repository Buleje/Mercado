"use client";

/**
 * El permiso elegido en Resúmenes › Rolliza (Brandon, 2026-10-19: «para
 * escoger según lo que entró, una opción para poder escoger las trozas según
 * el permiso»). UNA sola fuente para toda la hoja: los chips de «Lo que entró»
 * lo escriben y «¿Cuadran las medidas?» de «Faltante y cierre» lo lee.
 *
 * Viaja en `?permiso=` —el mismo parámetro del recorte de Saldos, que
 * `navigateTab` ya limpia al cambiar de módulo (`PARAMS_DE_VISTA`)— para que
 * el enlace compartido abra con el mismo permiso.
 *
 * Sólo FILTRA LA VISTA: el reparto sigue armándose con todos los bloques (un
 * bloque escondido no deja de amparar lo suyo).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { esAserradaDirecta } from "@/lib/forestal/cubicacion-reparto";
import { coincidePermiso } from "@/lib/forestal/cuadre-medidas-rolliza";

const PARAM = "permiso";
/** El valor del chip de los bloques sin N° de permiso. */
export const SIN_PERMISO = "(sin permiso)";

export interface GrupoPermiso {
  /** Lo que va a la URL: el permiso tal como está escrito en el primer bloque. */
  valor: string;
  bloques: number;
  rollizaM3: number;
  /** m³ (A) de los bloques ya aserrados: nunca se suma con la rolliza. */
  aserradaM3: number;
  /** Trozas que se conocen (las elegidas o las que dice el Libro); 0 = no se sabe. */
  trozas: number;
}

const leerUrl = (): string => {
  if (typeof window === "undefined") return "";
  return (new URL(window.location.href).searchParams.get(PARAM) ?? "").trim();
};

const clave = (permiso: string | null | undefined) => (permiso ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

/** ¿El bloque es del permiso elegido? `""` = todos. */
export function bloqueEnPermiso(b: Pick<BloqueRolliza, "permiso">, elegido: string): boolean {
  if (!elegido) return true;
  if (elegido === SIN_PERMISO) return !b.permiso?.trim();
  return coincidePermiso(b.permiso, elegido);
}

export function gruposDePermiso(bloques: readonly BloqueRolliza[]): GrupoPermiso[] {
  const m = new Map<string, GrupoPermiso>();
  for (const b of bloques) {
    const k = clave(b.permiso) || SIN_PERMISO;
    const g = m.get(k) ?? { valor: b.permiso?.trim() || SIN_PERMISO, bloques: 0, rollizaM3: 0, aserradaM3: 0, trozas: 0 };
    const m3 = Number(b.m3) || 0;
    g.bloques++;
    if (esAserradaDirecta(b)) g.aserradaM3 += m3;
    else {
      g.rollizaM3 += m3;
      g.trozas += b.trozaIds?.length || b.piezasOrigen || 0;
    }
    m.set(k, g);
  }
  /* Los que tienen permiso primero, el más grande arriba; «sin permiso» al final. */
  return [...m.values()].sort((a, b) => Number(a.valor === SIN_PERMISO) - Number(b.valor === SIN_PERMISO) || b.rollizaM3 - a.rollizaM3);
}

export function usePermisoDeRolliza(bloques: readonly BloqueRolliza[]) {
  const [pedido, setPedido] = useState("");
  /* La URL se lee al montar (no en el render: el servidor no la tiene) y al ir «atrás». */
  useEffect(() => {
    const releer = () => setPedido(leerUrl());
    releer();
    window.addEventListener("popstate", releer);
    return () => window.removeEventListener("popstate", releer);
  }, []);

  const grupos = useMemo(() => gruposDePermiso(bloques), [bloques]);
  /** El pedido sólo vale si algún bloque es de ese permiso: un enlace viejo no deja la tabla vacía. */
  const elegido = useMemo(() => {
    if (!pedido) return "";
    const g = grupos.find((x) => (pedido === SIN_PERMISO ? x.valor === SIN_PERMISO : coincidePermiso(x.valor, pedido)));
    return g?.valor ?? "";
  }, [pedido, grupos]);

  const elegir = useCallback((valor: string) => {
    setPedido(valor);
    try {
      const url = new URL(window.location.href);
      if (valor) url.searchParams.set(PARAM, valor);
      else url.searchParams.delete(PARAM);
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* sin history: el filtro funciona igual, sólo no queda en el enlace */
    }
  }, []);

  const incluye = useCallback((b: Pick<BloqueRolliza, "permiso">) => bloqueEnPermiso(b, elegido), [elegido]);

  return { elegido, elegir, grupos, incluye };
}

export type PermisoDeRolliza = ReturnType<typeof usePermisoDeRolliza>;
