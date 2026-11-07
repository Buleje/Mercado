"use client";

/**
 * Accesos fijos por persona, para cualquier pantalla (F33 de comprobantes,
 * 17-10; el mismo patrón que el POS estrenó en `pos/use-acciones-fijadas.ts`).
 *
 * Cada usuario elige qué acciones del «Más» quiere a un clic; se guardan en este
 * navegador con `<espacio>:<usuario>`, así dos personas que comparten la
 * computadora no se pisan. Sólo se aceptan ids conocidos, sin repetir y hasta
 * el tope: lo guardado puede venir viejo o tocado a mano.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import { logger } from "@/lib/logger";

export function normalizarAccesos<T extends string>(v: unknown, validos: readonly T[], tope: number): T[] {
  if (!Array.isArray(v)) return [];
  const es = (x: unknown): x is T => typeof x === "string" && (validos as readonly string[]).includes(x);
  return [...new Set(v.filter(es))].slice(0, tope);
}

/** El usuario de la sesión (para guardar preferencias por persona); `null` hasta saberlo. */
export function useUsuarioActual(): string | null {
  const [usuario, setUsuario] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedJson<{ username?: string | null }>("/api/auth/me", 60_000)
      .then((d) => { if (vivo) setUsuario(d?.username ?? null); })
      .catch((err) => logger.warn("[accesos-fijos] no se pudo leer el usuario", { error: String(err) }));
    return () => { vivo = false; };
  }, []);
  return usuario;
}

export function useAccesosFijos<T extends string>(espacio: string, validos: readonly T[], tope: number) {
  const usuario = useUsuarioActual();
  const clave = usuario ? `${espacio}:${usuario}` : null;
  const [version, setVersion] = useState(0);
  // Hasta saber quién es, nada fijado: el servidor y el primer render dibujan lo mismo.
  const fijados = useMemo(() => {
    if (!clave || typeof window === "undefined") return [] as T[];
    try {
      return normalizarAccesos(JSON.parse(window.localStorage.getItem(clave) ?? "[]"), validos, tope);
    } catch {
      return [] as T[];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` relee lo guardado tras cambiarlo.
  }, [clave, validos, tope, version]);

  const guardar = useCallback(
    (ids: readonly string[]) => {
      if (!clave) return;
      try {
        window.localStorage.setItem(clave, JSON.stringify(normalizarAccesos(ids, validos, tope)));
      } catch (err) {
        logger.warn("[accesos-fijos] no se pudieron guardar", { error: String(err), espacio });
      }
      setVersion((n) => n + 1);
    },
    [clave, validos, tope, espacio],
  );

  return { fijados, guardar, listo: clave != null, usuario };
}
