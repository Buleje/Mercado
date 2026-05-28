"use client";

/**
 * useEnabledSpecs — hook que consulta las especializaciones habilitadas
 * para el tenant actual (ADR-124).
 *
 * Cachea en sessionStorage por 5 min para evitar request en cada render.
 * Si el endpoint falla, retorna un set vacío (falla cerrado — mejor
 * ocultar el tab que mostrarlo mal).
 *
 * Usage:
 *   const { enabledModuleIds, isLoading } = useEnabledSpecs();
 *   if (!enabledModuleIds.has("ctp-libro-operaciones")) {
 *     // ocultar este tab del sidebar
 *   }
 */
import { useEffect, useState } from "react";

interface SpecResponse {
  keys: string[];
  moduleIds: string[];
}

interface UseEnabledSpecsResult {
  enabledKeys: Set<string>;
  enabledModuleIds: Set<string>;
  isLoading: boolean;
  refresh: () => void;
}

const CACHE_KEY = "buleje:enabled-specs";
const TTL_MS = 5 * 60 * 1000; // 5 min

interface CacheEntry {
  ts: number;
  data: SpecResponse;
}

function readCache(): SpecResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: SpecResponse): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data } satisfies CacheEntry),
    );
  } catch {
    // sessionStorage full / disabled — silent fail
  }
}

export function useEnabledSpecs(): UseEnabledSpecsResult {
  const [data, setData] = useState<SpecResponse | null>(() => readCache());
  const [isLoading, setIsLoading] = useState(!data);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cached = readCache();
    if (cached) {
      setData(cached);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetch("/api/admin/me/specializations", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { keys: [], moduleIds: [] }))
      .then((d: SpecResponse) => {
        if (cancelled) return;
        setData(d);
        writeCache(d);
      })
      .catch(() => {
        if (!cancelled) setData({ keys: [], moduleIds: [] });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return {
    enabledKeys: new Set(data?.keys ?? []),
    enabledModuleIds: new Set(data?.moduleIds ?? []),
    isLoading,
    refresh: () => {
      sessionStorage.removeItem(CACHE_KEY);
      setVersion((v) => v + 1);
    },
  };
}

/**
 * Lista de moduleIds que SOLO se muestran si su spec está habilitada.
 * Mantener sincronizado con lib/specializations.ts SPECIALIZATIONS.
 */
export const SPEC_GATED_MODULE_IDS = new Set<string>([
  "ctp-libro-operaciones",
  "gtf-emisor",
  "recetas-medicas",
  "cuero-trazabilidad",
]);
