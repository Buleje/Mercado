"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { getActiveTenantSlug } from "@/lib/tenant-cache";
import { cuerpoParaEnviar, encolarVenta, esDelNegocio, type VentaEnCola } from "./cola-offline";

const QUEUE_KEY = "pos-offline-queue";
/** Aviso entre instancias del hook en la misma pestaña (el evento `storage` sólo llega a las otras). */
const AVISO_COLA = "pos-offline-queue:cambio";

/**
 * Una sola sincronización por pestaña (17-10): POSView y POSCajaModule montan
 * este hook cada uno y, con el candado por instancia, los dos mandaban la
 * misma cola a la vez (QA: el mismo POST dos veces). La clave evita la venta
 * doble, pero si el segundo POST chocaba, esa venta quedaba como «No pasó».
 */
let sincronizandoEnLaPestana = false;

/** Una venta en la cola (detalle y reglas en `./cola-offline`, M59). */
export type OfflineSale = VentaEnCola;

export function usePOSOffline() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncCount, setLastSyncCount] = useState(0);
  /** La cola entera, para listarla (M59): antes sólo se veía «N pendientes». */
  const [cola, setCola] = useState<OfflineSale[]>([]);
  // Y5 FIX 2026-05-07: mutex para syncQueue. useState(isSyncing) no es
  // suficiente porque los closures de useCallback capturan el valor al momento
  // de la creación, no el actual. useRef sí lee el valor real en tiempo de ejecución,
  // evitando que dos llamadas a syncQueue (ej: "online" event + mount) corran en paralelo.
  const isSyncingRef = useRef(false);

  const getQueue = useCallback((): OfflineSale[] => {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch {
      return [];
    }
  }, []);

  /** Recalcula lo que se pinta (sólo cuenta lo de ESTE negocio). */
  const pintar = useCallback((queue: OfflineSale[]) => {
    const tenant = getActiveTenantSlug();
    const propias = queue.filter((s) => esDelNegocio(s, tenant));
    setCola(queue);
    setPendingCount(propias.filter((s) => !s._hasError).length);
    setErrorCount(propias.filter((s) => s._hasError).length);
  }, []);

  /** Guarda la cola y avisa a la otra instancia del hook (la barra y el contador de la pestaña). */
  const guardar = useCallback((queue: OfflineSale[]) => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    pintar(queue);
    window.dispatchEvent(new Event(AVISO_COLA));
  }, [pintar]);

  const syncQueue = useCallback(async () => {
    // Y5: mutex — evita ejecuciones paralelas (ej: evento "online" + mount simultáneos)
    if (isSyncingRef.current || sincronizandoEnLaPestana) return;

    const queue = getQueue();
    const tenant = getActiveTenantSlug();
    if (queue.length === 0) return;
    // Don't run if every item of THIS business is already marked as errored
    if (queue.every(s => s._hasError || !esDelNegocio(s, tenant))) return;

    isSyncingRef.current = true;
    sincronizandoEnLaPestana = true;
    setIsSyncing(true);

    const remaining: OfflineSale[] = [];
    let synced = 0;

    try {
      for (const sale of queue) {
        if (sale._hasError || !esDelNegocio(sale, tenant)) {
          // M59: la venta de otro negocio espera a que se abra ese negocio
          // (antes se mandaba con la sesión abierta y entraba al negocio equivocado).
          remaining.push(sale);
          continue;
        }

        try {
          // Sin marcas internas; la clave (idempotencyKey) viaja: si el primer
          // intento ya llegó, el servidor devuelve esa venta en vez de crear otra.
          const res = await fetch("/api/sales", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(cuerpoParaEnviar(sale)),
          });

          if (res.ok) {
            synced++;
          } else {
            // Any non-ok HTTP response: mark as fatal error so it doesn't block the queue indefinitely
            let errMsg = `Error HTTP ${res.status}`;
            try {
              const errData = await res.json();
              if (errData?.error) {
                errMsg = typeof errData.error === "string" ? errData.error : JSON.stringify(errData.error);
              }
            } catch { /* ignore parse error */ }

            remaining.push({ ...sale, _hasError: true, _errorMessage: errMsg });
          }
        } catch {
          // Network failure — keep as pending for retry
          remaining.push(sale);
        }
      }

      // Lo que se encoló MIENTRAS se sincronizaba (otra venta sin conexión) no se pierde.
      const nuevas = getQueue().filter((s) => !queue.some((q) => q.idempotencyKey === s.idempotencyKey && q._offlineId === s._offlineId));
      guardar([...remaining, ...nuevas]);
      setLastSyncCount(synced);
    } finally {
      // Y5: siempre liberar el mutex, incluso ante errores inesperados
      isSyncingRef.current = false;
      sincronizandoEnLaPestana = false;
      setIsSyncing(false);
    }
  }, [getQueue, guardar]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      syncQueue();
    };
    const onOffline = () => setIsOnline(false);
    const onCambio = () => pintar(getQueue());

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(AVISO_COLA, onCambio);

    // Count pending and errors on mount
    const q = getQueue();
    guardar(q);
    const tenant = getActiveTenantSlug();
    const pending = q.filter(s => !s._hasError && esDelNegocio(s, tenant));

    // Auto-sync on mount if online and there are pending items
    if (typeof navigator !== "undefined" && navigator.onLine && pending.length > 0) {
      syncQueue();
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(AVISO_COLA, onCambio);
    };
  }, [getQueue, guardar, pintar, syncQueue]);

  /** Remove only items marked as errored (de este negocio) */
  const clearErrors = useCallback(() => {
    const tenant = getActiveTenantSlug();
    guardar(getQueue().filter(s => !(s._hasError && esDelNegocio(s, tenant))));
  }, [getQueue, guardar]);

  /** Wipe the offline queue of THIS business (pending and errored); la de otro negocio queda. */
  const clearQueue = useCallback(() => {
    const tenant = getActiveTenantSlug();
    guardar(getQueue().filter(s => !esDelNegocio(s, tenant)));
  }, [getQueue, guardar]);

  /** Descarta UNA venta de la cola (por su clave). */
  const descartar = useCallback((clave: string) => {
    guardar(getQueue().filter(s => (s.idempotencyKey ?? String(s._offlineId)) !== clave));
  }, [getQueue, guardar]);

  const addToQueue = useCallback(
    (sale: Record<string, unknown>, extra?: { total?: number }) => {
      // SECURITY 2026-05-05 (audit POS #5): idempotencyKey por venta; el server
      // dedupe por la misma clave. M59 (17-10): se CONSERVA la clave con la que
      // salió el primer POST (antes nacía otra acá y un POST que llegó sin
      // respuesta se creaba dos veces al sincronizar).
      guardar(encolarVenta(getQueue(), sale, { tenant: getActiveTenantSlug(), total: extra?.total }));
    },
    [getQueue, guardar]
  );

  return {
    isOnline,
    pendingCount,
    errorCount,
    isSyncing,
    lastSyncCount,
    addToQueue,
    syncQueue,
    clearErrors,
    clearQueue,
    cola,
    descartar,
  };
}
