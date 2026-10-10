"use client";

/**
 * use-tarifa-aserrio — leer, guardar y quitar versiones de la tarifa de
 * aserrío (ADR-412). El tarifario vive en un `PlatformSetting` (mismo criterio
 * que el catálogo de especies, ADR-410 §1): no hay lista para paginar, sólo un
 * puñado de versiones por fecha de vigencia.
 *
 * `cotizarAserrio`/`versionVigente`/`explicarPrecio` — la aritmética y el texto
 * de cada línea — viven en `lib/forestal/tarifa-aserrio.ts`, PURO. Acá sólo el
 * fetch.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  normalizarTarifario,
  TARIFARIO_VACIO,
  type BaseDelBorrador,
  type Tarifario,
  type VersionTarifaInput,
} from "@/lib/forestal/tarifa-aserrio";

const API = "/api/admin/forestal/tarifa-aserrio";

export function useTarifaAserrio() {
  const [tarifario, setTarifario] = useState<Tarifario>(TARIFARIO_VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(API, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { tarifario?: unknown };
      setTarifario(normalizarTarifario(j.tarifario));
      setError(null);
    } catch {
      /* Sin tarifa se sigue declarando producción igual: `cotizarAserrio` avisa
         "no hay tarifa vigente" y no cobra — esto es una ayuda para armarla, no
         un requisito para el libro. */
      setError("No se pudo leer la tarifa de aserrío.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** PUT: agrega o reemplaza la versión de esa fecha. Devuelve el `message` del
   *  422 TAL CUAL para mostrarlo, o `null` si guardó bien. */
  const guardar = useCallback(async (input: VersionTarifaInput): Promise<string | null> => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(API, {
        method: "PUT",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input),
      });
      const j = (await r.json().catch(() => ({}))) as { tarifario?: unknown; message?: string };
      if (!r.ok) {
        const motivo = j.message ?? `El servidor respondió ${r.status}`;
        setError(motivo);
        return motivo;
      }
      setTarifario(normalizarTarifario(j.tarifario));
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return msg;
    } finally {
      setGuardando(false);
    }
  }, []);

  /**
   * El borrador armado con la producción real (ADR-412): las especies y los
   * tipos que este aserradero de verdad trabaja, con los precios en 0 — nunca
   * se guarda tal cual, `revisarVersion` lo rechaza a propósito. `null` si no
   * se pudo leer (sin corridas registradas, o falló el pedido).
   */
  const cargarBorrador = useCallback(async (): Promise<{ borrador: VersionTarifaInput; base: BaseDelBorrador } | null> => {
    try {
      const r = await fetch(`${API}?borrador=1`, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as { borrador: VersionTarifaInput; base: BaseDelBorrador };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const quitar = useCallback(async (id: string): Promise<boolean> => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`${API}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfHeaders(),
      });
      const j = (await r.json().catch(() => ({}))) as { tarifario?: unknown; message?: string };
      if (!r.ok) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
      setTarifario(normalizarTarifario(j.tarifario));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setGuardando(false);
    }
  }, []);

  return { tarifario, cargando, guardando, error, guardar, quitar, recargar, cargarBorrador };
}
