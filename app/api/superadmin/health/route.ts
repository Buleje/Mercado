import { NextRequest, NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { HealthDB } from "@/lib/db/health.db";
import { SaludNegocioDB } from "@/lib/db/salud-negocio.db";
import { logger } from "@/lib/logger";
import {
  armarSaludDeNegocios,
  chequeosDeAislamiento,
  estadoGeneral,
  type HealthResponse,
  type OperacionesDeNegocio,
} from "@/lib/superadmin/health-negocios";

// Los tipos viven en lib/superadmin/health-negocios.ts (los comparte el panel); se re-exportan acá
// para no romper a quien los importaba de la ruta.
export type {
  HealthResponse,
  IsolationCheck,
  TenantHealth,
} from "@/lib/superadmin/health-negocios";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Negocios que se miden a la vez: 3 consultas cada uno, así el pool (Supabase ≈ 60) no se agota. */
const LOTE_OPERACIONES = 4;

/**
 * Operaciones de cada negocio (pedidos + ventas POS + libro CTP + trozas) con `SaludNegocioDB`.
 * Un aserradero (Blas) casi no tiene productos ni pedidos pero sí libro CTP y trozas: sin esto salía «vacío».
 * Si un negocio falla queda fuera del mapa (la tarjeta muestra «no medido») y el error va al log.
 */
async function operacionesPorNegocio(
  ids: readonly string[],
  ahora: Date,
): Promise<Map<string, OperacionesDeNegocio>> {
  const desde7 = new Date(ahora.getTime() - 7 * DIA_MS);
  const desde30 = new Date(ahora.getTime() - 30 * DIA_MS);
  const mapa = new Map<string, OperacionesDeNegocio>();
  for (let i = 0; i < ids.length; i += LOTE_OPERACIONES) {
    await Promise.all(
      ids.slice(i, i + LOTE_OPERACIONES).map(async (tenantId) => {
        try {
          const s = await SaludNegocioDB.senalesDeUso(tenantId, desde7, desde30);
          mapa.set(tenantId, { total30d: s.operaciones30d, ultima: s.ultimaOperacion });
        } catch (err) {
          logger.error("[superadmin/health] señales de uso del negocio falló", { tenantId, error: String(err) });
        }
      }),
    );
  }
  return mapa;
}

// ── GET /api/superadmin/health ────────────────────────────────────────────────

/**
 * Lógica completa del health-check, cacheada via Next 16 "use cache".
 * Antes: 5 + 1 + N*5 queries en serie por request (~18s con 10 tenants).
 * Ahora: 2 min revalidate, 30s stale OK, 10 min hard expire — health
 * report no cambia en sub-segundos. Invalidable manualmente con
 * invalidate("superadmin:health") tras un seed/migration grande.
 *
 * Las consultas viven en `HealthDB` (conteos globales) y `SaludNegocioDB` (uso de cada negocio);
 * el armado de tarjetas y el estado general son funciones puras en `lib/superadmin/health-negocios.ts`.
 */
async function getHealthData(): Promise<HealthResponse> {
  "use cache";
  cacheLife({ revalidate: 120, stale: 30, expire: 600 });
  cacheTag("superadmin:health");

  const ahora = new Date();

  // SECURITY 2026-05-07 (audit perf P0-1): conteos por groupBy en vez de N+1 (50 negocios × 5 queries
  // agotaban el pool). Todo se indexa por `Tenant.id` para lookup O(1).
  const [sondas, negocios, conteos] = await Promise.all([
    HealthDB.sondasDeAislamiento(),
    HealthDB.listarNegocios(),
    HealthDB.conteosPorNegocio(new Date(ahora.getTime() - DIA_MS)),
  ]);
  const operaciones = await operacionesPorNegocio(
    negocios.map((t) => t.id),
    ahora,
  );

  const isolationTests = chequeosDeAislamiento(sondas);
  const tenants = armarSaludDeNegocios(negocios, conteos, operaciones);

  return {
    overall: estadoGeneral(tenants, isolationTests),
    tenants,
    isolationTests,
    checkedAt: ahora.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  // Auth: only superadmin (proxy.ts already validates platform session for /api/superadmin/*,
  // but double-check as defense in depth). Auth corre SIEMPRE — solo la data es cacheada.
  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!platformToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await getPlatformSession(platformToken);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const data = await getHealthData();
  return NextResponse.json(data);
}
