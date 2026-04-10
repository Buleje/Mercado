"use client";
/* eslint-disable */
/* eslint-disable react-compiler/react-compiler */

import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SSEEventType =
  | "new_order"
  | "order_status_changed"
  | "low_stock"
  | "payment"
  | "delivery"
  | "fiado_vencido";

export interface SSEEvent {
  type: SSEEventType;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

interface UseAdminSSEResult {
  lastEvent: SSEEvent | null;
  isConnected: boolean;
  reconnectCount: number;
}

const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECTS = 10;

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useAdminSSE
 * Connects to /api/admin/sse and keeps the connection alive.
 * Auto-reconnects after RECONNECT_DELAY_MS if the stream drops.
 * Cleans up EventSource on unmount.
 */
export function useAdminSSE(): UseAdminSSEResult {
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Close previous connection if any
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource("/api/admin/sse");
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setReconnectCount(0);
    };

    // Named events emitted by emitAdminSSE()
    const EVENTS: SSEEventType[] = [
      "new_order",
      "order_status_changed",
      "low_stock",
      "payment",
      "delivery",
      "fiado_vencido",
    ];

    EVENTS.forEach((type) => {
      es.addEventListener(type, (e: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data) as Partial<SSEEvent>;
          setLastEvent({
            type,
            message: data.message ?? "",
            timestamp: data.timestamp ?? new Date().toISOString(),
            meta: data.meta,
          });
        } catch {
          // malformed payload — ignore
        }
      });
    });

    es.onerror = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      es.close();
      esRef.current = null;

      setReconnectCount((prev) => {
        if (prev >= MAX_RECONNECTS) return prev;
        timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        return prev + 1;
      });
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  return { lastEvent, isConnected, reconnectCount };
}
