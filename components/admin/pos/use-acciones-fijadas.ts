"use client";

/**
 * Accesos fijos del POS (H06/M03, 17-10): las acciones del «Más» que cada
 * cajero quiere a un clic. Se guardan por usuario en este navegador
 * (`pos-acciones-fijadas:<usuario>`): dos cajeros que comparten la caja no se
 * pisan. Tope de 4 para que la fila del buscador siga entrando a 400 px.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import { logger } from "@/lib/logger";

export const FIJABLES = ["express", "whatsapp", "historial", "deuda", "emitir", "devolucion", "trueque", "repetir", "reimprimir", "foto"] as const;
export type AccionFijable = (typeof FIJABLES)[number];
export const TOPE_FIJADAS = 4;

const esFijable = (v: unknown): v is AccionFijable => typeof v === "string" && (FIJABLES as readonly string[]).includes(v);

/** Lo guardado puede venir viejo o tocado a mano: sólo ids conocidos, sin repetir, hasta el tope. */
export function normalizarFijadas(v: unknown): AccionFijable[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(esFijable))].slice(0, TOPE_FIJADAS);
}

function leer(clave: string | null): AccionFijable[] {
  if (!clave || typeof window === "undefined") return [];
  try {
    return normalizarFijadas(JSON.parse(window.localStorage.getItem(clave) ?? "[]"));
  } catch {
    return [];
  }
}

function useUsuarioActual(): string | null {
  const [usuario, setUsuario] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedJson<{ username?: string | null }>("/api/auth/me", 60_000)
      .then((d) => { if (vivo) setUsuario(d?.username ?? null); })
      .catch((err) => logger.warn("[pos] no se pudo leer el usuario para los accesos fijos", { error: String(err) }));
    return () => { vivo = false; };
  }, []);
  return usuario;
}

export function useAccionesFijadas() {
  const usuario = useUsuarioActual();
  const clave = usuario ? `pos-acciones-fijadas:${usuario}` : null;
  // Hasta saber quién es, nada fijado: el servidor y el primer render dibujan lo mismo.
  const [version, setVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` relee lo guardado tras cambiarlo.
  const fijadas = useMemo(() => leer(clave), [clave, version]);

  const guardar = useCallback(
    (ids: readonly string[]) => {
      if (!clave) return;
      try {
        window.localStorage.setItem(clave, JSON.stringify(normalizarFijadas(ids)));
      } catch (err) {
        logger.warn("[pos] no se pudieron guardar los accesos fijos", { error: String(err) });
      }
      setVersion((n) => n + 1);
    },
    [clave],
  );

  return { fijadas, guardar, listo: clave != null };
}
