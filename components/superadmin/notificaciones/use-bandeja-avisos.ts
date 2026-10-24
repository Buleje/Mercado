"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import type { BandejaAvisos } from "@/lib/superadmin/nivel-aviso";

/** Cada cuánto se refresca la campana (el mismo minuto de siempre). */
const CADA_MS = 60_000;

/**
 * La bandeja del superadmin: un pedido al montar, uno por minuto con la pestaña
 * visible y uno al abrir el modal. Los mismos pedidos que hacía la campana con
 * su cajón lateral.
 *
 * - FIX 2026-05-06: el pedido en vuelo se aborta antes de lanzar otro (el
 *   segundo pisaba al primero en `setData`).
 * - QA Brandon 2026-06-10: al primer 401/403 se deja de pedir (sesión vencida;
 *   el aviso de «sesión expirada» del shell manda al login).
 */
export function useBandejaAvisos(abierto: boolean) {
  const [data, setData] = useState<BandejaAvisos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [detenido, setDetenido] = useState(false);
  const detenidoRef = useRef(false);
  const enVuelo = useRef<AbortController | null>(null);

  const cargar = useCallback(async () => {
    if (detenidoRef.current) return;
    enVuelo.current?.abort();
    const ctrl = new AbortController();
    enVuelo.current = ctrl;
    setCargando(true);
    try {
      const r = await fetch("/api/superadmin/notifications/inbox", {
        credentials: "include",
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (r.status === 401 || r.status === 403) {
        detenidoRef.current = true;
        setDetenido(true);
        return;
      }
      if (ctrl.signal.aborted) return;
      if (!r.ok) {
        setFallo(true);
        return;
      }
      const json = (await r.json()) as BandejaAvisos;
      setFallo(false);
      // Sin re-render si llegó lo mismo.
      setData((prev) => (JSON.stringify(prev) === JSON.stringify(json) ? prev : json));
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setFallo(true);
    } finally {
      if (!ctrl.signal.aborted) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    return () => enVuelo.current?.abort();
  }, [cargar]);

  useVisiblePolling(cargar, CADA_MS, !detenido);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  return { data, cargando, fallo, recargar: cargar };
}
