"use client";

/**
 * Lo ganado en el mes (ADR-451), leído del servidor.
 *
 * Antes Ganancias armaba el resultado en el navegador con tres endpoints y un
 * 55 % fijo de costo: el aserrío (S/ 11 054,18 en setiembre en Blas) no
 * figuraba y el mes salía en 0. Ahora el total lo arma el servidor
 * (`GET /api/finanzas/resultado`) y la pantalla sólo lo pinta; el detalle de un
 * renglón son las MISMAS filas que suman su monto
 * (`GET /api/finanzas/resultado/detalle`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { cachedJson } from "@/lib/client-cache-fetch";
import type { FuenteDetalle, RespuestaDetalle, RespuestaResultado } from "@/lib/finance/resultado-del-negocio";
import type { AdminRole } from "@/lib/session";

export interface Carga<T> {
  datos: T | null;
  /** Hay un pedido en vuelo (los `datos` pueden ser del pedido anterior). */
  cargando: boolean;
  /** Una frase para la pantalla, o `null`. */
  error: string | null;
  /** 403: el rol no ve esta plata. Reintentar no sirve. */
  sinPermiso: boolean;
  recargar: () => void;
}

/** Lo que dice la pantalla según el código: el `error` del servidor si trae uno. */
function mensajeDeError(status: number, delServidor: string | null): string {
  if (status === 401) return "Tu sesión venció: vuelve a entrar.";
  /* El 400 del servidor es técnico («fuente debe ser una de: …»): pasa si la pantalla
     pide algo que el servidor todavía no conoce, o al revés. */
  if (status === 400) return "La pantalla pidió algo que el servidor no reconoce: recarga la página.";
  if (status === 403) return "Tu usuario no puede ver esta plata.";
  /* La proyección tiene tope de 20 consultas cada 5 minutos por conexión. */
  if (status === 429) return "Muchas consultas seguidas: espera un minuto y reintenta.";
  return delServidor ?? "No se pudo cargar. Revisa tu conexión y reintenta.";
}

/**
 * GET de un JSON con su estado. `url = null` = no pedir nada.
 *
 * Sólo la respuesta del ÚLTIMO pedido se aplica: cambiar de mes rápido dejaba
 * que una respuesta vieja pisara a la nueva (el mismo bug de
 * «carga vieja pisa lo optimista»). Los `datos` anteriores se conservan
 * mientras llega el nuevo: quien pinta decide si sirven (mismo mes) o no.
 */
export function useCargaJson<T>(url: string | null): Carga<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(url != null);
  const [error, setError] = useState<string | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const ultimo = useRef(0);

  useEffect(() => {
    if (url == null) {
      setCargando(false);
      return;
    }
    const id = ++ultimo.current;
    const corte = new AbortController();
    setCargando(true);
    setError(null);
    setSinPermiso(false);
    fetch(url, { credentials: "include", cache: "no-store", signal: corte.signal })
      .then(async (r) => {
        if (!r.ok) {
          let delServidor: string | null = null;
          try {
            const cuerpo = (await r.json()) as { error?: unknown } | null;
            delServidor = typeof cuerpo?.error === "string" ? cuerpo.error : null;
          } catch {
            // Cuerpo que no es JSON (el HTML de un 502): vale el mensaje por código.
          }
          if (id !== ultimo.current) return;
          setSinPermiso(r.status === 403);
          setError(mensajeDeError(r.status, delServidor));
          return;
        }
        const json = (await r.json()) as T;
        if (id !== ultimo.current) return;
        setDatos(json);
      })
      .catch(() => {
        // Red caída o JSON roto: se dice en pantalla con «Reintentar», no se traga.
        if (corte.signal.aborted || id !== ultimo.current) return;
        setError(mensajeDeError(0, null));
      })
      .finally(() => {
        if (id === ultimo.current) setCargando(false);
      });
    return () => corte.abort();
  }, [url, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, cargando, error, sinPermiso, recargar };
}

/** Quién ve el resultado y la caja: el MISMO array que usan las rutas. */
const ROLES_QUE_VEN = RUTAS_PANEL["/api/finanzas/resultado"] as readonly AdminRole[];

/**
 * ¿Este usuario ve la plata del negocio entero? `"esperando"` mientras se sabe
 * el rol. No es el gate de seguridad (eso es `requireAdmin`): es para no pedir
 * algo que va a volver 403 y decirlo en una frase. `puedePedir` no sirve acá:
 * deja pasar al encargado por el management-tier y el servidor no.
 * Si `/api/auth/me` falla, se pide igual y decide el servidor.
 */
export function useVeLaPlataDelNegocio(): "si" | "no" | "esperando" {
  const [ve, setVe] = useState<"si" | "no" | "esperando">("esperando");
  useEffect(() => {
    let vivo = true;
    cachedJson<{ role?: AdminRole | null }>("/api/auth/me", 60_000)
      .then((d) => {
        if (vivo) setVe(d?.role && !ROLES_QUE_VEN.includes(d.role) ? "no" : "si");
      })
      .catch(() => {
        if (vivo) setVe("si");
      });
    return () => {
      vivo = false;
    };
  }, []);
  return ve;
}

/**
 * El resultado de `mes` (YYYY-MM, calendario de Lima) y la tira de `meses` que
 * termina en él. `mes = null` = no pedir (el rol no lo ve, o todavía no se sabe).
 */
export function useResultadoDelMes(mes: string | null, meses = 6): Carga<RespuestaResultado> {
  return useCargaJson<RespuestaResultado>(
    mes ? `/api/finanzas/resultado?mes=${encodeURIComponent(mes)}&meses=${meses}` : null,
  );
}

/** Las filas de UN renglón (resultado o caja). `fuente = null` = nada abierto. */
export function useDetalleDelRenglon(mes: string, fuente: FuenteDetalle | null): Carga<RespuestaDetalle> {
  return useCargaJson<RespuestaDetalle>(
    fuente
      ? `/api/finanzas/resultado/detalle?mes=${encodeURIComponent(mes)}&fuente=${encodeURIComponent(fuente)}`
      : null,
  );
}
