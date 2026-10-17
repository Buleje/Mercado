"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { getActiveTenantSlug } from "@/lib/tenant-cache";
import {
  claveDeFila, encolarVenta, esDelNegocio, fusionarTrasSincronizar, sincronizarCola, volverAPoner,
  type Negocio, type VentaEnCola,
} from "./cola-offline";

const QUEUE_KEY = "pos-offline-queue";
/** Aviso entre instancias del hook en la misma pestaña (el evento `storage` sólo llega a las otras). */
const AVISO_COLA = "pos-offline-queue:cambio";
/**
 * Negocio de la última sesión vista (revisión 17-10): sin conexión no se puede
 * preguntar `/api/auth/me`, y la venta se marca con el negocio del TOKEN, no con
 * la cookie `active-tenant-slug` (dos caminos de login no la escriben). La
 * sesión es una por navegador, así que alcanza con una clave.
 */
const SESION_KEY = "pos-offline-sesion";

function negocioGuardado(): Negocio {
  let tenantId: string | null = null;
  try { tenantId = localStorage.getItem(SESION_KEY); } catch { /* sin almacenamiento */ }
  return { tenantId, slug: getActiveTenantSlug() };
}

/**
 * El negocio de la sesión, preguntado al servidor. `null` = sin sesión (o
 * vencida); lanza si no hay conexión.
 */
async function negocioDeLaSesion(): Promise<Negocio | null> {
  const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
  const me = (await res.json().catch(() => null)) as { authenticated?: boolean; tenantId?: string } | null;
  if (!res.ok || !me?.authenticated || !me.tenantId) return null;
  try { localStorage.setItem(SESION_KEY, me.tenantId); } catch { /* sin almacenamiento */ }
  return { tenantId: me.tenantId, slug: getActiveTenantSlug() };
}

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
  /** Negocio abierto (id de la sesión + slug para las ventas viejas). */
  const [negocio, setNegocio] = useState<Negocio>({ tenantId: null, slug: null });
  const negocioRef = useRef<Negocio>({ tenantId: null, slug: null });
  /** Hora en que se vuelve a mandar sola (el servidor contestó 429 con `Retry-After`). */
  const [reintentaEn, setReintentaEn] = useState<number | null>(null);
  const esperaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const fijarNegocio = useCallback((n: Negocio) => {
    negocioRef.current = n;
    setNegocio(n);
  }, []);

  /** Recalcula lo que se pinta (sólo cuenta lo de ESTE negocio). */
  const pintar = useCallback((queue: OfflineSale[]) => {
    const propias = queue.filter((s) => esDelNegocio(s, negocioRef.current));
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

    // Nada que mandar: todo «No pasó». Lo de otro negocio se decide con la sesión de abajo.
    if (getQueue().every(s => s._hasError)) return;

    isSyncingRef.current = true;
    sincronizandoEnLaPestana = true;
    setIsSyncing(true);
    if (esperaRef.current) { clearTimeout(esperaRef.current); esperaRef.current = null; }
    setReintentaEn(null);

    try {
      // Revisión 17-10: el negocio sale de la sesión (no de la cookie) y sin
      // sesión no se manda nada (antes: un 401 por venta, todas «No pasó»).
      let sesion: Negocio | null;
      try {
        sesion = await negocioDeLaSesion();
      } catch {
        return; // sin conexión: quedan pendientes
      }
      if (!sesion) return;
      fijarNegocio(sesion);

      // Sin marcas internas; la clave (idempotencyKey) viaja: si el primer
      // intento ya llegó, el servidor devuelve esa venta en vez de crear otra.
      const { resultados, guardadas, esperarMs } = await sincronizarCola(getQueue(), sesion, (cuerpo) =>
        fetch("/api/sales", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(cuerpo),
        }),
      );

      // Sobre la cola de AHORA: lo descartado mientras se mandaba no vuelve y
      // lo encolado mientras tanto no se pierde.
      guardar(fusionarTrasSincronizar(getQueue(), resultados));
      setLastSyncCount(guardadas);

      if (esperarMs != null) {
        // 429: el servidor dijo cuánto esperar; se vuelve a mandar sola.
        setReintentaEn(Date.now() + esperarMs);
        esperaRef.current = setTimeout(() => {
          esperaRef.current = null;
          void syncQueueRef.current();
        }, esperarMs);
      }
    } finally {
      // Y5: siempre liberar el mutex, incluso ante errores inesperados
      isSyncingRef.current = false;
      sincronizandoEnLaPestana = false;
      setIsSyncing(false);
    }
  }, [getQueue, guardar, fijarNegocio]);
  /** El temporizador del 429 llama a la versión vigente de `syncQueue`. */
  const syncQueueRef = useRef(syncQueue);
  useEffect(() => { syncQueueRef.current = syncQueue; }, [syncQueue]);

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

    // Count pending and errors on mount (con el negocio de la última sesión vista)
    fijarNegocio(negocioGuardado());
    const q = getQueue();
    guardar(q);

    // Auto-sync on mount if online and there are pending items (el negocio lo decide la sesión)
    if (typeof navigator !== "undefined" && navigator.onLine && q.some(s => !s._hasError)) {
      syncQueue();
    } else if (typeof navigator !== "undefined" && navigator.onLine) {
      // Sin nada que mandar igual se fija el negocio de la sesión, para marcar
      // bien la próxima venta que se encole sin conexión.
      negocioDeLaSesion()
        .then((n) => { if (n) { fijarNegocio(n); pintar(getQueue()); } })
        .catch((err) => console.warn("[pos-offline] no se pudo leer la sesión", err));
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(AVISO_COLA, onCambio);
    };
  }, [getQueue, guardar, pintar, syncQueue, fijarNegocio]);

  useEffect(() => () => { if (esperaRef.current) clearTimeout(esperaRef.current); }, []);

  /** Remove only items marked as errored (de este negocio) */
  const clearErrors = useCallback(() => {
    guardar(getQueue().filter(s => !(s._hasError && esDelNegocio(s, negocioRef.current))));
  }, [getQueue, guardar]);

  /** Wipe the offline queue of THIS business (pending and errored); la de otro negocio queda. */
  const clearQueue = useCallback(() => {
    guardar(getQueue().filter(s => !esDelNegocio(s, negocioRef.current)));
  }, [getQueue, guardar]);

  /** Descarta UNA venta de la cola (por su clave). */
  const descartar = useCallback((clave: string) => {
    guardar(getQueue().filter(s => claveDeFila(s) !== clave));
  }, [getQueue, guardar]);

  /** «Reintentar» una venta «No pasó»: vuelve a la fila con la MISMA clave y se manda. */
  const reintentar = useCallback((clave: string) => {
    guardar(volverAPoner(getQueue(), clave));
    void syncQueue();
  }, [getQueue, guardar, syncQueue]);

  const addToQueue = useCallback(
    (sale: Record<string, unknown>, extra?: { total?: number }) => {
      // SECURITY 2026-05-05 (audit POS #5): idempotencyKey por venta; el server
      // dedupe por la misma clave. M59 (17-10): se CONSERVA la clave con la que
      // salió el primer POST (antes nacía otra acá y un POST que llegó sin
      // respuesta se creaba dos veces al sincronizar).
      const n = negocioRef.current;
      guardar(encolarVenta(getQueue(), sale, { tenant: n.slug ?? getActiveTenantSlug(), tenantId: n.tenantId, total: extra?.total }));
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
    reintentar,
    negocio,
    reintentaEn,
  };
}
