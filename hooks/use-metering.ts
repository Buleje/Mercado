"use client";

/**
 * use-metering — hook cliente para consumir /api/billing/meter
 *
 * Estrategia de fetch manual con cache 60s (sin depender de react-query
 * que no está instalado). Usa fetch + SWR-like manual state.
 *
 * Contrato del endpoint GET /api/billing/meter:
 *   Response: { tenantId, from, to, usage: Record<MeteredEvent, number>, plan? }
 *
 * CLAUDE.md regla #6: el backend entrega números pre-computados.
 * No calcular totales aquí.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { MeteringSnapshot } from "@/components/admin/unified/MeteringCard/types";
import type { MeteredEvent } from "@/lib/billing/metering";
import { METERED_EVENTS } from "@/lib/billing/metering";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface UseMeteringOptions {
  /** Período desde (ISO 8601). Opcional — default: mes actual. */
  from?: string;
  /** Período hasta (ISO 8601). Opcional — default: mes actual. */
  to?: string;
  /** Intervalo de revalidación en ms. Default: 60_000 (60s). */
  refreshIntervalMs?: number;
  /** Si es false, no ejecuta el fetch. Default: true. */
  enabled?: boolean;
}

export interface UseMeteringResult {
  snapshot: MeteringSnapshot | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Fuerza un refetch inmediato ignorando caché. */
  refresh: () => void;
}

// ─── Plan por defecto ─────────────────────────────────────────────────────────

type BillingPlan = "free" | "starter" | "pro" | "enterprise";

const FALLBACK_QUOTAS = Object.fromEntries(
  METERED_EVENTS.map((e) => [e, { limit: Infinity, alertAt: 1.0 }]),
) as MeteringSnapshot["quotas"];

function buildEmptySnapshot(tenantId: string): MeteringSnapshot {
  const now = new Date();
  return {
    tenantId,
    plan: "free",
    period: {
      from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    },
    usage: Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as Record<MeteredEvent, number>,
    quotas: FALLBACK_QUOTAS,
    estimatedCostUsd: 0,
    sparklines: Object.fromEntries(METERED_EVENTS.map((e) => [e, Array(7).fill(0)])) as Record<MeteredEvent, number[]>,
  };
}

// Cache simple en módulo para deduplicar requests simultáneos
const CACHE_TTL_MS = 60_000;
interface CacheEntry {
  snapshot: MeteringSnapshot;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();

function buildCacheKey(tenantId: string, from?: string, to?: string): string {
  return `${tenantId}|${from ?? ""}|${to ?? ""}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMeteringSnapshot(
  tenantId: string,
  options: UseMeteringOptions = {},
): UseMeteringResult {
  const {
    from,
    to,
    refreshIntervalMs = CACHE_TTL_MS,
    enabled = true,
  } = options;

  const [snapshot, setSnapshot] = useState<MeteringSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Ref para evitar actualizaciones de estado tras unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const cacheKey = buildCacheKey(tenantId, from, to);

  const fetchSnapshot = useCallback(async (forceRefresh = false) => {
    if (!tenantId || !enabled) return;

    // Servir desde caché si está vigente
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        if (mountedRef.current) setSnapshot(cached.snapshot);
        return;
      }
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const url = new URL("/api/billing/meter", window.location.origin);
      if (from) url.searchParams.set("from", from);
      if (to)   url.searchParams.set("to", to);

      const res = await fetch(url.toString(), {
        headers: { "Cache-Control": "no-cache" },
        credentials: "same-origin",
      });

      if (!res.ok) {
        throw new Error(`Error al obtener métricas: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as {
        tenantId: string;
        from: string;
        to: string;
        usage: Record<MeteredEvent, number>;
        plan?: BillingPlan;
      };

      const fetched: MeteringSnapshot = {
        tenantId: data.tenantId ?? tenantId,
        plan: data.plan ?? "free",
        period: { from: data.from, to: data.to },
        usage: data.usage ?? buildEmptySnapshot(tenantId).usage,
        quotas: FALLBACK_QUOTAS,
        estimatedCostUsd: 0,  // el RSC padre calcula el costo — aquí es solo preview
        sparklines: Object.fromEntries(
          METERED_EVENTS.map((e) => [e, Array(7).fill(0)]),
        ) as Record<MeteredEvent, number[]>,
      };

      cache.set(cacheKey, { snapshot: fetched, fetchedAt: Date.now() });

      if (mountedRef.current) {
        setSnapshot(fetched);
        setError(null);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (mountedRef.current) {
        setError(e);
        // En error, devolvemos snapshot vacío para no romper la UI
        setSnapshot(buildEmptySnapshot(tenantId));
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [tenantId, from, to, enabled, cacheKey]);

  // Fetch inicial
  useEffect(() => {
    void fetchSnapshot(false);
  }, [fetchSnapshot]);

  // Revalidación periódica
  useEffect(() => {
    if (!enabled || refreshIntervalMs <= 0) return;
    const id = setInterval(() => void fetchSnapshot(true), refreshIntervalMs);
    return () => clearInterval(id);
  }, [enabled, refreshIntervalMs, fetchSnapshot]);

  const refresh = useCallback(() => {
    cache.delete(cacheKey);
    void fetchSnapshot(true);
  }, [cacheKey, fetchSnapshot]);

  return {
    snapshot,
    isLoading,
    isError: error !== null,
    error,
    refresh,
  };
}

// Alias con nombre más corto para conveniencia
export const useMeteringData = useMeteringSnapshot;
