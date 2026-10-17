"use client";

/**
 * use-cola-monte — la cola «Por imprimir» del monte (16-10): la lee, mete
 * guías, les cambia el estado y guarda el celular del monte. Habla sólo con
 * `/api/admin/forestal/loth/gtf-cola`. Cada respuesta trae el trabajo ya
 * cambiado y se aplica en el sitio, sin volver a pedir la cola.
 *
 * Vuelve a leer cuando la pestaña regresa a primer plano: el celular del monte
 * queda abierto en la cola y la oficina sigue mandando guías.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { HojaSalida } from "@/lib/forestal/gtf-salida-tipos";
import type { ContactoMonte, TrabajoCola } from "@/lib/forestal/gtf-cola-monte";
import { PERFIL_MONTE_ID } from "@/lib/forestal/gtf-matricial-perfiles";

export const RUTA_COLA = "/api/admin/forestal/loth/gtf-cola";

export interface ColaMonte {
  trabajos: TrabajoCola[];
  contacto: ContactoMonte | null;
}

export type Respuesta<T> = { ok: true; valor: T } | { ok: false; mensaje: string };

export type CambioTrabajo =
  | { accion: "impresa" }
  | { accion: "foto"; fotoDocId: string }
  | { accion: "confirmar"; numeroHoja: string; fotoDocId?: string }
  | { accion: "anular"; motivo?: string };

async function mensajeDe(res: Response, porDefecto: string): Promise<string> {
  const j = (await res.json().catch((err: unknown) => {
    logger.warn("[cola-monte] respuesta sin JSON", { status: res.status, error: String(err) });
    return null;
  })) as { message?: string } | null;
  return j?.message ?? porDefecto;
}

async function escribir<T>(metodo: "POST" | "PATCH", body: unknown, porDefecto: string): Promise<Respuesta<T> & { status?: number }> {
  try {
    const res = await fetch(RUTA_COLA, {
      method: metodo,
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, mensaje: await mensajeDe(res, porDefecto), status: res.status };
    return { ok: true, valor: (await res.json()) as T };
  } catch (e) {
    logger.warn("[cola-monte] sin red", { error: String(e) });
    return { ok: false, mensaje: "Sin señal: no se guardó. Prueba de nuevo." };
  }
}

export function useColaMonte({ activo = true }: { activo?: boolean } = {}) {
  const [datos, setDatos] = useState<ColaMonte | null>(null);
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState<string | null>(null);
  /** Sólo vale la última lectura: una vieja que llega tarde no pisa a la nueva. */
  const pedido = useRef(0);

  const recargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    try {
      const res = await fetch(RUTA_COLA, { credentials: "include" });
      if (n !== pedido.current) return;
      if (!res.ok) {
        setError(await mensajeDe(res, `No se pudo leer la cola (HTTP ${res.status}).`));
        return;
      }
      setDatos((await res.json()) as ColaMonte);
      setError(null);
    } catch {
      if (n === pedido.current) setError("Sin señal: no se pudo leer la cola.");
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    void recargar();
    const alVolver = () => {
      if (document.visibilityState === "visible") void recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [activo, recargar]);

  /** Pone el trabajo cambiado en su lugar (o arriba, si es nuevo). */
  const aplicar = useCallback((t: TrabajoCola) => {
    setDatos((d) => {
      const trabajos = d?.trabajos ?? [];
      const ya = trabajos.some((x) => x.id === t.id);
      return { contacto: d?.contacto ?? null, trabajos: ya ? trabajos.map((x) => (x.id === t.id ? t : x)) : [t, ...trabajos] };
    });
  }, []);

  const enviar = useCallback(
    async (o: { gtfId: string; hojas: HojaSalida[]; perfilId: string; contacto?: string; reimprimir?: { motivo: string } }) => {
      const r = await escribir<{ trabajo: TrabajoCola; reenviado: boolean; contacto: ContactoMonte | null }>("POST", o, "No se pudo mandar al monte.");
      if (r.ok) {
        aplicar(r.valor.trabajo);
        setDatos((d) => (d ? { ...d, contacto: r.valor.contacto } : d));
      }
      return r;
    },
    [aplicar],
  );

  const cambiar = useCallback(
    async (id: string, cambio: CambioTrabajo): Promise<Respuesta<TrabajoCola>> => {
      const r = await escribir<{ trabajo: TrabajoCola }>("PATCH", { id, ...cambio }, "No se pudo guardar.");
      if (!r.ok) return r;
      aplicar(r.valor.trabajo);
      return { ok: true, valor: r.valor.trabajo };
    },
    [aplicar],
  );

  return { datos, cargando, error, recargar, enviar, cambiar, aplicar };
}

/** Las impresoras calibradas del talonario (carril salida; «Oficina» primero). Sin leer: «Monte», que viene de fábrica. */
export const RUTA_PERFILES = "/api/admin/forestal/loth/gtf-matricial/perfiles";
export const PERFIL_MONTE = { id: PERFIL_MONTE_ID, nombre: "Monte" } as const;

export function usePerfilesImpresora(activo: boolean) {
  const [perfiles, setPerfiles] = useState<{ id: string; nombre: string }[]>([PERFIL_MONTE]);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    fetch(RUTA_PERFILES, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const j = (await res.json()) as { perfiles?: { id?: unknown; nombre?: unknown }[] };
        const lista = (j.perfiles ?? [])
          .filter((p): p is { id: string; nombre: string } => typeof p.id === "string" && typeof p.nombre === "string")
          .map((p) => ({ id: p.id, nombre: p.nombre }));
        if (vivo && lista.length) setPerfiles(lista);
      })
      .catch((err: unknown) => logger.warn("[cola-monte] perfiles sin leer", { error: String(err) }));
    return () => {
      vivo = false;
    };
  }, [activo]);
  return perfiles;
}
