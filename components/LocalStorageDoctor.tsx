"use client";

/**
 * LocalStorageDoctor — componente invisible que al mount normaliza las claves
 * legacy de localStorage. Corrige datos corruptos acumulados en usuarios reales
 * antes de que el resto de la app los lea.
 *
 * Monta una vez en el root layout (o marketplace layout). No renderiza nada.
 *
 * Qué cura:
 *   - `buleje-recently-viewed`   → RecentlyViewedArraySchema (filtra entries
 *     inválidas, coerce price string → number).
 *   - `buleje-selling-fast`      → SellingFastSchema (drop si no es record
 *     válido de timestamps).
 *   - `buleje-compare`           → CompareStoreSchema (drop si shape inválida).
 *
 * Estrategia: lee raw, aplica schema.safeParse, si falla limpia la clave; si
 * parsea pero la serialización difiere, reescribe normalizado. Fire-and-forget.
 */

import { useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ZodType } from "zod";
import { RecentlyViewedArraySchema } from "@/lib/validations/recently-viewed.schema";
import {
  SellingFastSchema,
  CompareStoreSchema,
  MarketplaceRecentViewedArraySchema,
} from "@/lib/validations/local-storage-extra.schema";

type HealOutcome = "noop" | "normalized" | "dropped-corrupt-json" | "dropped-invalid-shape";

interface HealEntry {
  key: string;
  schema: ZodType<unknown>;
}

const ENTRIES: HealEntry[] = [
  { key: "buleje-recently-viewed", schema: RecentlyViewedArraySchema },
  { key: "buleje-selling-fast", schema: SellingFastSchema },
  { key: "buleje-compare", schema: CompareStoreSchema },
  // Marketplace multi-tenant recent-viewed (v1) — distinta del legacy
  // `buleje-recently-viewed` (single-tenant). Mismo bug de price string
  // acumulado de versiones previas.
  { key: "marketplace:recent-viewed:v1", schema: MarketplaceRecentViewedArraySchema },
];

function healKey(entry: HealEntry): HealOutcome {
  const raw = localStorage.getItem(entry.key);
  if (!raw) return "noop";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(entry.key);
    return "dropped-corrupt-json";
  }
  const result = entry.schema.safeParse(parsed);
  if (!result.success) {
    localStorage.removeItem(entry.key);
    return "dropped-invalid-shape";
  }
  const normalized = JSON.stringify(result.data);
  if (normalized !== raw) {
    localStorage.setItem(entry.key, normalized);
    return "normalized";
  }
  return "noop";
}

/** Reporte fire-and-forget al server — solo si hubo acción real sobre alguna key.
 * Ingesta opcional en /api/health/storage (si existe). Silencioso si no. */
function reportOutcomes(outcomes: Record<string, HealOutcome>): void {
  const acted = Object.entries(outcomes).filter(([, o]) => o !== "noop");
  if (acted.length === 0) return;
  // console.warn visible en dev; en prod va al forward-logs pipeline.
  if (process.env.NODE_ENV !== "production") {
    console.warn("[LocalStorageDoctor] saneó claves:", Object.fromEntries(acted));
  }
  // Opcional: enviar métrica al server para tracking de data quality en prod.
  try {
    fetch("/api/health/storage", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ outcomes: Object.fromEntries(acted) }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget — endpoint puede no existir */ });
  } catch {
    /* ignore */
  }
}

export default function LocalStorageDoctor() {
  useEffect(() => {
    const outcomes: Record<string, HealOutcome> = {};
    for (const entry of ENTRIES) {
      try {
        outcomes[entry.key] = healKey(entry);
      } catch {
        outcomes[entry.key] = "noop";
      }
    }
    reportOutcomes(outcomes);
  }, []);
  return null;
}
