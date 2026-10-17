"use client";

/**
 * Vistas guardadas de Facturas y boletas (F36): un alcance (período, búsqueda,
 * tipo, estado, origen) con nombre, por persona y en esta computadora
 * (`localStorage` «comprobantes-vistas:<usuario>»). Sin schema: si algún día
 * se quieren compartir entre equipos, van a un campo Json del usuario.
 */
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { aParams, nombreDeVista, normalizarFiltros, type FiltrosComprobantes } from "./filtros-comprobantes";

export const TOPE_VISTAS = 6;

export interface VistaGuardada {
  id: string;
  nombre: string;
  filtros: FiltrosComprobantes;
}

/** Dos alcances iguales tienen la misma huella (se compara lo que viaja a la base). */
export const huellaDe = (f: FiltrosComprobantes) => aParams(f, 1).toString().replace(/&?(desde|hasta)=[^&]*/g, "") + `&p=${f.periodo}`;

function leer(clave: string): VistaGuardada[] {
  try {
    const crudo: unknown = JSON.parse(window.localStorage.getItem(clave) ?? "[]");
    if (!Array.isArray(crudo)) return [];
    const out: VistaGuardada[] = [];
    for (const v of crudo) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const filtros = normalizarFiltros(o.filtros);
      if (!filtros || typeof o.id !== "string") continue;
      out.push({ id: o.id, nombre: typeof o.nombre === "string" && o.nombre.trim() ? o.nombre.slice(0, 60) : nombreDeVista(filtros), filtros });
    }
    return out.slice(0, TOPE_VISTAS);
  } catch {
    return [];
  }
}

export function useVistasGuardadas(usuario: string | null) {
  const clave = usuario ? `comprobantes-vistas:${usuario}` : null;
  const [vistas, setVistas] = useState<VistaGuardada[]>([]);

  /* Hasta saber quién es, ninguna (servidor y primer render iguales). */
  useEffect(() => {
    if (!clave) return;
    setVistas(leer(clave));
  }, [clave]);

  const escribir = useCallback(
    (lista: VistaGuardada[]) => {
      setVistas(lista);
      if (!clave) return;
      try {
        window.localStorage.setItem(clave, JSON.stringify(lista));
      } catch (err) {
        logger.warn("[comprobantes] no se pudo guardar la vista", { error: String(err) });
      }
    },
    [clave],
  );

  /** Guarda el alcance; si ya estaba, no lo duplica. Devuelve `false` si se llegó al tope. */
  const guardar = useCallback(
    (f: FiltrosComprobantes): boolean => {
      const huella = huellaDe(f);
      if (vistas.some((v) => huellaDe(v.filtros) === huella)) return true;
      if (vistas.length >= TOPE_VISTAS) return false;
      escribir([...vistas, { id: `v${Date.now().toString(36)}`, nombre: nombreDeVista(f), filtros: f }]);
      return true;
    },
    [vistas, escribir],
  );

  const borrar = useCallback((id: string) => escribir(vistas.filter((v) => v.id !== id)), [vistas, escribir]);

  return { vistas, guardar, borrar, listo: clave != null };
}
