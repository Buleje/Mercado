"use client";

/**
 * useEnabledSpecs — hook que consulta las especializaciones habilitadas
 * para el tenant actual (ADR-124).
 *
 * Real-time sync (2026-05-28 v2):
 * - TTL bajado a 30s (era 5min — demasiado para feedback inmediato).
 * - Escucha BroadcastChannel "buleje:specs" — superadmin toggle dispara
 *   mensaje y todos los tabs del mismo browser refetchean al instante.
 * - Escucha visibilitychange/focus: al volver al tab admin re-fetch si
 *   el cache está vencido (cross-browser fallback).
 * - storage event para cross-tab (mismo dominio, mismo browser, sin BC).
 *
 * Falla cerrado: ante cualquier error retorna set vacío.
 *
 * Usage:
 *   const { enabledModuleIds, isLoading } = useEnabledSpecs();
 *   if (!enabledModuleIds.has("ctp-libro-operaciones")) {
 *     // ocultar este tab del sidebar
 *   }
 *
 * Trigger remoto (desde superadmin tras toggle):
 *   broadcastSpecsChanged(); // ver export más abajo
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import {
  MODULO_A_MEDIDA,
  type EnchufeId,
  type NegocioDePiezas,
  type PiezaAsignada,
} from "@/extensiones/_contrato";

interface SpecResponse {
  keys: string[];
  moduleIds: string[];
  /** ADR-457: las piezas prendidas del negocio (opciones ya validadas en el servidor). */
  piezas?: PiezaAsignada[];
  /** ADR-457: el negocio de la sesión, para el `ContextoPieza`. `null` si no hay piezas. */
  negocio?: NegocioDePiezas | null;
}

interface UseEnabledSpecsResult {
  enabledKeys: Set<string>;
  enabledModuleIds: Set<string>;
  /** ADR-457: todas las piezas prendidas del negocio, en orden. */
  piezas: PiezaAsignada[];
  negocio: NegocioDePiezas | null;
  isLoading: boolean;
  refresh: () => void;
}

const CACHE_KEY = "buleje:enabled-specs";
const BROADCAST_CHANNEL = "buleje:specs";
const TTL_MS = 30 * 1000; // 30s — feedback rápido sin paliza al endpoint

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

  const refresh = useCallback(() => {
    try { sessionStorage.removeItem(CACHE_KEY); } catch {}
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    // 2026-05-28 v3 fix: SIEMPRE re-fetch al mount. El cache es solo para
    // evitar request en navegaciones SPA dentro del admin — el primer render
    // tras login/reload debe traer data fresca (sino: superadmin toggleó →
    // admin recarga → seguía viendo cache viejo de la sesión anterior).
    // Cache se aplica como initial value (UI inmediato) pero igual fetch.
    let cancelled = false;
    setIsLoading(true);
    // cachedJson con clave por `version`: varios componentes montan este hook a
    // la vez → antes cada uno disparaba su /api/admin/me/specializations (2×).
    // La clave `?v=${version}` preserva el "siempre fresco": un bump de versión
    // (toggle del superadmin vía SSE) genera key nueva = fetch real; los mounts
    // concurrentes con la misma versión comparten 1 request. Perf 2026-05-29.
    cachedJson<SpecResponse>(`/api/admin/me/specializations?v=${version}`, 5000, { cache: "no-store" })
      .then((d) => {
        if (cancelled) return;
        const dd = d ?? { keys: [], moduleIds: [] };
        setData(dd);
        writeCache(dd);
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

  // ── Real-time invalidation ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1) BroadcastChannel — el superadmin dispara post-toggle. Todos los
    //    tabs admin del MISMO browser refetchean inmediato.
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel(BROADCAST_CHANNEL);
        bc.addEventListener("message", (ev) => {
          if (ev?.data?.type === "spec-toggled") {
            refresh();
          }
        });
      } catch {
        // fallback silently
      }
    }

    // 2) visibilitychange: al volver al tab, si cache caducó re-fetch.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!readCache()) refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // 3) focus: paranoia extra (algunos browsers no disparan visibility).
    const onFocus = () => {
      if (!readCache()) refresh();
    };
    window.addEventListener("focus", onFocus);

    // 4) storage — fallback cross-tab cuando BroadcastChannel no está
    //    disponible (Safari 14, viejos browsers).
    const onStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY && e.newValue === null) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      bc?.close();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return {
    enabledKeys: new Set(data?.keys ?? []),
    enabledModuleIds: new Set(data?.moduleIds ?? []),
    piezas: data?.piezas ?? [],
    negocio: data?.negocio ?? null,
    isLoading,
    refresh,
  };
}

