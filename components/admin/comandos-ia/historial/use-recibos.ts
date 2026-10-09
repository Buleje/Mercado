"use client";

/**
 * Datos de «Lo que hizo la IA»: recibos (`/api/admin/comandos-ia/recibos`),
 * cuántas acciones del agente esperan tu OK y el Deshacer de precios.
 * Días y horas en hora de Lima («jueves 10/09», regla de copy del panel).
 */

import { useCallback, useEffect, useState } from "react";
import { limaDateKey } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

/** Espejo de `ReciboIA` de app/api/admin/comandos-ia/recibos/route.ts (server-only). */
export interface ReciboIA {
  id: string;
  tipo: string;
  resumen: string;
  filas: number | null;
  costoIaUsd: number | null;
  user: string;
  createdAt: string;
  entityId: string | null;
  deshecho: boolean;
}

const URL_RECIBOS = "/api/admin/comandos-ia/recibos";

export function useRecibos() {
  const [recibos, setRecibos] = useState<ReciboIA[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(URL_RECIBOS, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        setError(
          res.status === 403
            ? "Tu rol no puede ver lo que hizo la IA."
            : `No se pudieron leer los recibos (error ${res.status}).`,
        );
        return;
      }
      const data = (await res.json()) as { recibos?: ReciboIA[] };
      setRecibos(Array.isArray(data.recibos) ? data.recibos : []);
      setError(null);
    } catch {
      setError("Sin conexión: no se pudo leer lo que hizo la IA.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { recibos, cargando, error, recargar };
}

/** Cuenta de pendientes de la respuesta de `/api/ai-assistant/approvals`; null si no la trae. */
export function contarPendientes(d: unknown): number | null {
  if (!d || typeof d !== "object") return null;
  const r = d as { count?: unknown; pending?: unknown };
  if (typeof r.count === "number") return r.count;
  return Array.isArray(r.pending) ? r.pending.length : null;
}

/**
 * Cuántas acciones del agente (Chat IA) esperan aprobación. Arranca en 0 y, si una
 * lectura falla (429 del límite, red caída), CONSERVA el último valor: leerlo como 0
 * escondía «Esperando tu OK» aunque la aprobación seguía viva. 401/403 = sin permiso → 0.
 */
export function usePendientesOK(intervaloMs = 20_000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    const leer = () =>
      fetch("/api/ai-assistant/approvals", { credentials: "include", cache: "no-store" })
        .then(async (r) => {
          if (r.status === 401 || r.status === 403) return 0;
          if (!r.ok) return null;
          return contarPendientes(await r.json().catch(() => null));
        })
        .then((cuenta) => {
          if (vivo && cuenta !== null) setN(cuenta);
        })
        .catch(() => {
          /* Sin red: se queda con lo último que se supo. */
        });
    void leer();
    const t = setInterval(leer, intervaloMs);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [intervaloMs]);
  return n;
}

/**
 * Lo que contesta `/api/admin/comandos-ia/precios/deshacer` (carril precios):
 * - 200 `{ deshechas, noDeshechas:[{nombre}] }` → PARCIAL: vuelven los que nadie tocó; los que alguien
 *   cambió después se quedan como están.
 * - 409 `{ error:"nada-que-deshacer"|"ya-deshecho", mensaje, noDeshechas? }`: `error` es un CÓDIGO;
 *   lo que se lee es `mensaje`. 404/422 = el recibo no sirve.
 * `final`: reintentar no cambia nada → el modal ofrece «Entendido» en vez de repetir el botón;
 * sin conexión o un 500 sí se reintenta.
 */
export type ResultadoDeshacer =
  | { ok: true; deshechas: number | null; noDeshechas: string[] }
  | { ok: false; mensaje: string; final: boolean };

/** Nombres de `noDeshechas` (o lo que el servidor mande en su lugar). */
function nombresDe(data: Record<string, unknown> | null): string[] {
  const lista = data?.noDeshechas;
  if (!Array.isArray(lista)) return [];
  return lista
    .map((x) =>
      x && typeof x === "object" && typeof (x as { nombre?: unknown }).nombre === "string"
        ? (x as { nombre: string }).nombre
        : null,
    )
    .filter((n): n is string => !!n);
}

/** «Arroz, Azúcar y 3 más». */
export function listaCorta(nombres: string[], max = 3): string {
  if (nombres.length <= max) return nombres.join(", ");
  return `${nombres.slice(0, max).join(", ")} y ${nombres.length - max} más`;
}

/** POST a la ruta de Deshacer del carril de precios, con un mensaje que se entiende. */
export async function deshacerPrecios(reciboId: string): Promise<ResultadoDeshacer> {
  try {
    const res = await fetch("/api/admin/comandos-ia/precios/deshacer", {
      method: "POST",
      credentials: "include",
      // Sin el token CSRF el proxy contesta 403 y se leía como «solo el administrador» (09-10).
      headers: csrfHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ reciboId }),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const nombres = nombresDe(data);
    if (res.ok) {
      return {
        ok: true,
        deshechas: typeof data?.deshechas === "number" ? data.deshechas : null,
        noDeshechas: nombres,
      };
    }
    // `mensaje` es la frase; `error` a veces es un código («ya-deshecho»): ése no se muestra.
    const delServidor =
      typeof data?.mensaje === "string"
        ? data.mensaje
        : typeof data?.error === "string" && !/^[a-z-]+$/.test(data.error)
          ? data.error
          : null;
    if (res.status === 404 || res.status === 422) {
      return {
        ok: false,
        final: true,
        mensaje: delServidor ?? "Ese cambio ya no se puede deshacer.",
      };
    }
    if (res.status === 409) {
      const cuales = nombres.length ? ` Cambiaron: ${listaCorta(nombres)}.` : "";
      return {
        ok: false,
        final: true,
        mensaje: `${delServidor ?? "Esos precios cambiaron después: no se tocó ninguno."}${cuales}`,
      };
    }
    if (res.status === 403) {
      // 403 = rol sin permiso, o token CSRF vencido (pestaña abierta mucho rato): ése se arregla recargando.
      return /csrf/i.test(String(data?.error ?? ""))
        ? { ok: false, final: false, mensaje: "Tu sesión se renovó: recarga la página y vuelve a intentar." }
        : { ok: false, final: true, mensaje: "Solo el administrador puede deshacer precios." };
    }
    return {
      ok: false,
      final: false,
      mensaje: delServidor ?? `No se pudo deshacer (error ${res.status}).`,
    };
  } catch {
    return { ok: false, final: false, mensaje: "Sin conexión: no se deshizo nada." };
  }
}

// ── Formato ──────────────────────────────────────────────────────────────────

/** Dólares de IA: el formato único de la pestaña vive en papel/formato.ts. */
export { usd } from "../papel/formato";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const dos = (n: number) => String(n).padStart(2, "0");

/** «Hoy», «Ayer» o «martes 07/10» (con «/2025» si es de otro año), sobre la clave YYYY-MM-DD de Lima. */
export function etiquetaDia(clave: string, hoy = limaDateKey()): string {
  if (clave === hoy) return "Hoy";
  const [y, m, d] = clave.split("-").map(Number);
  const fecha = Date.UTC(y, m - 1, d);
  const [hy, hm, hd] = hoy.split("-").map(Number);
  if (Date.UTC(hy, hm - 1, hd) - fecha === 86_400_000) return "Ayer";
  const dia = DIAS[new Date(fecha).getUTCDay()];
  return `${dia} ${dos(d)}/${dos(m)}${y !== hy ? `/${y}` : ""}`;
}

/** «10:42» en hora de Lima. */
export function horaLima(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** «Hoy 10:42», «Ayer 18:05» o «martes 07/10 09:12»: cuándo fue, sin depender del grupo. */
export function cuandoLima(iso: string): string {
  return `${etiquetaDia(limaDateKey(iso))} ${horaLima(iso)}`;
}

export interface GrupoDia {
  clave: string;
  etiqueta: string;
  recibos: ReciboIA[];
}

/** Agrupa por día de Lima respetando el orden (más nuevo primero) que ya trae la API. */
export function agruparPorDia(recibos: ReciboIA[]): GrupoDia[] {
  const hoy = limaDateKey();
  const grupos: GrupoDia[] = [];
  for (const r of recibos) {
    const clave = limaDateKey(r.createdAt);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.clave === clave) ultimo.recibos.push(r);
    else grupos.push({ clave, etiqueta: etiquetaDia(clave, hoy), recibos: [r] });
  }
  return grupos;
}
