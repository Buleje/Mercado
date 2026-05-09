import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { verifyChain, type AuditEntry } from "@/lib/audit/hash-chain";
import { logger } from "@/lib/logger";
import { applyRateLimit, applyRateLimitWithTenant } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/compliance/verify-chain?tenantId=X
 *
 * Ley 29733 — verifica la integridad de la cadena de hashes de audit log
 * para un tenant. Uso exclusivo: auditoría SBS / interna.
 *
 * Auth: superadmin (plataforma) O admin del propio tenant.
 * Rate limit: STRICT (10 req / 15 min por IP) — endpoint costoso.
 */

const QuerySchema = z.object({
  tenantId: z.string().min(1, "tenantId es obligatorio"),
});

// ─── tipos de las filas raw que devuelve la query ──────────────────────────
interface ActivityLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  ipAddress: string | null;
  tenantId: string;
  createdAt: Date;
}

interface DetailJson {
  hash?: string;
  previousHash?: string | null;
  originalDetail?: string;
}

export async function GET(req: NextRequest) {
  // 1. Rate limit IP — STRICT (10 req / 15 min). Endpoint costoso (full
  // table scan de ActivityLog). Validamos antes que query/auth para no gastar
  // ciclos en payloads malformados.
  const rlIp = await applyRateLimit(req, "STRICT", "compliance-verify-chain");
  if (rlIp) return rlIp;

  // 2. Validar query param
  const { searchParams } = req.nextUrl;
  const parsed = QuerySchema.safeParse({ tenantId: searchParams.get("tenantId") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetro inválido", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { tenantId } = parsed.data;

  // 3. Auth — superadmin de plataforma o admin del propio tenant
  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const isSuperadmin = platformToken
    ? !!(await getPlatformSession(platformToken))
    : false;

  let actorUsername = "superadmin";
  if (!isSuperadmin) {
    // Intentar como admin del tenant
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    // Admin solo puede verificar su propio tenant
    if (auth.tenantId !== tenantId) {
      logger.warn("[compliance/verify-chain] Forbidden — tenant mismatch", {
        authTenant: auth.tenantId,
        requestedTenant: tenantId,
        username: auth.username,
      });
      return NextResponse.json(
        { error: "forbidden", message: "No autorizado para este tenant" },
        { status: 403 },
      );
    }
    actorUsername = auth.username;
  }

  // 3.5. Round 8 fix M002 — segunda barrera por tenantId (independiente de IP).
  // Limita 30 verificaciones/hora por tenant aunque atacante rote IPs.
  // Solo aplicable POST-auth para que tenantId sea confiable (no header).
  const rlTenant = applyRateLimitWithTenant(
    req,
    "STRICT",
    tenantId,
    "compliance-verify-chain",
    { maxReqs: 30, windowSec: 60 * 60 },
  );
  if (rlTenant) return rlTenant;

  logger.info("[compliance/verify-chain] Iniciando verificación", { tenantId, actor: actorUsername });

  // 4. Fetch de entradas L29733 ordenadas ASC (más antigua primero)
  let rows: ActivityLogRow[];
  try {
    rows = (await prisma.$queryRawUnsafe(
      `SELECT "id", "action", "entity", "entityId", "detail",
              "user", "ipAddress", "tenantId", "createdAt"
       FROM "ActivityLog"
       WHERE "tenantId" = $1
         AND "entity" LIKE '[L29733]%'
       ORDER BY "createdAt" ASC`,
      tenantId,
    )) as ActivityLogRow[];
  } catch (err) {
    logger.error("[compliance/verify-chain] Error al obtener entradas", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error interno al leer audit log" }, { status: 500 });
  }

  // 5. Chain vacía — respuesta inmediata
  if (rows.length === 0) {
    return NextResponse.json({
      tenantId,
      totalEntries: 0,
      verifiedEntries: 0,
      brokenAt: null,
      firstEntry: null,
      lastEntry: null,
      chainStatus: "empty",
    });
  }

  // 6. Mapear filas a AuditEntry — el hash/previousHash vive en detail (JSON)
  const entries: AuditEntry[] = rows.map((row) => {
    let detail: DetailJson = {};
    try {
      detail = JSON.parse(row.detail) as DetailJson;
    } catch {
      // detail no es JSON válido — hash ausente, forzará break en verifyChain
    }
    return {
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      detail: detail.originalDetail ?? row.detail,
      user: row.user,
      ipAddress: row.ipAddress,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      previousHash: detail.previousHash ?? null,
      hash: detail.hash ?? "",   // string vacío fuerza mismatch → brokenAt detectable
    };
  });

  // 7. Verificar cadena
  const result = verifyChain(entries);

  if (!result.valid) {
    logger.error("[compliance/verify-chain] Cadena rota detectada", {
      tenantId,
      brokenAt: result.brokenAt,
      totalEntries: entries.length,
    });
  }

  const chainStatus = result.valid ? "valid" : "broken";
  const verifiedEntries = result.valid
    ? entries.length
    : (result.brokenAt ?? 0);

  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];

  // Round 7 fix H001 — Ley 29733: auditar el propio acceso al chain.
  // Sin esto, lecturas del audit log no quedaban registradas (solo logger.info →
  // stdout que rota). Ahora cada read deja entrada permanente en ActivityLog.
  void logActivity(
    "READ_AUDIT_CHAIN",
    "[L29733] ChainVerification",
    JSON.stringify({
      totalEntries: entries.length,
      verifiedEntries,
      chainStatus,
      isSuperadmin,
    }),
    undefined,
    actorUsername,
    undefined,
    tenantId,
  );

  // Round 7 fix M001 — gate del detalle por rol.
  // Antes: brokenAt + hashes se devolvían a cualquier admin → feedback signal
  // para tampering iterativo. Ahora solo superadmin (auditor SBS) ve detalle.
  if (!isSuperadmin) {
    return NextResponse.json({
      tenantId,
      totalEntries: entries.length,
      chainStatus,
    });
  }

  return NextResponse.json({
    tenantId,
    totalEntries: entries.length,
    verifiedEntries,
    brokenAt: result.brokenAt ?? null,
    firstEntry: { createdAt: firstRow.createdAt, hash: entries[0].hash },
    lastEntry: { createdAt: lastRow.createdAt, hash: entries[entries.length - 1].hash },
    chainStatus,
  });
}