// ─── Piezas (ADR-457) ───────────────────────────────────────────────────────

export interface PiezasDelNegocio {
  negocio: NegocioDePiezas | null;
  piezas: PiezaAsignada[];
}

const sinPiezas = (): PiezasDelNegocio => ({ negocio: null, piezas: [] });

function delEnchufe(r: SpecResponse | null, enchufe?: EnchufeId): PiezasDelNegocio {
  const piezas = Array.isArray(r?.piezas) ? r.piezas : [];
  return {
    negocio: r?.negocio ?? null,
    piezas: enchufe ? piezas.filter((p) => p.enchufe === enchufe) : piezas,
  };
}

/**
 * Las piezas prendidas del negocio en un enchufe (p. ej. `"panel.pestana"`),
 * del mismo pedido que ya hace `useEnabledSpecs` (sin un fetch más). Se
 * refresca sola cuando el superadmin cambia algo (`broadcastSpecsChanged`).
 */
export function usePiezas(enchufe: EnchufeId): PiezasDelNegocio & { isLoading: boolean } {
  const { piezas, negocio, isLoading } = useEnabledSpecs();
  const delMio = useMemo(() => piezas.filter((p) => p.enchufe === enchufe), [piezas, enchufe]);
  return { negocio, piezas: delMio, isLoading };
}

/**
 * Lo mismo pero fuera de React (la impresión de la guía no es un hook). Usa la
 * copia de la sesión si tiene menos de 30 s; si no, pregunta. Falla cerrado:
 * ante cualquier error, ninguna pieza — la guía sale como siempre.
 */
export async function piezasDelNegocio(enchufe?: EnchufeId): Promise<PiezasDelNegocio> {
  try {
    const enCache = readCache();
    if (enCache) return delEnchufe(enCache, enchufe);
    const r = await cachedJson<SpecResponse>("/api/admin/me/specializations?v=piezas", 5000, { cache: "no-store" });
    if (r) writeCache({ keys: r.keys ?? [], moduleIds: r.moduleIds ?? [], piezas: r.piezas ?? [], negocio: r.negocio ?? null });
    return delEnchufe(r, enchufe);
  } catch {
    // Sin respuesta = sin piezas: lo normal sigue funcionando.
    return sinPiezas();
  }
}

/**
 * Dispara invalidation en todos los tabs del browser via BroadcastChannel.
 * Llamar desde superadmin DESPUÉS de un toggle exitoso.
 * Falla silent si BroadcastChannel no disponible.
 */
export function broadcastSpecsChanged(payload?: {
  tenantId?: string;
  specKey?: string;
  enabled?: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.postMessage({ type: "spec-toggled", ...payload });
    bc.close();
  } catch {
    // silent
  }
}

/**
 * Lista de moduleIds que SOLO se muestran si su spec está habilitada.
 * Mantener sincronizado con lib/specializations.ts SPECIALIZATIONS.
 */
export const SPEC_GATED_MODULE_IDS = new Set<string>([
  "ctp-libro-operaciones",
  "forestal-lotes",
  "loth-libro-operaciones",
  "gtf-emisor",
  "forestal-herramientas",
  "forestal-tramites",
  "cacao-acopio",
  "recetas-medicas",
  "cuero-trazabilidad",
  // ADR-457: la pestaña «A medida» aparece si el negocio tiene ≥1 pieza en
  // `panel.pestana` (el endpoint suma el módulo a `moduleIds`).
  MODULO_A_MEDIDA,
]);
