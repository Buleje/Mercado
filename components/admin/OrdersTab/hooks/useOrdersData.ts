"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef, type SetStateAction } from "react";
import { toast } from "sonner";
import type { DbOrder } from "@/lib/jsondb";
import { fetchAllOrders } from "@/lib/admin-helpers";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { useAbrirFichaAlLlegar } from "@/hooks/use-abrir-ficha-al-llegar";

export interface OrdersDataState {
  orders: DbOrder[];
  loading: boolean;
  loadError: string | null;
  storeLat: number | null;
  storeLon: number | null;
  storeName: string;
  detailOrder: DbOrder | null;
}

export interface OrdersDataActions {
  load: () => Promise<void>;
  setOrders: React.Dispatch<React.SetStateAction<DbOrder[]>>;
  setLoadError: React.Dispatch<React.SetStateAction<string | null>>;
  /** Abre/cierra el panel del pedido Y escribe `?pedido=` (el «atrás» lo cierra). */
  setDetailOrder: (accion: SetStateAction<DbOrder | null>) => void;
}

const ID_AVISO_ABRIR = "abrir-pedido-por-enlace";

/** El pedido que pide el enlace y no está en la lista (archivado, de otro día): por id. */
async function traerPedido(id: string): Promise<DbOrder | "no-existe" | "error"> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`);
    if (res.status === 404) return "no-existe";
    if (!res.ok) return "error";
    return (await res.json()) as DbOrder;
  } catch {
    return "error";
  }
}

export function useOrdersData(): OrdersDataState & OrdersDataActions {
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLon, setStoreLon] = useState<number | null>(null);
  const [storeName, setStoreName] = useState("Buleje");
  const [detailOrder, setDetalle] = useState<DbOrder | null>(null);

  /* La ficha abierta también vive en la URL (`?pedido=<id>`, lib/admin/enlaces-panel):
     llegar por enlace la abre, el «atrás» la cierra, abrirla a mano la escribe. */
  const ficha = useFichaEnUrl("pedido");
  const { abrir: abrirEnUrl, cerrar: cerrarEnUrl } = ficha;
  const actual = useRef<DbOrder | null>(null);
  useLayoutEffect(() => {
    actual.current = detailOrder;
  });
  const setDetailOrder = useCallback((accion: SetStateAction<DbOrder | null>) => {
    const previo = actual.current;
    const siguiente = typeof accion === "function" ? accion(previo) : accion;
    actual.current = siguiente;
    setDetalle(siguiente);
    if (siguiente && siguiente.id !== previo?.id) abrirEnUrl(siguiente.id);
    else if (!siguiente && previo) cerrarEnUrl();
  }, [abrirEnUrl, cerrarEnUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const fetched = await fetchAllOrders();
      setOrders(fetched);
    } catch {
      setLoadError("Error al cargar pedidos. Verifica tu conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Auto-refresh: SSE primario + polling como fallback ───────────────
  // Bug 2026-05-05: el admin no veía nuevos pedidos sin recargar manualmente.
  // QW4 perf (2026-05-16):
  //  - Antes: polling agresivo 15s + SSE → doble notificación + tráfico ×2
  //  - Ahora: SSE primario (push), polling fallback a 60s solo si SSE cae
  //  - Polling se pausa cuando document.hidden → 0 req en background idle
  useEffect(() => {
    let es: EventSource | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let sseReady = false;

    function startPolling(intervalMs: number) {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => { void load(); }, intervalMs);
    }
    function stopPolling() {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

    try {
      es = new EventSource("/api/admin/sse");
      es.addEventListener("open", () => {
        sseReady = true;
        // SSE conectado → polling fallback a 60s
        startPolling(60_000);
      });
      es.addEventListener("error", () => {
        sseReady = false;
        // SSE cayó → polling agresivo a 15s
        startPolling(15_000);
      });
      es.addEventListener("new_order", () => { void load(); });
      es.addEventListener("order_status_changed", () => { void load(); });
    } catch {
      sseReady = false;
      startPolling(15_000);
    }
    // Empezar con poll agresivo hasta que SSE haga "open"
    if (!sseReady) startPolling(15_000);

    // Pausar polling cuando pestaña no visible
    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        void load();
        startPolling(sseReady ? 60_000 : 15_000);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      try { es?.close(); } catch {}
    };
  }, [load]);

  useAbrirFichaAlLlegar<DbOrder>({
    idEnUrl: ficha.id,
    idAbierto: detailOrder?.id ?? null,
    listo: !loading,
    buscar: (id) => orders.find((o) => o.id === id),
    abrir: (o) => { actual.current = o; setDetalle(o); },
    cerrar: () => { actual.current = null; setDetalle(null); },
    noEsta: (id) => {
      const aviso = setTimeout(() => toast.loading("Abriendo el pedido…", { id: ID_AVISO_ABRIR }), 400);
      void traerPedido(id).then((r) => {
        clearTimeout(aviso);
        toast.dismiss(ID_AVISO_ABRIR);
        /* Mientras llegaba, ¿te fuiste a otro pedido o volviste atrás? */
        if (new URLSearchParams(window.location.search).get("pedido") !== id) return;
        if (typeof r === "object") { actual.current = r; setDetalle(r); return; }
        toast.error(r === "no-existe" ? "No encontramos ese pedido: quizá se borró." : "No se pudo abrir el pedido. Revisa tu conexión.");
        cerrarEnUrl();
      });
    },
  });

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.businessLat) setStoreLat(d.businessLat);
        if (d?.businessLon) setStoreLon(d.businessLon);
        if (d?.businessName) setStoreName(d.businessName);
      })
      .catch((err) => console.warn("[useOrdersData] settings fetch failed:", err));
  }, []);

  return {
    orders,
    loading,
    loadError,
    storeLat,
    storeLon,
    storeName,
    detailOrder,
    load,
    setOrders,
    setLoadError,
    setDetailOrder,
  };
}
