import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION } from "@/lib/session";
import type { AdminRole, SessionPayload } from "@/lib/session";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";

/**
 * Verify the admin session from an API request.
 * Returns the session payload (role, username, tenantId) if valid,
 * or a 401/403 NextResponse.
 *
 * Usage:
 *   const auth = await requireAdmin(req, ["admin", "cajero"]);
 *   if (auth instanceof NextResponse) return auth;
 *   const db = prismaForTenant(auth.tenantId);
 */
export async function requireAdmin(
  req: NextRequest,
  allowedRoles?: AdminRole[],
): Promise<SessionPayload | NextResponse> {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? 
             req.headers.get("x-real-ip") ?? 
             "unknown";
  const path = req.nextUrl.pathname;
  const method = req.method;

  if (!token) {
    logger.warn("[AUTH] Unauthorized", { method, path, ip });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await getSessionPayload(token);
  if (!payload) {
    logger.warn("[AUTH] Invalid/expired token", { method, path, ip });
    return NextResponse.json({ error: "session expired" }, { status: 401 });
  }

  // SECURITY 2026-05-07 (pentest F1): chequear blacklist de jti revocados en logout.
  // Protege contra tokens en vuelo usados después de cerrar sesión.
  if (payload.jti && cacheStore.get(`revoked-access:${payload.jti}`)) {
    logger.warn("[AUTH] Revoked token jti", { username: payload.username, jti: payload.jti, method, path, ip });
    return NextResponse.json({ error: "session revoked" }, { status: 401 });
  }

  // Audit 2026-05-17 05-P1-2: defense-in-depth — rechazar role="superadmin"
  // en JWT de tipo admin SESSION cookie. Los superadmins reales tienen
  // PLATFORM_SESSION separada (lib/platform-session.ts). Si un atacante
  // forjara role:"superadmin" en un JWT admin, ANTES pasaba por
  // managementTier y obtenía acceso total. AHORA → 403 inmediato.
  if (payload.role === "superadmin") {
    logger.warn("[AUTH] superadmin role in admin SESSION — refusing (use PLATFORM_SESSION)", {
      username: payload.username,
      method,
      path,
      ip,
    });
    return NextResponse.json(
      { error: "forbidden", message: "superadmin debe usar /superadmin/login (sesión de plataforma)" },
      { status: 403 },
    );
  }

  // Management-tier bypass — roles con visibilidad total del tenant:
  //   admin (tenant) > owner (dueño) > manager (encargado)
  // Deben poder acceder a cualquier endpoint admin sin que cada route los
  // liste explicitamente en allowedRoles. Evita cascadas de 403 para dueño/
  // encargado. cajero/almacenero/analista siguen chequeados explicitamente
  // porque su scope es limitado. superadmin removido — ya rechazado arriba.
  const managementTier: readonly AdminRole[] = ["admin", "owner", "manager"];
  const isManagementTier = managementTier.includes(payload.role);

  if (allowedRoles && !isManagementTier && !allowedRoles.includes(payload.role)) {
    logger.warn("[AUTH] Forbidden", { username: payload.username, role: payload.role, method, path });
    return NextResponse.json(
      { error: "forbidden", message: `Requires: ${allowedRoles.join(", ")}` },
      { status: 403 }
    );
  }

  // The middleware sets x-tenant-id per-request based on JWT / cookie / Referer.
  // The JWT's tenantId is always the canonical CUID (set during login/impersonation).
  // The header may contain a slug (from Referer) which doesn't match DB IDs.
  // RULE: for DB queries, always prefer the JWT's tenantId (CUID).
  const headerTenantId = req.headers.get("x-tenant-id");
  // CRITICAL FIX 2026-05-11 (audit P1-1): nunca defaultear silenciosamente a
  // "main". Si JWT y header están vacíos, retornar 401 para forzar al cliente
  // a re-autenticarse en vez de operar como tenant principal por error.
  const effectiveTenantId = payload.tenantId || headerTenantId;
  if (!effectiveTenantId) {
    logger.error("[AUTH] No tenantId in JWT or header — refusing to default to 'main'", {
      username: payload.username,
      role: payload.role,
      method,
      path,
      ip,
    });
    return NextResponse.json(
      { error: "unauthorized", message: "Sesión sin tenant — vuelve a iniciar sesión" },
      { status: 401 },
    );
  }

  if (headerTenantId && headerTenantId !== payload.tenantId) {
    // Mismatch between middleware header and JWT. This happens when:
    // - Referer slug "demo" doesn't match JWT CUID "cmnl82b..." (same tenant, different format)
    // - Multi-tab: shared cookie has a different tenant than the URL
    // In ALL cases, the JWT's tenantId is the canonical CUID and the safest for DB queries.
    //
    // Permitimos a TODO management tier (admin/owner/manager/superadmin) seguir
    // operando bajo su tenantId real del JWT. Antes solo "admin" estricto pasaba,
    // y eso causaba 403 falsos para owner/manager.
    if (isManagementTier) {
      logger.info("[AUTH] Tenant context — using JWT CUID over header", {
        username: payload.username,
        role: payload.role,
        jwtTenant: payload.tenantId,
        headerTenant: headerTenantId,
        method,
        path,
      });
      // Keep JWT's tenantId (CUID) — DO NOT override with header that may be a slug
      return { ...payload };
    }

    // Non-privileged role trying to access a different tenant → 403
    logger.warn("[AUTH] Tenant mismatch — forbidden", {
      username: payload.username,
      role: payload.role,
      jwtTenant: payload.tenantId,
      headerTenant: headerTenantId,
      method,
      path,
      ip,
    });
    return NextResponse.json(
      { error: "forbidden", message: "Tenant mismatch" },
      { status: 403 },
    );
  }

  logger.debug("[AUTH] OK", {
    username: payload.username,
    role: payload.role,
    tenantId: effectiveTenantId,
    method,
    path,
  });

  return { ...payload, tenantId: effectiveTenantId };
}

/**
 * Soft-auth variant: returns the session payload if the request has a valid
 * admin cookie, or `null` if the caller is anonymous. Never returns 401/403.
 *
 * Useful for endpoints that serve BOTH the public storefront AND authenticated
 * admin clients with different field shapes (e.g. storefront gets only active
 * products without costPrice/stock; admin gets the full record).
 */
export async function tryAdmin(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await getSessionPayload(token);
  if (!payload) return null;

  const headerTenantId = req.headers.get("x-tenant-id");
  // JWT's tenantId is always the canonical CUID — prefer it over header
  // which may contain a slug from Referer.
  // CRITICAL FIX 2026-05-11 (audit P1-1): si ambos son null, devolver null
  // (sesión inválida) en vez de defaultear a "main" silenciosamente.
  const effectiveTenantId = payload.tenantId || headerTenantId;
  if (!effectiveTenantId) return null;
  return { ...payload, tenantId: effectiveTenantId };
}
