"use client";

/**
 * use-ficha-troza — la ficha de UNA troza (`/api/admin/forestal/trozas/ficha`)
 * con sus tres finales posibles bien separados: la encontró, no existe (o es de
 * otro negocio: el servidor responde 404 igual, no confirma que exista), o no
 * se pudo preguntar (sin señal, sesión vencida, módulo apagado).
 *
 * Lo usa la tarjeta del QR (`/admin/q/<id>`), que se abre con el celular en el
 * patio: «no existe» y «sin señal» piden cosas distintas al operador, y
 * mezclarlas le hacía buscar una troza que sí estaba.
 *
 * `recargar()` vuelve a preguntar SIN borrar lo que se ve (tras armar un lote,
 * la pastilla de estado cambia sola). Una respuesta vieja nunca pisa a una
 * nueva: cada pedido lleva su número.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { FichaTrozaTarjeta } from "@/lib/forestal/tarjeta-troza";

export type MotivoErrorFicha = "sin_senal" | "sesion" | "modulo" | "permiso" | "servidor";

export type EstadoFichaTroza =
  | { fase: "cargando" }
  | { fase: "lista"; ficha: FichaTrozaTarjeta }
  | { fase: "no_encontrada" }
  | { fase: "error"; motivo: MotivoErrorFicha };

/** HTTP → qué le pasó a la pregunta. Exportado para el test. */
export function motivoDeRespuesta(status: number, error: string | null | undefined): EstadoFichaTroza {
  if (status === 404 || status === 400) return { fase: "no_encontrada" };
  if (status === 401) return { fase: "error", motivo: "sesion" };
  if (status === 403) return { fase: "error", motivo: error === "specialization_disabled" ? "modulo" : "permiso" };
  return { fase: "error", motivo: "servidor" };
}

export function useFichaTroza(id: string | null): { estado: EstadoFichaTroza; recargar: () => void } {
  const [estado, setEstado] = useState<EstadoFichaTroza>(() =>
    id ? { fase: "cargando" } : { fase: "no_encontrada" },
  );
  const [version, setVersion] = useState(0);
  const ultimo = useRef(0);

  useEffect(() => {
    if (!id) {
      setEstado({ fase: "no_encontrada" });
      return;
    }
    const n = ++ultimo.current;
    const ctrl = new AbortController();
    /* Recargar la MISMA troza no vuelve al esqueleto: se ve la ficha de antes
       hasta que llega la nueva. */
    setEstado((prev) => (prev.fase === "lista" && prev.ficha.troza.id === id ? prev : { fase: "cargando" }));

    fetch(`/api/admin/forestal/trozas/ficha?id=${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        /* Un cuerpo que no es JSON (proxy, 502 con HTML) se decide por el status. */
        const j: unknown = await r.json().catch((err: unknown) => {
          logger.warn("[tarjeta-troza] la ficha no vino en JSON", { status: r.status, error: String(err) });
          return null;
        });
        if (n !== ultimo.current) return;
        if (!r.ok) {
          const error = j && typeof j === "object" && "error" in j ? String((j as { error: unknown }).error) : null;
          setEstado(motivoDeRespuesta(r.status, error));
          return;
        }
        if (!j || typeof j !== "object" || !("troza" in j) || !("ingreso" in j)) {
          setEstado({ fase: "error", motivo: "servidor" });
          return;
        }
        setEstado({ fase: "lista", ficha: j as FichaTrozaTarjeta });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || n !== ultimo.current) return;
        /* `fetch` sólo rechaza cuando la pregunta no salió (sin red, DNS, corte):
           cualquier respuesta del servidor, aunque sea 500, entra por el `then`. */
        setEstado({
          fase: "error",
          motivo: e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine) ? "sin_senal" : "servidor",
        });
      });

    return () => ctrl.abort();
  }, [id, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { estado, recargar };
}
