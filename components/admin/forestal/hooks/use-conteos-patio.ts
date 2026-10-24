"use client";

/**
 * Las actas del conteo del patio, leídas desde el libro (Brandon 2026-09-26):
 * la línea «Último conteo: sábado 26/09 · faltaron 3» de la pestaña Trozas, el
 * historial y el detalle de un acta. Todo contra
 * `GET /api/admin/forestal/patio/conteos` (el acta la escribe el modo patio).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { pedirJsonCtp } from "@/lib/forestal/ctp-fetch";
import type { ActaConteoDetalle, ResumenActaConteo } from "@/lib/forestal/conteo-patio-guardado";

const URL_CONTEOS = "/api/admin/forestal/patio/conteos";
const QUE = "los conteos del patio";

type Estado<T> = { datos: T | null; cargando: boolean; error: string | null };

/**
 * Un GET que sólo pinta su última respuesta. `url = null` = no pedir nada
 * (modal cerrado, ningún acta elegida).
 */
function useGetConteos<T>(url: string | null): Estado<T> & { recargar: () => void } {
  const [estado, setEstado] = useState<Estado<T>>({ datos: null, cargando: url != null, error: null });
  const [vuelta, setVuelta] = useState(0);
  const n = useRef(0);

  useEffect(() => {
    if (!url) return;
    const mio = ++n.current;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    pedirJsonCtp<T>(url, QUE)
      .then((datos) => {
        if (mio === n.current) setEstado({ datos, cargando: false, error: null });
      })
      .catch((e: unknown) => {
        if (mio === n.current) {
          setEstado((prev) => ({ ...prev, cargando: false, error: e instanceof Error ? e.message : String(e) }));
        }
      });
  }, [url, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { ...estado, recargar };
}

/** El último conteo guardado (o `null` si no hay ninguno). */
export function useUltimoConteo() {
  const r = useGetConteos<{ conteos?: ResumenActaConteo[] }>(`${URL_CONTEOS}?limite=1`);
  return { ultimo: r.datos?.conteos?.[0] ?? null, cargando: r.cargando, error: r.error, recargar: r.recargar };
}

/** El historial (hasta 50), sólo con el modal abierto. */
export function useHistorialConteos(abierto: boolean) {
  const r = useGetConteos<{ conteos?: ResumenActaConteo[] }>(abierto ? URL_CONTEOS : null);
  return { conteos: r.datos?.conteos ?? null, cargando: r.cargando, error: r.error, recargar: r.recargar };
}

/** Un acta entera: faltantes, sobrantes, sorpresas y el conteo para reimprimirla. */
export function useActaConteo(id: string | null) {
  const r = useGetConteos<ActaConteoDetalle>(id ? `${URL_CONTEOS}?id=${encodeURIComponent(id)}` : null);
  /* Al cambiar de acta, la anterior no se muestra mientras llega la nueva. */
  const vigente = r.datos && id && r.datos.resumen.id === id ? r.datos : null;
  return { acta: vigente, cargando: r.cargando || (id != null && !vigente && !r.error), error: r.error, recargar: r.recargar };
}

/** El nombre del negocio para el encabezado del acta impresa. */
export function useNombreDelNegocio(activo: boolean): string | null {
  const [nombre, setNombre] = useState<string | null>(null);
  useEffect(() => {
    if (!activo || nombre) return;
    let vivo = true;
    fetch("/api/admin/membrete", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ nombre?: string | null }>) : null))
      .then((d) => {
        if (vivo) setNombre(d?.nombre?.trim() || null);
      })
      .catch((err: unknown) => {
        /* Sin nombre el acta sale igual: el encabezado lo omite. */
        logger.warn("[conteos-patio] membrete no disponible", { error: String(err) });
      });
    return () => {
      vivo = false;
    };
  }, [activo, nombre]);
  return nombre;
}
