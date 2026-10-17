"use client";

/**
 * Los vínculos de UNA parte del Directorio (ADR-430): con otra parte o con un
 * permiso. Leerlos, crear uno y darlo de baja.
 *
 * `parteId` null = la ficha todavía no existe (alta): no se pide nada; los
 * vínculos del alta esperan en la pantalla y se crean con
 * `crearVinculosPendientes` cuando el servidor devuelve la ficha con su id.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  vinculoParteInputSchema,
  type VinculoParte,
  type VinculoParteInput,
} from "@/lib/forestal/vinculos-parte";

const URL_BASE = "/api/admin/forestal/directorio/vinculos";

/** Un vínculo cargado en el alta, antes de que la ficha tenga id. */
export type VinculoPendiente = Omit<VinculoParteInput, "parteId"> & {
  /** Identidad local de la fila y el nombre que se muestra mientras espera. */
  clave: string;
  etiqueta: string;
};

async function motivo(r: Response, quePedia: string): Promise<string> {
  const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
  return j.message ?? j.error ?? `No se pudo ${quePedia} (${r.status})`;
}

/** Valida y crea UN vínculo. Devuelve el creado o el motivo del rechazo. */
export async function crearVinculo(
  input: VinculoParteInput,
): Promise<{ vinculo: VinculoParte | null; error: string | null }> {
  const v = vinculoParteInputSchema.safeParse(input);
  if (!v.success)
    return {
      vinculo: null,
      error: v.error.issues[0]?.message ?? "El vínculo no se puede guardar así.",
    };
  try {
    const r = await fetch(URL_BASE, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(v.data),
    });
    if (!r.ok) return { vinculo: null, error: await motivo(r, "guardar el vínculo") };
    const j = (await r.json().catch(() => ({}))) as { vinculo?: VinculoParte };
    return { vinculo: j.vinculo ?? null, error: null };
  } catch (e) {
    return { vinculo: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Crea los vínculos que quedaron esperando el id de una ficha recién dada de
 * alta. De a uno: si uno falla, los demás igual entran y el aviso dice cuál.
 */
export async function crearVinculosPendientes(
  parteId: string,
  pendientes: readonly VinculoPendiente[],
): Promise<{ errores: string[] }> {
  const errores: string[] = [];
  for (const { clave: _clave, etiqueta, ...resto } of pendientes) {
    const r = await crearVinculo({ ...resto, parteId });
    if (r.error) errores.push(`${etiqueta}: ${r.error}`);
  }
  return { errores };
}

export function useVinculosParte(parteId: string | null | undefined) {
  const [vinculos, setVinculos] = useState<VinculoParte[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Una respuesta vieja (de otra ficha abierta antes) no pisa la de ahora. */
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const id = parteId?.trim();
    const mio = ++pedido.current;
    if (!id) {
      setVinculos([]);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`${URL_BASE}?parteId=${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await motivo(r, "leer los vínculos"));
      const j = (await r.json()) as { vinculos?: VinculoParte[] };
      if (mio === pedido.current) setVinculos(j.vinculos ?? []);
    } catch (e) {
      if (mio === pedido.current) setError(e instanceof Error ? e.message : String(e));
      logger.warn("[vinculos-parte] lectura fallida", { parteId: id, error: String(e) });
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  }, [parteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = useCallback(
    async (input: VinculoParteInput): Promise<string | null> => {
      const r = await crearVinculo(input);
      if (r.error) return r.error;
      await cargar();
      return null;
    },
    [cargar],
  );

  const quitar = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        const r = await fetch(`${URL_BASE}?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
          headers: csrfHeaders(),
        });
        if (!r.ok) return await motivo(r, "quitar el vínculo");
        await cargar();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    [cargar],
  );

  return { vinculos, cargando, error, recargar: cargar, crear, quitar };
}
