"use client";

/**
 * Lo que la barra necesita para ordenarse sola (`lib/admin/orden-barra.ts`):
 * los rubros prendidos del negocio y las aperturas de 30 días por pestaña.
 *
 * El uso se calcula al montar y no se mueve mientras navegas (una barra que se
 * reacomoda bajo el mouse hace errar el clic, igual que «Menú en tu orden»):
 * se pinta con lo guardado de la carga anterior y lo nuevo queda para la
 * próxima. Sólo la primera vez, sin nada guardado, se aplica lo que llega.
 */

import { useEffect, useMemo, useState } from "react";
import { useEnabledSpecs } from "@/hooks/use-enabled-specs";
import { cachedJson } from "@/lib/client-cache-fetch";
import { logger } from "@/lib/logger";
import { rubrosActivos } from "@/lib/admin/orden-barra";
import { URL_USO_PANEL } from "@/lib/admin/registro-aperturas";
import { TAB_CATEGORIES } from "../_lib/tab-categories";

export interface OrdenAutomatico {
  rubros: readonly string[];
  uso: Readonly<Record<string, number>>;
}

/** `admin-`: se borra al cambiar de negocio (`lib/tenant-cache.ts`). */
const LLAVE = "admin-uso-panel-orden";

function leerGuardado(): Record<string, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LLAVE) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : null;
  } catch {
    return null;
  }
}

export function useOrdenAutomatico(authReady: boolean): OrdenAutomatico {
  const { enabledModuleIds } = useEnabledSpecs();
  /* `useEnabledSpecs` arma un Set nuevo en cada render: la llave estable es el texto. */
  const clavePrendidas = [...enabledModuleIds].sort().join("|");
  const rubros = useMemo(
    () => rubrosActivos(TAB_CATEGORIES, new Set(clavePrendidas ? clavePrendidas.split("|") : [])),
    [clavePrendidas],
  );

  const [uso, setUso] = useState<Record<string, number>>(() => leerGuardado() ?? {});

  useEffect(() => {
    if (!authReady) return;
    let vivo = true;
    const habia = leerGuardado() !== null;
    cachedJson<{ tabs?: Record<string, number> }>(`${URL_USO_PANEL}?resumen=1`, 60_000)
      .then((d) => {
        if (!d?.tabs) return;
        try {
          localStorage.setItem(LLAVE, JSON.stringify(d.tabs));
        } catch {
          /* sin persistencia se ordena con lo de esta carga */
        }
        if (vivo && !habia) setUso(d.tabs);
      })
      .catch((err: unknown) => logger.warn("[uso-panel] no se pudo leer el uso para ordenar la barra", { error: String(err) }));
    return () => {
      vivo = false;
    };
  }, [authReady]);

  return useMemo(() => ({ rubros, uso }), [rubros, uso]);
}
