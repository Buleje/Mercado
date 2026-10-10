"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

export type NotificationItem = {
  id: string;
  tenantId: string;
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  body: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationFilter = "all" | "unread" | "high";

const API_BASE = "/api/notification-center";
const POLL_INTERVAL = 30_000; // 30 seconds
/**
 * Cuántas pedir. Cerrado, la campana sólo necesita el total sin leer (viene en
 * `X-Unread-Count`): pedir 50 filas cada 30 s era traer la lista entera para
 * tirarla. Abierto, el tope del endpoint (100) para que las pestañas cuenten más.
 */
const LIMITE_CERRADO = 1;
const LIMITE_ABIERTO = 100;

/** `abierto`: el centro de notificaciones está a la vista (pide la lista completa). */
export function useNotificationCenter(abierto = true) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  /** La última lectura falló: la lista vacía NO es «todo al día». */
  const [cargaFallida, setCargaFallida] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limite = abierto ? LIMITE_ABIERTO : LIMITE_CERRADO;
  /**
   * Sube con cada «leída»: una lectura que salió ANTES llega con el aviso
   * todavía sin leer y pisaba lo marcado (medido 10-10: el servidor ya decía
   * 123 y el modal volvía a 124). Esa respuesta se descarta.
   */
  const versionRef = useRef(0);

  const fetchNotifications = useCallback(async () => {
    const version = versionRef.current;
    try {
      const params = new URLSearchParams({ limit: String(limite) });
      if (filter === "unread") params.set("unread", "true");
      if (filter === "high") params.set("severity", "HIGH");

      const res = await fetch(`${API_BASE}?${params.toString()}`);
      if (version !== versionRef.current) return;
      if (!res.ok) {
        setCargaFallida(true);
        return;
      }

      const data: NotificationItem[] = await res.json();
      const headerCount = res.headers.get("X-Unread-Count");
      if (version !== versionRef.current) return;

      setNotifications(data);
      setUnreadCount(
        headerCount ? parseInt(headerCount, 10) : data.filter((n) => !n.readAt).length,
      );
      setCargaFallida(false);
    } catch {
      // Se reintenta en el próximo sondeo; mientras, el modal dice que no cargó.
      if (version === versionRef.current) setCargaFallida(true);
    } finally {
      // Una respuesta descartada no apaga el esqueleto: la vigente todavía viene.
      if (version === versionRef.current) setIsLoading(false);
    }
  }, [filter, limite]);

  /**
   * Al abrir (o cambiar el filtro) la lista que hay es la corta del sondeo: esqueleto hasta la nueva.
   * La versión sube SIEMPRE: la consulta de 1 fila que salió con el modal cerrado, si llegaba
   * después de la de 100, dejaba 1 aviso a la vista hasta el sondeo siguiente (30 s).
   */
  useEffect(() => {
    versionRef.current += 1;
    if (!abierto) return;
    setIsLoading(true);
    setNotifications([]);
  }, [abierto, filter]);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();

    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  /**
   * PATCH con el token CSRF: sin él, `proxy.ts` respondía 403 y como `fetch` no
   * lanza por un 403, el «leído» sólo vivía en pantalla hasta el sondeo
   * siguiente (medido 10-10: PATCH sin token = 403 «CSRF token invalido», y
   * los 124 avisos de main y los 136 de Blas seguían sin leer). Si el
   * servidor no confirma, se relee la verdad.
   */
  const marcar = useCallback(
    async (url: string) => {
      versionRef.current += 1;
      try {
        const res = await fetch(url, { method: "PATCH", headers: csrfHeaders() });
        if (!res.ok) {
          logger.warn("[notificaciones] no se guardó el leído", { url, status: res.status });
        }
      } catch (err) {
        logger.warn("[notificaciones] no se guardó el leído", { url, error: String(err) });
      }
      // Guardado o no, se relee la verdad (y reemplaza la lectura descartada).
      void fetchNotifications();
    },
    [fetchNotifications],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      await marcar(`${API_BASE}/${id}/read`);
    },
    [marcar],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    setUnreadCount(0);
    await marcar(`${API_BASE}/read-all`);
  }, [marcar]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    cargaFallida,
    filter,
    setFilter,
    markAsRead,
    markAllRead,
    refetch,
  };
}
