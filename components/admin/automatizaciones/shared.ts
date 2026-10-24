"use client";

/**
 * Piezas compartidas por los canales de Automatizaciones: leer un endpoint y
 * actuar sobre él (`useCanal`), la cuenta regresiva del código de vinculación,
 * copiar con acuse y decir «hace cuánto» se usó un canal.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatDateShort } from "@/lib/format";

/** Copiar al portapapeles con acuse visible: sin el tilde nadie sabe si copió. */
export function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = useCallback((texto: string, clave: string) => {
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        setCopiado(clave);
        setTimeout(() => setCopiado(null), 1600);
      })
      .catch(() => setCopiado(null));
  }, []);
  return { copiado, copiar };
}

/** POST/DELETE con CSRF. Lanza el `error` que devuelve el servidor. */
export async function enviarA(
  api: string,
  body: unknown,
  metodo: "POST" | "DELETE" = "POST",
): Promise<Record<string, unknown>> {
  const r = await fetch(api, {
    method: metodo,
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(json.error ?? "Falló la operación"));
  return json;
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface Canal<T> {
  dato: T | null;
  /** Cuándo llegó `dato` (ms): la cuenta regresiva del código se mide desde acá. */
  cargadoEn: number;
  cargando: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  ocupado: boolean;
  recargar: () => Promise<void>;
  /** Manda y vuelve a leer. Devuelve la respuesta, o `null` si falló (el error queda en `error`). */
  accion: (body: unknown, metodo?: "POST" | "DELETE") => Promise<Record<string, unknown> | null>;
}

/** Un endpoint de canal: lo lee al montar y lo vuelve a leer después de cada acción. */
export function useCanal<T>(api: string, mensajeError: string): Canal<T> {
  const [estado, setEstado] = useState<{ dato: T; en: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const r = await fetch(api);
      if (!r.ok) throw new Error(mensajeError);
      setEstado({ dato: (await r.json()) as T, en: Date.now() });
      setError(null);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setCargando(false);
    }
  }, [api, mensajeError]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const accion = useCallback(
    async (body: unknown, metodo: "POST" | "DELETE" = "POST") => {
      setOcupado(true);
      setError(null);
      try {
        const json = await enviarA(api, body, metodo);
        await recargar();
        return json;
      } catch (e) {
        setError(mensajeDe(e));
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [api, recargar],
  );

  return { dato: estado?.dato ?? null, cargadoEn: estado?.en ?? 0, cargando, error, setError, ocupado, recargar, accion };
}

/**
 * El estado de la IA. `preguntar()` le vuelve a preguntar al proveedor (sin
 * caché): sirve después de cambiar una clave o cuando un modelo se dio de baja.
 */
export function useSaludIA<T>(api: string) {
  const [dato, setDato] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [preguntando, setPreguntando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (refrescar: boolean) => {
      if (refrescar) setPreguntando(true);
      try {
        const r = await fetch(refrescar ? `${api}?refrescar=1` : api);
        if (!r.ok) throw new Error("No se pudo leer el estado de la IA");
        setDato((await r.json()) as T);
        setError(null);
      } catch (e) {
        setError(mensajeDe(e));
      } finally {
        setCargando(false);
        setPreguntando(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  const preguntar = useCallback(() => void cargar(true), [cargar]);
  return { dato, cargando, preguntando, error, preguntar };
}

/**
 * Segundos que le quedan al código. Se mide contra el reloj (cuándo llegó el
 * dato + lo que decía el servidor), no contra el montaje: plegar y desplegar
 * el canal no le devuelve minutos a un código que ya se está venciendo.
 */
export function useCuentaRegresiva(codigo: { quedanSegundos: number } | null | undefined, cargadoEn: number): number {
  const vence = codigo ? cargadoEn + codigo.quedanSegundos * 1000 : 0;
  const calcular = useCallback(() => Math.max(0, Math.round((vence - Date.now()) / 1000)), [vence]);
  const [quedan, setQuedan] = useState(calcular);
  const [visto, setVisto] = useState(vence);
  if (visto !== vence) {
    setVisto(vence);
    setQuedan(calcular());
  }
  const corriendo = quedan > 0;
  useEffect(() => {
    if (!corriendo) return;
    const t = setInterval(() => setQuedan(calcular()), 1000);
    return () => clearInterval(t);
  }, [corriendo, calcular]);
  return quedan;
}

/** «14:05» de una cuenta en segundos. */
export const minutosSegundos = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** «hace 3 días», «ayer», «hace 20 min»; lo más viejo, con fecha. */
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.floor((ahora - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min)) return "";
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  return `el ${formatDateShort(iso)}`;
}

/** La fecha más reciente de una lista (ISO), o `null` si ninguna tiene. */
export function masReciente(fechas: (string | null | undefined)[]): string | null {
  let mejor: string | null = null;
  for (const f of fechas) if (f && (!mejor || new Date(f) > new Date(mejor))) mejor = f;
  return mejor;
}

/** «usado hace 3 días» / «sin usar todavía»: el último uso de un canal en una frase. */
export const usoDe = (iso: string | null) => (iso ? `usado ${haceCuanto(iso)}` : "sin usar todavía");
